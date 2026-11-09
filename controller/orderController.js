import { User, Order, Product, Shop } from "../model/index.model.js";
import mongoose from "mongoose";
import { createHash, randomBytes } from "crypto";
import SellerTransaction from "../model/sellerTransaction.model.js";
import Invoice from "../model/invoice.model.js";
import ShippingSettings from "../model/shippingSettings.model.js";
import Coupon from "../model/coupon.model.js";
import {
  notifyUser,
  notifyMany,
  notifyAdmins,
} from "../services/notification.service.js";

import {
  buildProductsMap,
  priceCart,
  computeShipping,
} from "../utils/pricing.js";

const hashGuestToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const getGuestTokenFromRequest = (req) => {
  return String(
    req.get("x-guest-access-token") ||
      req.headers["x-guest-access-token"] ||
      req.body?.guestAccessToken ||
      req.query?.guestAccessToken ||
      "",
  ).trim();
};

const createGuestAccess = (req, userId) => {
  if (userId) {
    return {
      guestAccessToken: null,
      guestAccessTokenHash: null,
    };
  }

  const suppliedToken = getGuestTokenFromRequest(req);

  const guestAccessToken =
    suppliedToken.length >= 32
      ? suppliedToken
      : randomBytes(32).toString("hex");

  return {
    guestAccessToken,
    guestAccessTokenHash: hashGuestToken(guestAccessToken),
  };
};

const cleanCustomerName = (customerName, userName) => {
  const name = String(customerName || userName || "Guest Customer").trim();

  return name || "Guest Customer";
};

const customerSafeOrder = (order) => {
  const plain =
    typeof order?.toObject === "function" ? order.toObject() : { ...order };

  delete plain.guestAccessTokenHash;

  plain.sellerOrders = (plain.sellerOrders || []).map((sellerOrder) => {
    const safe = { ...sellerOrder };

    delete safe.commissionRate;
    delete safe.commissionAmount;
    delete safe.sellerEarning;
    delete safe.payoutStatus;
    delete safe.earningProcessed;

    return safe;
  });

  return plain;
};

const SELLER_STATUS_TRANSITIONS = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

const syncParentOrderStatus = (order) => {
  const statuses = order.sellerOrders.map(
    (sellerOrder) => sellerOrder.orderStatus,
  );

  if (statuses.every((status) => status === "cancelled")) {
    order.orderStatus = "cancelled";
    return;
  }

  if (
    statuses.every((status) => status === "delivered" || status === "cancelled")
  ) {
    order.orderStatus = statuses.includes("cancelled")
      ? "partially_cancelled"
      : "delivered";

    return;
  }

  if (statuses.some((status) => status === "shipped")) {
    order.orderStatus = "shipped";
    return;
  }

  if (
    statuses.some((status) => status === "processing" || status === "delivered")
  ) {
    order.orderStatus = "processing";
    return;
  }

  order.orderStatus = "pending";
};

const syncParentPaymentStatus = (order) => {
  const activeSellerOrders = order.sellerOrders.filter(
    (sellerOrder) => sellerOrder.orderStatus !== "cancelled",
  );

  const allPaid =
    activeSellerOrders.length > 0 &&
    activeSellerOrders.every(
      (sellerOrder) => sellerOrder.paymentStatus === "paid",
    );

  if (allPaid) {
    order.paymentStatus = "paid";
    order.paidAt = order.paidAt || new Date();
  }
};

const roundMoney = (value) => Math.max(0, Math.round(Number(value) || 0));

const processSellerEarning = async ({ order, sellerOrder, session = null }) => {
  if (sellerOrder.source !== "seller" || sellerOrder.earningProcessed) {
    return;
  }

  const earningAmount = roundMoney(sellerOrder.sellerEarning);

  if (earningAmount <= 0) {
    sellerOrder.earningProcessed = true;
    return;
  }

  const existingTransaction = await SellerTransaction.findOne({
    seller: sellerOrder.seller,
    order: order._id,
    sellerOrderId: sellerOrder._id,
    type: "earning",
  }).session(session);

  if (existingTransaction) {
    sellerOrder.earningProcessed = true;
    sellerOrder.payoutStatus =
      existingTransaction.status === "available" ? "available" : "pending";

    return;
  }

  const updatedShop = await Shop.findOneAndUpdate(
    {
      _id: sellerOrder.shop,
      owner: sellerOrder.seller,
      status: "approved",
      isActive: true,
    },
    {
      $inc: {
        pendingBalance: earningAmount,
        totalEarned: earningAmount,
      },
    },
    {
      new: true,
      session,
      runValidators: true,
    },
  );

  if (!updatedShop) {
    throw new Error("Approved seller shop not found");
  }

  await SellerTransaction.create(
    [
      {
        seller: sellerOrder.seller,
        shop: sellerOrder.shop,
        order: order._id,
        sellerOrderId: sellerOrder._id,

        type: "earning",
        balanceEffect: "credit",

        grossAmount: roundMoney(sellerOrder.total),

        commissionAmount: roundMoney(sellerOrder.commissionAmount),

        amount: earningAmount,
        status: "pending",

        description: `Pending earning from order #${order._id}`,
      },
    ],
    {
      session,
    },
  );

  sellerOrder.earningProcessed = true;
  sellerOrder.payoutStatus = "pending";
};

const getSellerShipping = ({ shop, shippingOption, subtotal }) => {
  const settings = shop?.shippingSettings || {};

  const freeDeliveryEnabled = settings.freeDeliveryEnabled === true;

  const freeDeliveryMinimum = Number(settings.freeDeliveryMinimum || 0);

  if (
    freeDeliveryEnabled &&
    freeDeliveryMinimum > 0 &&
    subtotal >= freeDeliveryMinimum
  ) {
    return 0;
  }

  if (shippingOption === "inside") {
    return roundMoney(settings.insideDhaka ?? 60);
  }

  return roundMoney(settings.outsideDhaka ?? 120);
};

const restoreReducedStock = async (reducedItems) => {
  if (!reducedItems.length) {
    return;
  }

  await Product.bulkWrite(
    reducedItems.map((item) => {
      if (item.type === "preBook") {
        return {
          updateOne: {
            filter: {
              _id: item.productId,
            },
            update: {
              $inc: {
                "preBook.bookedCount": -item.quantity,
              },
            },
          },
        };
      }

      return {
        updateOne: {
          filter: {
            _id: item.productId,
          },
          update: {
            $inc: {
              stock: item.quantity,
            },
          },
        },
      };
    }),
  );
};

const ONLINE_PAYMENT_METHODS = ["bKash", "Nagad"];

const ALLOWED_PAYMENT_METHODS = ["Cash on Delivery", "bKash", "Nagad"];

const ensureManualPaymentVerified = (order, nextStatus) => {
  if (!["shipped", "delivered"].includes(nextStatus)) {
    return;
  }

  const isManualPayment = ["bKash", "Nagad"].includes(order.paymentMethod);

  if (isManualPayment && order.paymentStatus !== "paid") {
    const error = new Error(
      "Verify the bKash/Nagad payment before shipping or delivery",
    );

    error.statusCode = 409;
    throw error;
  }
};

const normalizeManualPayment = ({ paymentMethod, manualPayment }) => {
  if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
    const error = new Error("Invalid payment method");
    error.statusCode = 422;
    throw error;
  }

  if (!ONLINE_PAYMENT_METHODS.includes(paymentMethod)) {
    return null;
  }

  const senderNumber = String(manualPayment?.senderNumber || "").replace(
    /\s+/g,
    "",
  );

  const transactionId = String(manualPayment?.transactionId || "")
    .trim()
    .toUpperCase();

  if (!/^01[3-9]\d{8}$/.test(senderNumber)) {
    const error = new Error("Enter a valid sender mobile number");
    error.statusCode = 422;
    throw error;
  }

  if (!/^[A-Z0-9]{8,30}$/.test(transactionId)) {
    const error = new Error("Enter a valid transaction ID");
    error.statusCode = 422;
    throw error;
  }

  return {
    provider: paymentMethod,
    senderNumber,
    transactionId,
    status: "pending",
    submittedAt: new Date(),
  };
};

