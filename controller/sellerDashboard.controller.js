import mongoose from "mongoose";
import {
  Order,
  Product,
  Shop,
} from "../model/index.model.js";
import PayoutRequest from "../model/payoutRequest.model.js";

const roundMoney = (value) =>
  Math.max(0, Math.round(Number(value) || 0));

export const getSellerDashboard = async (
  req,
  res,
) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(
      req.user._id,
    );

    const shopId = new mongoose.Types.ObjectId(
      req.shop._id,
    );

    const [
      productStats,
      orderStats,
      recentOrders,
      shop,
      withdrawalStats,
    ] = await Promise.all([
      Product.aggregate([
        {
          $match: {
            seller: sellerId,
            shop: shopId,
            productSource: "seller",
          },
        },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },

            pendingProducts: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$approvalStatus",
                      "pending",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            approvedProducts: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$approvalStatus",
                      "approved",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            rejectedProducts: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$approvalStatus",
                      "rejected",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            totalStock: {
              $sum: {
                $ifNull: ["$stock", 0],
              },
            },

            outOfStockProducts: {
              $sum: {
                $cond: [
                  {
                    $lte: [
                      {
                        $ifNull: ["$stock", 0],
                      },
                      0,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      Order.aggregate([
        {
          $unwind: "$sellerOrders",
        },
        {
          $match: {
            "sellerOrders.seller": sellerId,
            "sellerOrders.shop": shopId,
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },

            pendingOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "pending",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            processingOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "processing",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            shippedOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "shipped",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            deliveredOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "delivered",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            cancelledOrders: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "cancelled",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            grossSales: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "delivered",
                    ],
                  },
                  "$sellerOrders.total",
                  0,
                ],
              },
            },

            totalCommission: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "delivered",
                    ],
                  },
                  "$sellerOrders.commissionAmount",
                  0,
                ],
              },
            },

            sellerRevenue: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "delivered",
                    ],
                  },
                  "$sellerOrders.sellerEarning",
                  0,
                ],
              },
            },
          },
        },
      ]),

      Order.aggregate([
        {
          $unwind: "$sellerOrders",
        },
        {
          $match: {
            "sellerOrders.seller": sellerId,
            "sellerOrders.shop": shopId,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $limit: 5,
        },
        {
          $project: {
            _id: 0,
            parentOrderId: "$_id",
            sellerOrderId:
              "$sellerOrders._id",
            shopName:
              "$sellerOrders.shopName",
            customer: 1,
            total:
              "$sellerOrders.total",
            orderStatus:
              "$sellerOrders.orderStatus",
            paymentStatus:
              "$sellerOrders.paymentStatus",
            itemCount: {
              $size:
                "$sellerOrders.items",
            },
            createdAt: 1,
          },
        },
      ]),

      Shop.findOne({
        _id: shopId,
        owner: sellerId,
      })
        .select(
          "shopName slug logo status pendingBalance availableBalance totalEarned ratingAverage ratingCount",
        )
        .lean(),

      PayoutRequest.aggregate([
        {
          $match: {
            seller: sellerId,
            shop: shopId,
          },
        },
        {
          $group: {
            _id: null,

            totalWithdrawn: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$status", "paid"],
                  },
                  "$amount",
                  0,
                ],
              },
            },

            pendingWithdrawal: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["pending", "approved"],
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const products = productStats[0] || {};
    const orders = orderStats[0] || {};
    const withdrawals =
      withdrawalStats[0] || {};

    return res.json({
      shop,

      products: {
        total: products.totalProducts || 0,
        pending:
          products.pendingProducts || 0,
        approved:
          products.approvedProducts || 0,
        rejected:
          products.rejectedProducts || 0,
        totalStock:
          products.totalStock || 0,
        outOfStock:
          products.outOfStockProducts || 0,
      },

      orders: {
        total: orders.totalOrders || 0,
        pending: orders.pendingOrders || 0,
        processing:
          orders.processingOrders || 0,
        shipped: orders.shippedOrders || 0,
        delivered:
          orders.deliveredOrders || 0,
        cancelled:
          orders.cancelledOrders || 0,
      },

      sales: {
        grossSales: roundMoney(
          orders.grossSales,
        ),
        commission: roundMoney(
          orders.totalCommission,
        ),
        sellerRevenue: roundMoney(
          orders.sellerRevenue,
        ),
      },

      wallet: {
        pendingBalance: roundMoney(
          shop?.pendingBalance,
        ),
        availableBalance: roundMoney(
          shop?.availableBalance,
        ),
        totalEarned: roundMoney(
          shop?.totalEarned,
        ),
        totalWithdrawn: roundMoney(
          withdrawals.totalWithdrawn,
        ),
        pendingWithdrawal: roundMoney(
          withdrawals.pendingWithdrawal,
        ),
      },

      recentOrders,
    });
  } catch (error) {
    console.error(
      "getSellerDashboard error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load seller dashboard",
    });
  }
};