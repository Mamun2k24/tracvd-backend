import { Order, Product } from "../model/index.model.js";

const DAY_MS = 86400000;

const dhakaBoundary = (value, end = false) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d + (end ? 1 : 0), -6));
};

const salesMatch = ({ from, to, status, paymentStatus }) => {
  const match = {};
  const start = dhakaBoundary(from);
  const end = dhakaBoundary(to, true);
  if (start || end)
    match.createdAt = {
      ...(start && { $gte: start }),
      ...(end && { $lt: end }),
    };
  if (status && status !== "all") match.orderStatus = status;
  if (paymentStatus && paymentStatus !== "all")
    match.paymentStatus = paymentStatus;
  return match;
};

// GET /api/reports/sales
export const getSalesReport = async (req, res) => {
  try {
    const {
      from,
      to,
      status = "delivered",
      paymentStatus = "all",
      groupBy = "day",
    } = req.query;
    const match = salesMatch({ from, to, status, paymentStatus });
    const periodFormat = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

    const [summaryRows, rows, topProducts, paymentMethods] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            grossSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
            shipping: { $sum: { $ifNull: ["$shippingCost", 0] } },
            discount: { $sum: { $ifNull: ["$discountAmount", 0] } },
            itemsSold: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$products", []] },
                    as: "p",
                    in: { $ifNull: ["$$p.quantity", 0] },
                  },
                },
              },
            },
            customers: {
              $addToSet: {
                $ifNull: [
                  "$customer.mobile",
                  { $ifNull: ["$guestId", "$user"] },
                ],
              },
            },
          },
        },
      ]),
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: periodFormat,
                date: "$createdAt",
                timezone: "Asia/Dhaka",
              },
            },
            orders: { $sum: 1 },
            grossSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
            shipping: { $sum: { $ifNull: ["$shippingCost", 0] } },
            discount: { $sum: { $ifNull: ["$discountAmount", 0] } },
            itemsSold: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$products", []] },
                    as: "p",
                    in: { $ifNull: ["$$p.quantity", 0] },
                  },
                },
              },
            },
            customers: {
              $addToSet: {
                $ifNull: [
                  "$customer.mobile",
                  { $ifNull: ["$guestId", "$user"] },
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: match },
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.product",
            quantity: { $sum: { $ifNull: ["$products.quantity", 0] } },
            sales: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$products.quantity", 0] },
                  {
                    $ifNull: [
                      "$products.finalPrice",
                      { $ifNull: ["$products.price", 0] },
                    ],
                  },
                ],
              },
            },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            productId: "$_id",
            productName: {
              $ifNull: ["$product.productName", "Deleted product"],
            },
            sku: "$product.sku",
            quantity: 1,
            sales: 1,
          },
        },
      ]),
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $ifNull: ["$paymentMethod", "Unknown"] },
            orders: { $sum: 1 },
            amount: { $sum: { $ifNull: ["$totalPrice", 0] } },
          },
        },
        { $sort: { amount: -1 } },
        { $project: { _id: 0, method: "$_id", orders: 1, amount: 1 } },
      ]),
    ]);

    const raw = summaryRows[0] || {};
    const grossSales = Number(raw.grossSales || 0);
    const shipping = Number(raw.shipping || 0);
    const orders = Number(raw.orders || 0);
    const summary = {
      orders,
      grossSales,
      netSales: grossSales - shipping,
      shipping,
      discount: Number(raw.discount || 0),
      itemsSold: Number(raw.itemsSold || 0),
      uniqueCustomers: (raw.customers || []).filter(Boolean).length,
      averageOrderValue: orders ? grossSales / orders : 0,
    };

    res.json({
      filters: { from, to, status, paymentStatus, groupBy },
      summary,
      rows: rows.map((r) => ({
        period: r._id,
        orders: r.orders,
        itemsSold: r.itemsSold,
        uniqueCustomers: (r.customers || []).filter(Boolean).length,
        shipping: r.shipping,
        discount: r.discount,
        grossSales: r.grossSales,
        netSales: r.grossSales - r.shipping,
      })),
      topProducts,
      paymentMethods,
    });
  } catch (error) {
    console.error("getSalesReport error:", error);
    res
      .status(500)
      .json({ message: "Failed to load sales report", error: error.message });
  }
};

export const getAdminOverview = async (req, res) => {
  try {
    const [pending, processing, delivered, cancelled, unpaidOrders, products] =
      await Promise.all([
        Order.countDocuments({ orderStatus: "pending" }),
        Order.countDocuments({ orderStatus: "processing" }),
        Order.countDocuments({ orderStatus: "delivered" }),
        Order.countDocuments({ orderStatus: "cancelled" }),
        Order.countDocuments({ paymentStatus: "unpaid" }),
        Product.find({}, { quantity: 1, qty: 1, stock: 1 }).lean().limit(5000),
      ]);
    const qty = (p) => Number(p.quantity ?? p.qty ?? p.stock ?? 0);
    const threshold = 5;
    res.json({
      summary: {
        orders: { pending, processing, delivered, cancelled },
        payment: { unpaidOrders },
        stock: {
          lowStock: products.filter((p) => qty(p) > 0 && qty(p) <= threshold)
            .length,
          outOfStock: products.filter((p) => qty(p) <= 0).length,
          lowStockThreshold: threshold,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to load admin overview", error: error.message });
  }
};

export const getTodayOrders = async (req, res) => {
  try {
    const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const value = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const start = dhakaBoundary(value);
    const end = new Date(start.getTime() + DAY_MS);
    const orders = await Order.find({ createdAt: { $gte: start, $lt: end } })
      .populate("products.product", "productName productImage sku")
      .populate("user", "name email mobile")
      .sort({ createdAt: -1 });
    res.json({ range: { start, end }, orders });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to load today orders", error: error.message });
  }
};