export const placeOrder = async (req, res) => {
  const reducedStockItems = [];

  try {
    const {
      cartItems,
      shippingOption,
      paymentMethod,
      manualPayment,
      customer,
      guestId,
      address,
      district,
      coupon,
    } = req.body;

    /* =========================
       Basic validation
    ========================= */

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        message: "Cart is empty",
      });
    }

    if (!["inside", "outside"].includes(shippingOption)) {
      return res.status(422).json({
        message: "Invalid shipping option",
      });
    }

    let normalizedManualPayment = null;

    try {
      normalizedManualPayment = normalizeManualPayment({
        paymentMethod,
        manualPayment,
      });
    } catch (error) {
      return res.status(error.statusCode || 422).json({
        message: error.message,
      });
    }

    if (!String(address || "").trim()) {
      return res.status(422).json({
        message: "Delivery address is required",
      });
    }

    if (!String(customer?.mobile || "").trim()) {
      return res.status(422).json({
        message: "Customer mobile is required",
      });
    }

    const authenticatedUser = req.user || null;
    const userId = authenticatedUser?._id || null;

    const { guestAccessToken, guestAccessTokenHash } = createGuestAccess(
      req,
      userId,
    );

    if (!userId && !guestId) {
      return res.status(422).json({
        message: "Guest ID is required for guest checkout",
      });
    }

    /* =========================
       Normalize cart items
    ========================= */

    const normalizedCartItems = cartItems.map((item) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity),
      selectedSize: item.selectedSize || null,
      selectedWeight: item.selectedWeight || null,
      selectedColor: item.selectedColor || null,
      selectedChest: item.selectedChest || null,
      selectedWaist: item.selectedWaist || null,
    }));

    const invalidItem = normalizedCartItems.find(
      (item) =>
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1,
    );

    if (invalidItem) {
      return res.status(422).json({
        message: "Cart contains an invalid product or quantity",
      });
    }

    const uniqueProductIds = [
      ...new Set(normalizedCartItems.map((item) => item.productId)),
    ];

    const invalidProductId = uniqueProductIds.find(
      (id) => !Product.db.base.Types.ObjectId.isValid(id),
    );

    if (invalidProductId) {
      return res.status(422).json({
        message: "Cart contains invalid product ID",
      });
    }

    /* =========================
       Load products
    ========================= */

    const products = await Product.find({
      _id: {
        $in: uniqueProductIds,
      },
      approvalStatus: "approved",
      isPublished: true,
      status: {
        $ne: "unavailable",
      },
    }).lean();

    if (products.length !== uniqueProductIds.length) {
      return res.status(409).json({
        message: "Some products are unavailable or not approved",
      });
    }

    const productMap = new Map(
      products.map((product) => [String(product._id), product]),
    );

    const hasPreBook = products.some(
      (product) => product.preBook?.enabled === true,
    );

    /* =========================
       Validate seller shops
    ========================= */

    const sellerProducts = products.filter(
      (product) => product.productSource === "seller",
    );

    const shopIds = [
      ...new Set(
        sellerProducts
          .map((product) => String(product.shop || ""))
          .filter(Boolean),
      ),
    ];

    const shops = shopIds.length
      ? await Shop.find({
          _id: {
            $in: shopIds,
          },
          status: "approved",
          isActive: true,
        }).lean()
      : [];

    const shopMap = new Map(shops.map((shop) => [String(shop._id), shop]));

    for (const product of sellerProducts) {
      const shop = shopMap.get(String(product.shop));

      if (!shop || String(shop.owner) !== String(product.seller)) {
        return res.status(409).json({
          message: `${product.productName} is currently unavailable because its shop is inactive`,
        });
      }
    }

    /* =========================
       Stock & Pre-book Limit validation
    ========================= */

    const requiredStock = new Map();

    for (const item of normalizedCartItems) {
      requiredStock.set(
        item.productId,
        (requiredStock.get(item.productId) || 0) + item.quantity,
      );
    }

    for (const [productId, quantity] of requiredStock) {
      const product = productMap.get(productId);

      // Pre-book limit validation
      if (product.preBook?.enabled) {
        if (product.preBook?.closed) {
          return res.status(409).json({
            message: `${product.productName} pre-booking is currently closed.`,
          });
        }

        const preBookLimit = Number(product.preBook?.limit || 0);
        const bookedCount = Number(product.preBook?.bookedCount || 0);

        if (preBookLimit > 0) {
          const remainingLimit = Math.max(0, preBookLimit - bookedCount);

          if (quantity > remainingLimit) {
            return res.status(409).json({
              message: `${product.productName} pre-book limit reached. Only ${remainingLimit} item(s) left.`,
              productId,
              availableLimit: remainingLimit,
            });
          }
        }
      } else if (Number(product.stock || 0) < quantity) {
        // Normal stock validation
        return res.status(409).json({
          message: `${product.productName} has only ${product.stock || 0} item(s) available`,
          productId,
          availableStock: product.stock || 0,
        });
      }
    }

    /* =========================
       Coupon and pricing
    ========================= */

    let couponDoc = null;

    if (coupon?.code) {
      couponDoc = await Coupon.findOne({
        code: String(coupon.code).trim().toUpperCase(),
      }).lean();
    }

    const productsById = buildProductsMap(products);

    const priced = priceCart({
      items: normalizedCartItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      productsById,
      coupon: couponDoc,
    });

    /* =========================
       Build product snapshots
    ========================= */

    const flatItems = normalizedCartItems.map((item) => {
      const product = productMap.get(item.productId);

      const priceLine = priced.lines.find(
        (line) => String(line.productId) === item.productId,
      );

      const originalPrice = roundMoney(product.price);
      const finalPrice = roundMoney(priceLine?.unit ?? product.price);
      const discountAmount = Math.max(0, originalPrice - finalPrice);

      return {
        product: product._id,
        productName: product.productName,
        sku: product.sku || "",
        image: product.productImage?.[0] || "",
        quantity: item.quantity,
        originalPrice,
        discountAmount,
        finalPrice,
        price: finalPrice,
        lineTotal: roundMoney(finalPrice * item.quantity),
        selectedSize: item.selectedSize,
        selectedWeight: item.selectedWeight,
        selectedColor: item.selectedColor,
        selectedChest: item.selectedChest,
        selectedWaist: item.selectedWaist,
        productSource: product.productSource || "platform",
        seller: product.seller || null,
        shop: product.shop || null,
      };
    });

    /* =========================
       Group items by seller/shop
    ========================= */

    const groups = new Map();

    for (const item of flatItems) {
      const source = item.productSource === "seller" ? "seller" : "platform";
      const groupKey = source === "seller" ? `shop:${item.shop}` : "platform";

      if (!groups.has(groupKey)) {
        const shop =
          source === "seller" ? shopMap.get(String(item.shop)) : null;

        groups.set(groupKey, {
          source,
          seller: source === "seller" ? item.seller : null,
          shop: source === "seller" ? item.shop : null,
          shopData: shop,
          shopName: source === "seller" ? shop.shopName : "Platform Store",
          items: [],
        });
      }

      groups.get(groupKey).items.push(item);
    }

    /* =========================
       Platform shipping settings
    ========================= */

    const globalShippingSettings =
      (await ShippingSettings.findOne().lean()) || {};

    const sellerGroups = [...groups.values()];

    const totalCouponDiscount = roundMoney(priced.couponTotal);

    const totalBeforeCoupon = sellerGroups.reduce(
      (sum, group) =>
        sum +
        group.items.reduce(
          (itemSum, item) => itemSum + item.originalPrice * item.quantity,
          0,
        ),
      0,
    );

    let allocatedCoupon = 0;

    const sellerOrders = sellerGroups.map((group, index) => {
      const subtotal = group.items.reduce(
        (sum, item) => sum + item.originalPrice * item.quantity,
        0,
      );

      const productTotalAfterDiscount = group.items.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );

      let couponDiscount = 0;

      if (totalCouponDiscount > 0 && totalBeforeCoupon > 0) {
        if (index === sellerGroups.length - 1) {
          couponDiscount = totalCouponDiscount - allocatedCoupon;
        } else {
          couponDiscount = roundMoney(
            totalCouponDiscount * (subtotal / totalBeforeCoupon),
          );

          allocatedCoupon += couponDiscount;
        }
      }

      let shippingCost = 0;

      if (group.source === "seller") {
        shippingCost = getSellerShipping({
          shop: group.shopData,
          shippingOption,
          subtotal: productTotalAfterDiscount,
        });
      } else {
        const shipping = computeShipping({
          subtotal: productTotalAfterDiscount,
          selectedOption: shippingOption,
          district: district || "",
          settings: globalShippingSettings,
        });

        shippingCost = roundMoney(shipping.shippingFinal);
      }

      const commissionRate =
        group.source === "seller"
          ? Number(group.shopData?.commissionRate || 0)
          : 0;

      const commissionAmount =
        group.source === "seller"
          ? roundMoney(productTotalAfterDiscount * (commissionRate / 100))
          : 0;

      const sellerEarning =
        group.source === "seller"
          ? roundMoney(
              productTotalAfterDiscount - commissionAmount + shippingCost,
            )
          : 0;

      return {
        source: group.source,
        seller: group.seller,
        shop: group.shop,
        shopName: group.shopName,
        items: group.items.map(
          ({ productSource, seller, shop, ...orderItem }) => orderItem,
        ),
        subtotal,
        couponDiscount,
        productTotalAfterDiscount,
        shippingCost,
        total: roundMoney(productTotalAfterDiscount + shippingCost),
        commissionRate,
        commissionAmount,
        sellerEarning,
        orderStatus: "pending",
        paymentStatus: "unpaid",
        payoutStatus: "pending",
      };
    });

    const totalShippingCost = sellerOrders.reduce(
      (sum, sellerOrder) => sum + sellerOrder.shippingCost,
      0,
    );

    const productTotalAfterDiscount = sellerOrders.reduce(
      (sum, sellerOrder) => sum + sellerOrder.productTotalAfterDiscount,
      0,
    );

    const totalPrice = roundMoney(
      productTotalAfterDiscount + totalShippingCost,
    );

    if (normalizedManualPayment) {
      normalizedManualPayment.amount = totalPrice;
    }

    /* =========================
       Reduce stock / Book pre-orders safely
    ========================= */

    for (const [productId, quantity] of requiredStock) {
      const product = productMap.get(productId);

      // Pre-book product: bookedCount বৃদ্ধি
      if (product.preBook?.enabled) {
        const preBookFilter = {
          _id: productId,
          approvalStatus: "approved",
          isPublished: true,
          "preBook.enabled": true,
          "preBook.closed": { $ne: true },
        };

        // যদি লিমিট সেট করা থাকে, তবে রেস কন্ডিশন ঠেকাতে ফিল্টারে লিমিট গার্ড ব্যবহার
        if (Number(product.preBook?.limit || 0) > 0) {
          preBookFilter.$expr = {
            $lte: [
              {
                $add: [
                  { $ifNull: ["$preBook.bookedCount", 0] },
                  quantity,
                ],
              },
              "$preBook.limit",
            ],
          };
        }

        const updatedProduct = await Product.findOneAndUpdate(
          preBookFilter,
          {
            $inc: {
              "preBook.bookedCount": quantity,
            },
          },
          {
            new: true,
          },
        );

        if (!updatedProduct) {
          await restoreReducedStock(reducedStockItems);

          return res.status(409).json({
            message: `${product.productName} pre-book limit has been reached during checkout.`,
          });
        }

        reducedStockItems.push({
          productId,
          quantity,
          type: "preBook",
        });

        continue;
      }

      // Normal product: stock হ্রাস
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: productId,
          stock: {
            $gte: quantity,
          },
          approvalStatus: "approved",
          isPublished: true,
        },
        {
          $inc: {
            stock: -quantity,
          },
        },
        {
          new: true,
        },
      );

      if (!updatedProduct) {
        await restoreReducedStock(reducedStockItems);

        return res.status(409).json({
          message:
            "A product went out of stock during checkout. Please try again.",
        });
      }

      reducedStockItems.push({
        productId,
        quantity,
        type: "stock",
      });

      if (updatedProduct.stock <= 0) {
        updatedProduct.status = "out_of_stock";
        await updatedProduct.save();
      }
    }

    /* =========================
       Create parent order
    ========================= */

    const order = await Order.create({
      user: userId,
      guestId: userId ? null : String(guestId),
      guestAccessTokenHash: userId ? null : guestAccessTokenHash,
      products: flatItems.map(
        ({ productSource, seller, shop, ...orderItem }) => orderItem,
      ),
      sellerOrders,
      customer: {
        name: cleanCustomerName(customer?.name, authenticatedUser?.name),
        email: String(customer?.email || authenticatedUser?.email || "")
          .trim()
          .toLowerCase(),
        mobile: String(
          customer?.mobile || authenticatedUser?.mobile || "",
        ).trim(),
      },
      address: String(address).trim(),
      district: String(district || "").trim(),
      shippingOption,
      paymentMethod,
      paymentStatus: normalizedManualPayment
        ? "pending_verification"
        : "unpaid",
      manualPayment: normalizedManualPayment || undefined,
      subtotal: roundMoney(priced.subtotal),
      shippingCost: totalShippingCost,
      discountAmount: totalCouponDiscount,
      totalPrice,
      couponCode: couponDoc?.code || null,
      orderStatus: "pending",
      orderType: hasPreBook ? "pre_book" : "regular",
      pricing: {
        subtotal: roundMoney(priced.subtotal),
        couponTotal: totalCouponDiscount,
        productTotalAfterDiscount,
        shippingBase: totalShippingCost,
        freeThresholdUsed: 0,
        inCampaign: false,
      },
    });

    /* =========================
       Create invoice
    ========================= */

    try {
      const invoiceItems = order.products.map((item) => ({
        productId: item.product,
        name: item.productName,
        qty: item.quantity,
        price: item.price,
        subtotal: item.lineTotal,
      }));

      const invoice = await Invoice.create({
        orderId: order._id,
        userId: order.user || null,
        guestId: order.guestId || null,
        items: invoiceItems,
        totalAmount: order.totalPrice,
        status: "unpaid",
        issuedAt: new Date(),
      });

      order.invoiceId = invoice._id;
      await order.save();
    } catch (invoiceError) {
      console.error("Invoice creation failed:", invoiceError);
    }

    /* =========================
       Multi-vendor order notifications
    ========================= */

    const notificationTasks = [];

    if (order.user) {
      notificationTasks.push(
        notifyUser({
          recipient: order.user,
          type: "order",
          title: "Order placed successfully",
          message: `Your order #${order._id} has been placed successfully.`,
          orderId: order._id,
          actionUrl: `/orders/${order._id}`,
          metadata: {
            totalPrice: order.totalPrice,
            orderStatus: order.orderStatus,
          },
        }),
      );
    }

    for (const sellerOrder of order.sellerOrders) {
      if (!sellerOrder.seller) continue;

      notificationTasks.push(
        notifyUser({
          recipient: sellerOrder.seller,
          type: "order",
          title: "New order received",
          message: `You received a new order for ${sellerOrder.shopName}.`,
          orderId: order._id,
          shopId: sellerOrder.shop,
          sellerOrderId: sellerOrder._id,
          actionUrl: `/seller/orders/${order._id}/${sellerOrder._id}`,
          priority: "high",
          metadata: {
            total: sellerOrder.total,
            itemCount: sellerOrder.items.length,
          },
        }),
      );
    }

    notificationTasks.push(
      notifyAdmins({
        type: "order",
        title: "New marketplace order",
        message: `A new order #${order._id} has been placed.`,
        orderId: order._id,
        actionUrl: `/admin/orders/${order._id}`,
        priority: "normal",
        metadata: {
          totalPrice: order.totalPrice,
          sellerCount: order.sellerOrders.length,
        },
      }),
    );

    const notificationResults = await Promise.allSettled(notificationTasks);

    notificationResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error("Order notification failed:", result.reason);
      }
    });

    return res.status(201).json({
      message: "Order placed successfully",
      order: customerSafeOrder(order),
      ...(userId
        ? {}
        : {
            guestAccessToken,
          }),
    });
  } catch (error) {
    if (reducedStockItems.length > 0) {
      try {
        await restoreReducedStock(reducedStockItems);
      } catch (restoreError) {
        console.error("Stock restore failed:", restoreError);
      }
    }

    console.error("placeOrder error:", error);

    if (
      error?.code === 11000 &&
      error?.keyPattern?.["manualPayment.transactionId"]
    ) {
      return res.status(409).json({
        message: "This transaction ID has already been used",
      });
    }

    return res.status(500).json({
      message: "Failed to place order",
      error: error.message,
    });
  }
};

export const getPreBookOrders = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);

    const filter = {
      orderType: "pre_book",
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate({
          path: "products.product",
          select: "productName productImage sku preBook",
        })
        .populate({ path: "user", select: "name email mobile" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Order.countDocuments(filter),
    ]);

    const [summaryAgg] = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
          uniqueCustomers: { $addToSet: "$customer.mobile" },
          itemsSold: {
            $sum: {
              $reduce: {
                input: "$products",
                initialValue: 0,
                in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          itemsSold: 1,
          uniqueCustomers: {
            $size: { $setDifference: ["$uniqueCustomers", [null, ""]] },
          },
        },
      },
    ]);

    return res.status(200).json({
      items: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      metaSummary: summaryAgg || {
        totalSales: 0,
        uniqueCustomers: 0,
        itemsSold: 0,
      },
    });
  } catch (error) {
    console.error("getPreBookOrders error:", error);
    return res.status(500).json({
      message: "Error fetching pre-book orders",
      error: error.message,
    });
  }
};
export const getOrdersByCustomer = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        message: "User ID required",
      });
    }

    const orders = await Order.find({ user: userId })
      .populate({
        path: "products.product",
        select: "productName productImage",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("products.product");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching order", error: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);

    const [orders, total] = await Promise.all([
      Order.find()
        .populate({
          path: "products.product",
          select: "productName productImage sku",
        })
        .populate({
          path: "user",
          select: "name email mobile",
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Order.countDocuments(),
    ]);

    const [summaryAgg] = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
          uniqueCustomers: { $addToSet: "$customer.mobile" },
          itemsSold: {
            $sum: {
              $reduce: {
                input: "$products",
                initialValue: 0,
                in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          itemsSold: 1,
          uniqueCustomers: {
            $size: { $setDifference: ["$uniqueCustomers", [null, ""]] },
          },
        },
      },
    ]);

    return res.status(200).json({
      items: orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      metaSummary: summaryAgg || {
        totalSales: 0,
        uniqueCustomers: 0,
        itemsSold: 0,
      },
    });
  } catch (error) {
    console.error("getAllOrders error:", error);
    return res.status(500).json({
      message: "Error fetching all orders",
      error: error.message,
    });
  }
};


// Copy ONLY this function into your existing backend/controller/orderController.js.
// It uses the module's existing mongoose, Order, Invoice, notifyUser,
// ensureManualPaymentVerified, syncParentOrderStatus, and processSellerEarning.
export const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;

  const orderStatus = String(req.body?.orderStatus || "")
    .trim()
    .toLowerCase();

  const paymentStatus = String(req.body?.paymentStatus || "")
    .trim()
    .toLowerCase();

  const courierName = String(req.body?.courierName || "").trim();
  const trackingCode = String(req.body?.trackingCode || "").trim();

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  if (!orderStatus && !paymentStatus) {
    return res.status(422).json({
      message: "Order status or payment status is required",
    });
  }

  const validOrderStatuses = [
    "pending", "confirmed", "processing", "shipped", "delivered", "cancelled",
  ];
  const validPaymentStatuses = ["unpaid", "paid"];

  if (orderStatus && !validOrderStatuses.includes(orderStatus)) {
    return res.status(422).json({ message: "Invalid order status" });
  }

  if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
    return res.status(422).json({ message: "Invalid payment status" });
  }

  if (orderStatus === "shipped" && (!courierName || !trackingCode)) {
    return res.status(422).json({
      message: "Courier name and tracking code are required",
    });
  }

  if (orderStatus === "cancelled") {
    return res.status(422).json({
      message: "Use the cancel order endpoint to cancel an order",
    });
  }

  const session = await mongoose.startSession();
  let savedOrder = null;
  const sellerRecipients = new Set();

  try {
    await session.withTransaction(
      async () => {
        const order = await Order.findById(orderId).session(session);
        if (!order) {
          const error = new Error("Order not found");
          error.statusCode = 404;
          throw error;
        }

        if (order.orderStatus === "cancelled" && orderStatus) {
          const error = new Error("Cancelled order status cannot be changed");
          error.statusCode = 409;
          throw error;
        }

        if (paymentStatus && ["bKash", "Nagad"].includes(order.paymentMethod)) {
          const error = new Error("Use the manual payment verification endpoint");
          error.statusCode = 422;
          throw error;
        }

        // Phone-confirming a legacy order is NOT payment verification.
        // The old order may lack newly-required schema fields, so this path
        // must be updated atomically instead of using order.save().
        const isPhoneConfirm =
          !paymentStatus &&
          ["confirmed", "processing"].includes(orderStatus) &&
          ["pending", "confirmed"].includes(order.orderStatus);

        if (orderStatus) {
          const fulfillmentStatus =
            orderStatus === "confirmed" ? "processing" : orderStatus;

          // Keep the original payment gate for shipping/delivery.
          // Phone confirmation by itself must not mark money as received.
          if (!isPhoneConfirm) {
            ensureManualPaymentVerified(order, fulfillmentStatus);
          }
        }

        if (
          paymentStatus === "unpaid" &&
          order.sellerOrders.some((item) => item.orderStatus === "delivered")
        ) {
          const error = new Error("Delivered order cannot be changed back to unpaid");
          error.statusCode = 422;
          throw error;
        }

        if (orderStatus) {
          const sellerStatus =
            orderStatus === "confirmed" ? "processing" : orderStatus;

          for (const sellerOrder of order.sellerOrders) {
            if (
              sellerOrder.orderStatus === "cancelled" ||
              sellerOrder.orderStatus === "delivered"
            ) {
              continue;
            }

            if (["processing", "shipped", "delivered"].includes(sellerStatus)) {
              sellerOrder.orderStatus = sellerStatus;
            }

            if (sellerStatus === "shipped") {
              sellerOrder.courierName = courierName;
              sellerOrder.trackingCode = trackingCode;
              if ("shippedAt" in sellerOrder) {
                sellerOrder.shippedAt = sellerOrder.shippedAt || new Date();
              }
            }

            if (sellerStatus === "delivered") {
              sellerOrder.deliveredAt = sellerOrder.deliveredAt || new Date();
              sellerOrder.paymentStatus = "paid";
              await processSellerEarning({ order, sellerOrder, session });
            }

            if (sellerOrder.seller) {
              sellerRecipients.add(String(sellerOrder.seller));
            }
          }

          if (orderStatus === "pending") {
            order.orderStatus = orderStatus;
          } else if (isPhoneConfirm) {
            // syncParentOrderStatus() must not see an empty sellerOrders array;
            // Array.every() on [] can incorrectly determine 'cancelled'.
            order.orderStatus = "processing";
          } else {
            syncParentOrderStatus(order);
          }
        }

        if (paymentStatus) {
          order.paymentStatus = paymentStatus;
          for (const sellerOrder of order.sellerOrders) {
            if (sellerOrder.orderStatus !== "cancelled") {
              sellerOrder.paymentStatus = paymentStatus;
            }
          }
          if (paymentStatus === "paid") {
            order.paidAt = order.paidAt || new Date();
          } else {
            order.paidAt = null;
          }
        }

        if (orderStatus === "delivered") {
          order.paymentStatus = "paid";
          order.paidAt = order.paidAt || new Date();
        }

        if (isPhoneConfirm) {
          // UPDATE VALIDATORS only check modified paths, rather than
          // revalidating missing legacy fields (subtotal/productName/etc).
          const set = { orderStatus: "processing" };
          order.sellerOrders.forEach((sellerOrder, index) => {
            if (!["cancelled", "delivered"].includes(sellerOrder.orderStatus)) {
              set[`sellerOrders.${index}.orderStatus`] = "processing";
            }
          });

          savedOrder = await Order.findOneAndUpdate(
            {
              _id: orderId,
              orderStatus: { $in: ["pending", "confirmed"] },
            },
            { $set: set },
            { new: true, session, runValidators: true },
          );
          if (!savedOrder) {
            const error = new Error("Order was already confirmed or changed");
            error.statusCode = 409;
            throw error;
          }
        } else {
          // Unchanged logic for other operations, including shipped/delivered.
          await order.save({ session });
          savedOrder = order;
        }

        if (savedOrder.invoiceId) {
          const invoiceStatus =
            savedOrder.paymentStatus === "paid"
              ? "paid"
              : savedOrder.paymentStatus === "refunded"
                ? "refunded"
                : "unpaid";

          await Invoice.findByIdAndUpdate(
            savedOrder.invoiceId,
            {
              $set: {
                status: invoiceStatus,
                paidAt: invoiceStatus === "paid" ? savedOrder.paidAt : null,
              },
            },
            { session, runValidators: true },
          );
        }
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      },
    );

    await Promise.allSettled(
      [...sellerRecipients].map((sellerId) =>
        notifyUser({
          recipient: sellerId,
          sender: req.user?._id || req.user?.id,
          type: "order",
          title: "Order updated by admin",
          message:
            savedOrder.orderStatus === "shipped"
              ? `Order #${savedOrder._id} was shipped via ${courierName}.`
              : `Order #${savedOrder._id} status was updated to ${savedOrder.orderStatus}.`,
          orderId: savedOrder._id,
          actionUrl: "/seller/orders",
          metadata: {
            orderStatus: savedOrder.orderStatus,
            paymentStatus: savedOrder.paymentStatus,
            courierName: savedOrder.orderStatus === "shipped" ? courierName : "",
            trackingCode: savedOrder.orderStatus === "shipped" ? trackingCode : "",
          },
        }),
      ),
    );

    if (savedOrder.user) {
      await notifyUser({
        recipient: savedOrder.user,
        sender: req.user?._id || req.user?.id,
        type: savedOrder.orderStatus === "delivered" ? "delivery" : "order",
        title: savedOrder.orderStatus === "shipped"
          ? "Your order has been shipped"
          : "Order updated",
        message: savedOrder.orderStatus === "shipped"
          ? `Your order #${savedOrder._id} has been shipped via ${courierName}. Tracking code: ${trackingCode}.`
          : `Your order #${savedOrder._id} is now ${savedOrder.orderStatus}.`,
        orderId: savedOrder._id,
        actionUrl: `/orders/${savedOrder._id}`,
        metadata: {
          orderStatus: savedOrder.orderStatus,
          paymentStatus: savedOrder.paymentStatus,
          courierName: savedOrder.orderStatus === "shipped" ? courierName : "",
          trackingCode: savedOrder.orderStatus === "shipped" ? trackingCode : "",
        },
      }).catch((error) => {
        console.error("Customer update notification failed:", error);
      });
    }

    return res.status(200).json({
      message: savedOrder.orderStatus === "shipped"
        ? "Order shipped successfully"
        : "Order updated successfully",
      order: savedOrder,
    });
  } catch (error) {
    console.error("updateOrderStatus error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Seller earning was already processed",
      });
    }
    return res.status(error.statusCode || 500).json({
      message: error.message || "Error updating order",
    });
  } finally {
    await session.endSession();
  }
};

export const getPendingOrders = async (req, res) => {
  try {
    const orders = await Order.find({ orderStatus: "pending" })
      .populate({
        path: "products.product",
        select: "productName productImage sku",
      })
      .populate({ path: "user", select: "name email mobile" })
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching pending orders", error: error.message });
  }
};

export const getConfirmedOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: {
        $in: ["confirmed", "processing"],
      },
    })
      .populate({
        path: "products.product",
        select: "productName productImage sku",
      })
      .populate({
        path: "user",
        select: "name email mobile",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching confirmed orders",
      error: error.message,
    });
  }
};

export const getShippedOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: "shipped",
    })
      .populate({
        path: "products.product",
        select: "productName productImage sku",
      })
      .populate({
        path: "user",
        select: "name email mobile",
      })
      .sort({ updatedAt: -1 });

    return res.status(200).json(orders);
  } catch (error) {
    console.error("getShippedOrders error:", error);

    return res.status(500).json({
      message: "Error fetching shipped orders",
      error: error.message,
    });
  }
};

export const getCancelledOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      orderStatus: {
        $in: ["cancelled", "partially_cancelled"],
      },
    })
      .populate({
        path: "products.product",
        select: "productName productImage sku",
      })
      .populate({ path: "user", select: "name email mobile" })
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching cancelled orders",
      error: error.message,
    });
  }
};

export const getDeliveredOrders = async (req, res) => {
  try {
    const orders = await Order.find({ orderStatus: "delivered" })
      .populate({
        path: "products.product",
        select: "productName productImage sku",
      })
      .populate({ path: "user", select: "name email mobile" })
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching delivered orders",
      error: error.message,
    });
  }
};

const restoreSellerOrderStock = async (sellerOrder, session = null) => {
  if (!sellerOrder || sellerOrder.stockRestored) {
    return;
  }

  const quantityMap = new Map();

  for (const item of sellerOrder.items || []) {
    const productId = String(
      item?.product?._id || item?.product || "",
    );
    const quantity = Number(item?.quantity || 0);

    if (!mongoose.isValidObjectId(productId) || quantity <= 0) {
      continue;
    }

    quantityMap.set(
      productId,
      (quantityMap.get(productId) || 0) + quantity,
    );
  }

  const operations = [];

  for (const [productId, quantity] of quantityMap.entries()) {
    const product = await Product.findById(productId)
      .session(session)
      .lean();

    if (!product) {
      continue;
    }

    if (product.preBook?.enabled === true) {
      operations.push({
        updateOne: {
          filter: {
            _id: productId,
          },
          update: {
            $inc: {
              "preBook.bookedCount": -quantity,
            },
          },
        },
      });
    } else {
      operations.push({
        updateOne: {
          filter: {
            _id: productId,
          },
          update: {
            $inc: {
              stock: quantity,
            },
            $set: {
              status: "available",
            },
          },
        },
      });
    }
  }

  if (operations.length > 0) {
    await Product.bulkWrite(
      operations,
      session ? { session } : undefined,
    );
  }

  sellerOrder.stockRestored = true;
};

export const cancelOrder = async (req, res) => {
  const { orderId } = req.params;

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({
      message: "Invalid order ID",
    });
  }

  const reason = String(
    req.body?.reason || req.body?.cancellationReason || "Cancelled by admin",
  ).trim();

  const session = await mongoose.startSession();

  let savedOrder = null;
  let sellerRecipients = [];

  try {
    await session.withTransaction(
      async () => {
        const order = await Order.findById(orderId).session(session);

        if (!order) {
          const error = new Error("Order not found");
          error.statusCode = 404;
          throw error;
        }

        if (order.orderStatus === "cancelled") {
          const error = new Error("Order is already cancelled");
          error.statusCode = 409;
          throw error;
        }

        if (order.orderStatus === "delivered") {
          const error = new Error(
            "Delivered order cannot be cancelled. Use return/refund flow.",
          );
          error.statusCode = 422;
          throw error;
        }

        let cancelledCount = 0;
        const recipients = new Set();

        for (const sellerOrder of order.sellerOrders) {
          if (
            sellerOrder.orderStatus === "delivered" ||
            sellerOrder.orderStatus === "cancelled"
          ) {
            continue;
          }

          await restoreSellerOrderStock(sellerOrder, session);

          sellerOrder.orderStatus = "cancelled";
          sellerOrder.payoutStatus = "cancelled";
          sellerOrder.cancelledBy = req.user?._id || req.user?.id;
          sellerOrder.cancellationReason = reason;

          if (sellerOrder.seller) {
            recipients.add(String(sellerOrder.seller));
          }

          cancelledCount += 1;
        }

        if (cancelledCount === 0) {
          const error = new Error("No cancellable seller orders found");
          error.statusCode = 422;
          throw error;
        }

        syncParentOrderStatus(order);
        syncParentPaymentStatus(order);

        order.stockRestored = order.sellerOrders
          .filter((item) => item.orderStatus !== "delivered")
          .every((item) => item.stockRestored === true);

        await order.save({
          session,
        });

        savedOrder = order;
        sellerRecipients = [...recipients];
      },
      {
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
      },
    );

    await Promise.allSettled(
      sellerRecipients.map((sellerId) =>
        notifyUser({
          recipient: sellerId,
          sender: req.user?._id || req.user?.id,
          type: "order",
          title: "Order cancelled",
          message: `Order #${savedOrder._id} was cancelled by admin.`,
          orderId: savedOrder._id,
          actionUrl: "/seller/orders",
          priority: "high",
          metadata: {
            reason,
          },
        }),
      ),
    );

    if (savedOrder.user) {
      await notifyUser({
        recipient: savedOrder.user,
        sender: req.user?._id || req.user?.id,
        type: "order",
        title: "Order cancelled",
        message: `Your order #${savedOrder._id} has been cancelled.`,
        orderId: savedOrder._id,
        actionUrl: `/orders/${savedOrder._id}`,
        priority: "high",
        metadata: {
          reason,
          orderStatus: savedOrder.orderStatus,
        },
      }).catch((error) => {
        console.error("Customer cancellation notification failed:", error);
      });
    }

    return res.status(200).json({
      message: "Order cancelled successfully",
      order: savedOrder,
    });
  } catch (error) {
    console.error("cancelOrder error:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Error cancelling order",
    });
  } finally {
    await session.endSession();
  }
};

export const getSalesReport = async (req, res) => {
  try {
    const {
      from,
      to,
      status,
      paymentStatus,
      groupBy = "day",
    } = req.query;

    const match = {};

    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) match.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    if (status && status !== "all") match.orderStatus = status;
    if (paymentStatus && paymentStatus !== "all")
      match.paymentStatus = paymentStatus;

    const fmt = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

    const rows = await Order.aggregate([
      { $match: match },
      {
        $addFields: {
          itemsCount: {
            $sum: {
              $map: {
                input: "$products",
                as: "p",
                in: { $ifNull: ["$$p.quantity", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: "$createdAt" } },
          orders: { $sum: 1 },
          grossSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
          shipping: { $sum: { $ifNull: ["$shippingCost", 0] } },
          itemsSold: { $sum: { $ifNull: ["$itemsCount", 0] } },
          uniqueCustomers: { $addToSet: "$customer.mobile" },
        },
      },
      {
        $project: {
          _id: 0,
          period: "$_id",
          orders: 1,
          grossSales: 1,
          shipping: 1,
          itemsSold: 1,
          uniqueCustomers: {
            $size: { $setDifference: ["$uniqueCustomers", [null, ""]] },
          },
        },
      },
      { $sort: { period: 1 } },
    ]);

    const summaryAgg = await Order.aggregate([
      { $match: match },
      {
        $addFields: {
          itemsCount: {
            $sum: {
              $map: {
                input: "$products",
                as: "p",
                in: { $ifNull: ["$$p.quantity", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          grossSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
          shipping: { $sum: { $ifNull: ["$shippingCost", 0] } },
          itemsSold: { $sum: { $ifNull: ["$itemsCount", 0] } },
          uniqueCustomers: { $addToSet: "$customer.mobile" },
        },
      },
      {
        $project: {
          _id: 0,
          orders: 1,
          grossSales: 1,
          shipping: 1,
          itemsSold: 1,
          uniqueCustomers: {
            $size: { $setDifference: ["$uniqueCustomers", [null, ""]] },
          },
        },
      },
    ]);

    const summary = summaryAgg?.[0] || {
      orders: 0,
      grossSales: 0,
      shipping: 0,
      itemsSold: 0,
      uniqueCustomers: 0,
    };

    res.status(200).json({ summary, rows });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error generating sales report", error: error.message });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const [totalUsers, totalProducts] = await Promise.all([
      User.countDocuments({}),
      Product.countDocuments({}),
    ]);

    const [rows] = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "pending"] }, 1, 0] },
          },
          confirmOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "processing"] }, 1, 0] },
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] },
          },
          totalSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          pendingOrders: 1,
          confirmOrders: 1,
          deliveredOrders: 1,
          cancelledOrders: 1,
          totalSales: 1,
        },
      },
    ]);

    const agg = rows || {
      totalOrders: 0,
      pendingOrders: 0,
      confirmOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      totalSales: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalProducts,
        ...agg,
      },
    });
  } catch (error) {
    console.log("getDashboardSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching dashboard summary",
      error: error.message,
    });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [totalProducts, totalUsers] = await Promise.all([
      Product.countDocuments({}),
      User.countDocuments({}),
    ]);

    const [agg] = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
      { $project: { _id: 0, totalOrders: 1, totalSales: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        totalUsers,
        totalOrders: agg?.totalOrders || 0,
        totalSales: agg?.totalSales || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const status = String(req.query.status || "")
      .trim()
      .toLowerCase();

    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    const query = {
      sellerOrders: {
        $elemMatch: {
          seller: sellerId,
          ...(validStatuses.includes(status)
            ? {
                orderStatus: status,
              }
            : {}),
        },
      },
    };

    const [orders, total] = await Promise.all([
      Order.find(query)
        .select(
          `
              user
              guestId
              customer
              address
              district
              shippingOption
              paymentMethod
              sellerOrders
              orderStatus
              paymentStatus
              createdAt
              updatedAt
            `,
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Order.countDocuments(query),
    ]);

    const items = orders.flatMap((order) =>
      order.sellerOrders
        .filter(
          (sellerOrder) =>
            String(sellerOrder.seller) === String(sellerId) &&
            (!validStatuses.includes(status) ||
              sellerOrder.orderStatus === status),
        )
        .map((sellerOrder) => ({
          parentOrderId: order._id,
          sellerOrderId: sellerOrder._id,
          customer: order.customer,
          address: order.address,
          district: order.district,
          shippingOption: order.shippingOption,
          paymentMethod: order.paymentMethod,
          parentOrderStatus: order.orderStatus,
          parentPaymentStatus: order.paymentStatus,
          ...sellerOrder,
          orderCreatedAt: order.createdAt,
        })),
    );

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getSellerOrders error:", error);

    return res.status(500).json({
      message: "Failed to load seller orders",
    });
  }
};

export const getSellerOrderById = async (req, res) => {
  try {
    const { orderId, sellerOrderId } = req.params;

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sellerOrderId)
    ) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      sellerOrders: {
        $elemMatch: {
          _id: sellerOrderId,
          seller: req.user._id,
        },
      },
    }).lean();

    if (!order) {
      return res.status(404).json({
        message: "Seller order not found or access denied",
      });
    }

    const sellerOrder = order.sellerOrders.find(
      (item) =>
        String(item._id) === String(sellerOrderId) &&
        String(item.seller) === String(req.user._id),
    );

    if (!sellerOrder) {
      return res.status(404).json({
        message: "Seller order not found",
      });
    }

    return res.status(200).json({
      parentOrderId: order._id,
      customer: order.customer,
      address: order.address,
      district: order.district,
      shippingOption: order.shippingOption,
      paymentMethod: order.paymentMethod,
      parentOrderStatus: order.orderStatus,
      parentPaymentStatus: order.paymentStatus,
      orderCreatedAt: order.createdAt,
      sellerOrder,
    });
  } catch (error) {
    console.error("getSellerOrderById error:", error);

    return res.status(500).json({
      message: "Failed to load seller order",
    });
  }
};

export const updateSellerOrderStatus = async (req, res) => {
  const { orderId, sellerOrderId } = req.params;

  const nextStatus = String(req.body?.orderStatus || "")
    .trim()
    .toLowerCase();

  const trackingCode = String(req.body?.trackingCode || "").trim();
  const courierName = String(req.body?.courierName || "").trim();
  const sellerNote = String(req.body?.sellerNote || "").trim();
  const cancellationReason = String(req.body?.cancellationReason || "").trim();

  if (
    !mongoose.isValidObjectId(orderId) ||
    !mongoose.isValidObjectId(sellerOrderId)
  ) {
    return res.status(400).json({
      message: "Invalid order ID",
    });
  }

  const session = await mongoose.startSession();

  let savedOrder = null;
  let savedSellerOrder = null;

  try {
    await session.withTransaction(
      async () => {
        const order = await Order.findOne({
          _id: orderId,
          sellerOrders: {
            $elemMatch: {
              _id: sellerOrderId,
              seller: req.user._id,
            },
          },
        }).session(session);

        if (!order) {
          const error = new Error("Seller order not found or access denied");
          error.statusCode = 404;
          throw error;
        }

        const sellerOrder = order.sellerOrders.id(sellerOrderId);

        if (
          !sellerOrder ||
          String(sellerOrder.seller) !== String(req.user._id)
        ) {
          const error = new Error("Seller order not found");
          error.statusCode = 404;
          throw error;
        }

        const currentStatus = sellerOrder.orderStatus;
        const allowedNextStatuses =
          SELLER_STATUS_TRANSITIONS[currentStatus] || [];

        if (!allowedNextStatuses.includes(nextStatus)) {
          const error = new Error(
            `Order cannot move from ${currentStatus} to ${nextStatus}`,
          );
          error.statusCode = 422;
          error.allowedStatuses = allowedNextStatuses;
          throw error;
        }

        if (nextStatus === "shipped" && (!courierName || !trackingCode)) {
          const error = new Error(
            "Courier name and tracking code are required",
          );
          error.statusCode = 422;
          throw error;
        }

        if (nextStatus === "cancelled" && !cancellationReason) {
          const error = new Error("Cancellation reason is required");
          error.statusCode = 422;
          throw error;
        }

        ensureManualPaymentVerified(order, nextStatus);

        sellerOrder.orderStatus = nextStatus;

        if (nextStatus === "shipped") {
          sellerOrder.courierName = courierName;
          sellerOrder.trackingCode = trackingCode;
        }

        if (sellerNote) {
          sellerOrder.sellerNote = sellerNote;
        }

        if (nextStatus === "cancelled") {
          await restoreSellerOrderStock(sellerOrder, session);
          sellerOrder.cancelledBy = req.user._id;
          sellerOrder.cancellationReason = cancellationReason;
          sellerOrder.payoutStatus = "cancelled";
        }

        if (nextStatus === "delivered") {
          sellerOrder.deliveredAt = sellerOrder.deliveredAt || new Date();
          sellerOrder.paymentStatus = "paid";

          await processSellerEarning({
            order,
            sellerOrder,
            session,
          });
        }

        syncParentOrderStatus(order);
        syncParentPaymentStatus(order);

        await order.save({
          session,
        });

        savedOrder = order;
        savedSellerOrder = sellerOrder.toObject();
      },
      {
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
      },
    );

    if (savedOrder.user) {
      await notifyUser({
        recipient: savedOrder.user,
        sender: req.user?._id || req.user?.id,
        type:
          savedSellerOrder.orderStatus === "delivered" ? "delivery" : "order",
        title: `Order ${savedSellerOrder.orderStatus}`,
        message: `${savedSellerOrder.shopName} changed your order status to ${savedSellerOrder.orderStatus}.`,
        orderId: savedOrder._id,
        shopId: savedSellerOrder.shop,
        sellerOrderId: savedSellerOrder._id,
        actionUrl: `/orders/${savedOrder._id}`,
        metadata: {
          orderStatus: savedSellerOrder.orderStatus,
          trackingCode: savedSellerOrder.trackingCode || "",
          courierName: savedSellerOrder.courierName || "",
        },
      }).catch((error) => {
        console.error("Customer notification failed:", error);
      });
    }

    if (savedSellerOrder.orderStatus === "cancelled") {
      await notifyAdmins({
        sender: req.user?._id || req.user?.id,
        type: "order",
        title: "Seller cancelled an order",
        message: `${savedSellerOrder.shopName} cancelled part of order #${savedOrder._id}.`,
        orderId: savedOrder._id,
        shopId: savedSellerOrder.shop,
        sellerOrderId: savedSellerOrder._id,
        actionUrl: `/admin/orders/${savedOrder._id}`,
        priority: "high",
        metadata: {
          cancellationReason: savedSellerOrder.cancellationReason || "",
        },
      }).catch((error) => {
        console.error("Admin cancellation notification failed:", error);
      });
    }

    return res.status(200).json({
      message: "Seller order status updated successfully",
      parentOrderStatus: savedOrder.orderStatus,
      parentPaymentStatus: savedOrder.paymentStatus,
      sellerOrder: savedSellerOrder,
    });
  } catch (error) {
    console.error("updateSellerOrderStatus error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Seller earning was already processed",
      });
    }

    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to update seller order status",
      ...(error.allowedStatuses
        ? {
            allowedStatuses: error.allowedStatuses,
          }
        : {}),
    });
  } finally {
    await session.endSession();
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    const filter = {
      user: req.user._id,
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      items: orders.map(customerSafeOrder),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getMyOrders error:", error);

    return res.status(500).json({
      message: "Failed to load orders",
    });
  }
};

export const getMyOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    }).lean();

    if (!order) {
      return res.status(404).json({
        message: "Order not found or access denied",
      });
    }

    return res.status(200).json(customerSafeOrder(order));
  } catch (error) {
    console.error("getMyOrderById error:", error);

    return res.status(500).json({
      message: "Failed to load order",
    });
  }
};

export const getGuestOrders = async (req, res) => {
  try {
    const guestId = String(req.query.guestId || "").trim();
    const guestAccessToken = getGuestTokenFromRequest(req);

    if (!guestId) {
      return res.status(422).json({
        message: "Guest ID is required",
      });
    }

    if (!guestAccessToken) {
      return res.status(401).json({
        message: "Guest order access token is required",
      });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    const filter = {
      guestId,
      guestAccessTokenHash: hashGuestToken(guestAccessToken),
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      items: orders.map(customerSafeOrder),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getGuestOrders error:", error);

    return res.status(500).json({
      message: "Failed to load guest orders",
    });
  }
};

export const getGuestOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const guestId = String(req.query.guestId || "").trim();
    const guestAccessToken = getGuestTokenFromRequest(req);

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    if (!guestId || !guestAccessToken) {
      return res.status(401).json({
        message: "Guest ID and access token are required",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      guestId,
      guestAccessTokenHash: hashGuestToken(guestAccessToken),
    }).lean();

    if (!order) {
      return res.status(404).json({
        message: "Order not found or access denied",
      });
    }

    return res.status(200).json(customerSafeOrder(order));
  } catch (error) {
    console.error("getGuestOrderById error:", error);

    return res.status(500).json({
      message: "Failed to load guest order",
    });
  }
};

const cancelCustomerOrder = async ({ order, cancelledBy = null, reason }) => {
  const session = await mongoose.startSession();

  let savedOrder = null;

  try {
    await session.withTransaction(
      async () => {
        const transactionOrder = await Order.findById(order._id).session(
          session,
        );

        if (!transactionOrder) {
          const error = new Error("Order not found");
          error.statusCode = 404;
          throw error;
        }

        if (["cancelled", "delivered"].includes(transactionOrder.orderStatus)) {
          const error = new Error(
            `Order is already ${transactionOrder.orderStatus}`,
          );
          error.statusCode = 409;
          throw error;
        }

        if (transactionOrder.paymentStatus === "paid") {
          const error = new Error(
            "Paid order cannot be cancelled automatically. Contact support for refund.",
          );
          error.statusCode = 409;
          throw error;
        }

        const blockedSellerOrder = transactionOrder.sellerOrders.find(
          (sellerOrder) =>
            ["shipped", "delivered"].includes(sellerOrder.orderStatus),
        );

        if (blockedSellerOrder) {
          const error = new Error("Order cannot be cancelled after shipment");
          error.statusCode = 409;
          throw error;
        }

        for (const sellerOrder of transactionOrder.sellerOrders) {
          if (sellerOrder.orderStatus === "cancelled") {
            continue;
          }

          await restoreSellerOrderStock(sellerOrder, session);

          sellerOrder.orderStatus = "cancelled";
          sellerOrder.payoutStatus = "cancelled";
          sellerOrder.cancelledBy = cancelledBy;
          sellerOrder.cancellationReason = reason;
        }

        transactionOrder.orderStatus = "cancelled";
        transactionOrder.stockRestored = true;

        await transactionOrder.save({
          session,
        });

        if (transactionOrder.invoiceId) {
          await Invoice.findByIdAndUpdate(
            transactionOrder.invoiceId,
            {
              $set: {
                status: "cancelled",
                notes: reason,
              },
            },
            {
              session,
              runValidators: true,
            },
          );
        }

        savedOrder = transactionOrder;
      },
      {
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
      },
    );

    return savedOrder;
  } finally {
    await session.endSession();
  }
};

export const cancelMyOrder = async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();

    if (!reason) {
      return res.status(422).json({
        message: "Cancellation reason is required",
      });
    }

    if (!mongoose.isValidObjectId(req.params.orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found or access denied",
      });
    }

    const cancelledOrder = await cancelCustomerOrder({
      order,
      cancelledBy: req.user._id,
      reason,
    });

    return res.json({
      message: "Order cancelled successfully",
      order: customerSafeOrder(cancelledOrder),
    });
  } catch (error) {
    const knownError = [
      "Order is already",
      "Paid order cannot",
      "Order cannot be cancelled",
    ].some((text) => error.message.startsWith(text));

    return res.status(knownError ? 409 : 500).json({
      message: knownError ? error.message : "Failed to cancel order",
    });
  }
};

export const cancelGuestOrder = async (req, res) => {
  try {
    const guestId = String(req.body.guestId || "").trim();
    const reason = String(req.body.reason || "").trim();
    const guestAccessToken = getGuestTokenFromRequest(req);

    if (!guestId || !guestAccessToken || !reason) {
      return res.status(422).json({
        message:
          "Guest ID, guest access token and cancellation reason are required",
      });
    }

    if (!mongoose.isValidObjectId(req.params.orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      guestId,
      guestAccessTokenHash: hashGuestToken(guestAccessToken),
      user: null,
    });

    if (!order) {
      return res.status(404).json({
        message: "Guest order not found or access denied",
      });
    }

    const cancelledOrder = await cancelCustomerOrder({
      order,
      cancelledBy: null,
      reason,
    });

    return res.json({
      message: "Order cancelled successfully",
      order: customerSafeOrder(cancelledOrder),
    });
  } catch (error) {
    const knownError = [
      "Order is already",
      "Paid order cannot",
      "Order cannot be cancelled",
    ].some((text) => error.message.startsWith(text));

    return res.status(knownError ? 409 : 500).json({
      message: knownError ? error.message : "Failed to cancel order",
    });
  }
};

export const reconcileSellerEarnings = async (req, res) => {
  try {
    const orders = await Order.find({
      sellerOrders: {
        $elemMatch: {
          orderStatus: "delivered",
          paymentStatus: "paid",
          earningProcessed: false,
          source: "seller",
        },
      },
    });

    let processedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      let orderChanged = false;

      for (const sellerOrder of order.sellerOrders) {
        const shouldProcess =
          sellerOrder.source === "seller" &&
          sellerOrder.orderStatus === "delivered" &&
          sellerOrder.paymentStatus === "paid" &&
          !sellerOrder.earningProcessed;

        if (!shouldProcess) {
          skippedCount += 1;
          continue;
        }

        await processSellerEarning({
          order,
          sellerOrder,
        });

        orderChanged = true;
        processedCount += 1;
      }

      if (orderChanged) {
        syncParentOrderStatus(order);
        syncParentPaymentStatus(order);

        await order.save();
      }
    }

    return res.json({
      message: "Seller earnings reconciled successfully",
      processedCount,
      skippedCount,
    });
  } catch (error) {
    console.error("reconcileSellerEarnings error:", error);

    return res.status(500).json({
      message: "Failed to reconcile seller earnings",
    });
  }
};

export const getAdminSellerOrders = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const status = String(req.query.status || "")
      .trim()
      .toLowerCase();

    const seller = String(req.query.seller || "").trim();
    const shop = String(req.query.shop || "").trim();

    const elemMatch = {
      source: "seller",
      ...(status ? { orderStatus: status } : {}),
      ...(mongoose.isValidObjectId(seller) ? { seller } : {}),
      ...(mongoose.isValidObjectId(shop) ? { shop } : {}),
    };

    const query = {
      sellerOrders: {
        $elemMatch: elemMatch,
      },
    };

    const orders = await Order.find(query)
      .select(
        `
          customer
          address
          district
          shippingOption
          paymentMethod
          orderStatus
          paymentStatus
          sellerOrders
          createdAt
        `,
      )
      .sort({ createdAt: -1 })
      .lean();

    const allItems = orders.flatMap((order) =>
      order.sellerOrders
        .filter((sellerOrder) => {
          if (sellerOrder.source !== "seller") {
            return false;
          }

          if (status && sellerOrder.orderStatus !== status) {
            return false;
          }

          if (
            mongoose.isValidObjectId(seller) &&
            String(sellerOrder.seller) !== seller
          ) {
            return false;
          }

          if (
            mongoose.isValidObjectId(shop) &&
            String(sellerOrder.shop) !== shop
          ) {
            return false;
          }

          return true;
        })
        .map((sellerOrder) => ({
          parentOrderId: order._id,
          sellerOrderId: sellerOrder._id,
          customer: order.customer,
          address: order.address,
          district: order.district,
          shippingOption: order.shippingOption,
          paymentMethod: order.paymentMethod,
          parentOrderStatus: order.orderStatus,
          parentPaymentStatus: order.paymentStatus,
          ...sellerOrder,
          orderCreatedAt: order.createdAt,
        })),
    );

    const total = allItems.length;
    const items = allItems.slice((page - 1) * limit, page * limit);

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getAdminSellerOrders error:", error);

    return res.status(500).json({
      message: "Failed to load seller orders",
    });
  }
};

export const getAdminSellerOrderById = async (req, res) => {
  try {
    const { orderId, sellerOrderId } = req.params;

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sellerOrderId)
    ) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      "sellerOrders._id": sellerOrderId,
    }).lean();

    if (!order) {
      return res.status(404).json({
        message: "Seller order not found",
      });
    }

    const sellerOrder = order.sellerOrders.find(
      (item) => String(item._id) === String(sellerOrderId),
    );

    return res.json({
      parentOrderId: order._id,
      customer: order.customer,
      address: order.address,
      district: order.district,
      shippingOption: order.shippingOption,
      paymentMethod: order.paymentMethod,
      parentOrderStatus: order.orderStatus,
      parentPaymentStatus: order.paymentStatus,
      orderCreatedAt: order.createdAt,
      sellerOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load seller order",
    });
  }
};

export const updateAdminSellerOrderStatus = async (req, res) => {
  const { orderId, sellerOrderId } = req.params;

  const nextStatus = String(req.body?.orderStatus || "")
    .trim()
    .toLowerCase();

  const courierName = String(req.body?.courierName || "").trim();
  const trackingCode = String(req.body?.trackingCode || "").trim();
  const cancellationReason = String(req.body?.cancellationReason || "").trim();
  const adminNote = String(req.body?.adminNote || "").trim();

  if (
    !mongoose.isValidObjectId(orderId) ||
    !mongoose.isValidObjectId(sellerOrderId)
  ) {
    return res.status(400).json({
      message: "Invalid order ID",
    });
  }

  const session = await mongoose.startSession();

  let savedOrder = null;
  let savedSellerOrder = null;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        "sellerOrders._id": sellerOrderId,
      }).session(session);

      if (!order) {
        const error = new Error("Seller order not found");
        error.statusCode = 404;
        throw error;
      }

      const sellerOrder = order.sellerOrders.id(sellerOrderId);

      if (!sellerOrder) {
        const error = new Error("Seller sub-order not found");
        error.statusCode = 404;
        throw error;
      }

      const allowedStatuses =
        SELLER_STATUS_TRANSITIONS[sellerOrder.orderStatus] || [];

      if (!allowedStatuses.includes(nextStatus)) {
        const error = new Error(
          `Order cannot move from ${sellerOrder.orderStatus} to ${nextStatus}`,
        );
        error.statusCode = 422;
        error.allowedStatuses = allowedStatuses;
        throw error;
      }

      if (nextStatus === "shipped" && (!courierName || !trackingCode)) {
        const error = new Error("Courier name and tracking code are required");
        error.statusCode = 422;
        throw error;
      }

      if (nextStatus === "cancelled" && !cancellationReason) {
        const error = new Error("Cancellation reason is required");
        error.statusCode = 422;
        throw error;
      }

      ensureManualPaymentVerified(order, nextStatus);

      sellerOrder.orderStatus = nextStatus;

      if (nextStatus === "cancelled") {
        await restoreSellerOrderStock(sellerOrder, session);
        sellerOrder.cancelledBy = req.user._id;
        sellerOrder.cancellationReason = cancellationReason;
        sellerOrder.payoutStatus = "cancelled";
      }

      if (nextStatus === "shipped") {
        sellerOrder.courierName = courierName;
        sellerOrder.trackingCode = trackingCode;
      }

      if (adminNote) {
        sellerOrder.sellerNote = adminNote;
      }

      if (nextStatus === "delivered") {
        sellerOrder.deliveredAt = sellerOrder.deliveredAt || new Date();
        sellerOrder.paymentStatus = "paid";

        await processSellerEarning({
          order,
          sellerOrder,
          session,
        });
      }

      syncParentOrderStatus(order);
      syncParentPaymentStatus(order);

      if (order.paymentStatus === "paid") {
        order.paidAt = order.paidAt || new Date();
      }

      await order.save({ session });

      if (order.invoiceId) {
        const invoiceStatus =
          order.paymentStatus === "paid"
            ? "paid"
            : order.paymentStatus === "refunded"
              ? "refunded"
              : "unpaid";

        await Invoice.findByIdAndUpdate(
          order.invoiceId,
          {
            $set: {
              status: invoiceStatus,
              paidAt: invoiceStatus === "paid" ? order.paidAt : null,
            },
          },
          {
            session,
            runValidators: true,
          },
        );
      }

      savedOrder = order;
      savedSellerOrder = sellerOrder.toObject();
    });

    if (savedOrder.user) {
      await notifyUser({
        recipient: savedOrder.user,
        sender: req.user?._id || req.user?.id,
        type:
          savedSellerOrder.orderStatus === "delivered" ? "delivery" : "order",
        title: `Order ${savedSellerOrder.orderStatus}`,
        message: `${savedSellerOrder.shopName} changed your order status to ${savedSellerOrder.orderStatus}.`,
        orderId: savedOrder._id,
        shopId: savedSellerOrder.shop,
        sellerOrderId: savedSellerOrder._id,
        actionUrl: `/orders/${savedOrder._id}`,
        metadata: {
          orderStatus: savedSellerOrder.orderStatus,
          trackingCode: savedSellerOrder.trackingCode || "",
          courierName: savedSellerOrder.courierName || "",
        },
      }).catch((error) => {
        console.error("Customer notification failed:", error);
      });
    }

    return res.status(200).json({
      message: "Seller order updated by admin",
      parentOrderStatus: savedOrder.orderStatus,
      parentPaymentStatus: savedOrder.paymentStatus,
      sellerOrder: savedSellerOrder,
    });
  } catch (error) {
    console.error("updateAdminSellerOrderStatus error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Seller earning was already processed",
      });
    }

    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to update seller order",
      ...(error.allowedStatuses
        ? {
            allowedStatuses: error.allowedStatuses,
          }
        : {}),
    });
  } finally {
    await session.endSession();
  }
};