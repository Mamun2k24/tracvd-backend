import mongoose from "mongoose";
import {
  User,
  Product,
  Shop,
  Order,
} from "../model/index.model.js";

import PayoutRequest from "../model/payoutRequest.model.js";
import SellerVerification from "../model/sellerVerification.model.js";
import ReturnRequest from "../model/returnRequest.model.js";

const roundMoney = (value) =>
  Math.max(0, Math.round(Number(value) || 0));

/* =====================================================
   Admin marketplace dashboard
===================================================== */

export const getMarketplaceDashboard = async (
  req,
  res,
) => {
  try {
const [
  sellerStats,
  shopStats,
  productStats,
  orderStats,
  walletStats,
  payoutStats,
  applicationStats,
  returnStats,
  recentApplications,
  recentPayouts,
] = await Promise.all([
      User.aggregate([
        {
          $match: {
            role: "seller",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },

            approved: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerStatus",
                      "approved",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            suspended: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerStatus",
                      "suspended",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            inactive: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$isActive",
                      false,
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

      Shop.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },

            approved: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "approved",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            suspended: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "suspended",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            active: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$isActive",
                      true,
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

      Product.aggregate([
        {
          $match: {
            productSource: "seller",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },

            pending: {
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

            approved: {
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

            rejected: {
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

            published: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$isPublished",
                      true,
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
            "sellerOrders.source": "seller",
          },
        },
        {
          $group: {
            _id: null,
            totalSellerOrders: {
              $sum: 1,
            },

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

            commission: {
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

            sellerEarnings: {
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

            totalShipping: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$sellerOrders.orderStatus",
                      "delivered",
                    ],
                  },
                  "$sellerOrders.shippingCost",
                  0,
                ],
              },
            },
          },
        },
      ]),

      Shop.aggregate([
        {
          $group: {
            _id: null,

            pendingBalance: {
              $sum: "$pendingBalance",
            },

            availableBalance: {
              $sum: "$availableBalance",
            },

            totalEarned: {
              $sum: "$totalEarned",
            },
          },
        },
      ]),

      PayoutRequest.aggregate([
        {
          $group: {
            _id: null,

            totalRequests: {
              $sum: 1,
            },

            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "pending",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            pendingAmount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "pending",
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },

            approvedAmount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "approved",
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },

            paidAmount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "paid",
                    ],
                  },
                  "$amount",
                  0,
                ],
              },
            },

            rejectedAmount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "rejected",
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

      SellerVerification.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },

            pending: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "pending"] },
                  1,
                  0,
                ],
              },
            },

            approved: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "approved"] },
                  1,
                  0,
                ],
              },
            },

            rejected: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "rejected"] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      ReturnRequest.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },

            requested: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "requested"] },
                  1,
                  0,
                ],
              },
            },

            inProgress: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      ["approved", "returning", "received"],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            refunded: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "refunded"] },
                  1,
                  0,
                ],
              },
            },

            refundAmount: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "refunded"] },
                  {
                    $ifNull: [
                      "$totalRefundAmount",
                      0,
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),

      SellerVerification.find()
        .populate(
          "userId",
          "name email mobile profileImage",
        )
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          "businessName status userId createdAt",
        )
        .lean(),

      PayoutRequest.find()
        .populate(
          "seller",
          "name email mobile",
        )
        .populate(
          "shop",
          "shopName slug",
        )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const sellers = sellerStats[0] || {};
    const shops = shopStats[0] || {};
    const products = productStats[0] || {};
    const orders = orderStats[0] || {};
    const wallets = walletStats[0] || {};
    const payouts = payoutStats[0] || {};
    const applications =
      applicationStats[0] || {};
    const returns =
      returnStats[0] || {};

    return res.json({
      sellers: {
        total: sellers.total || 0,
        approved: sellers.approved || 0,
        suspended:
          sellers.suspended || 0,
        inactive: sellers.inactive || 0,
      },

      applications: {
        total: applications.total || 0,
        pending: applications.pending || 0,
        approved: applications.approved || 0,
        rejected: applications.rejected || 0,
      },

      shops: {
        total: shops.total || 0,
        approved: shops.approved || 0,
        active: shops.active || 0,
        suspended: shops.suspended || 0,
      },

      products: {
        total: products.total || 0,
        pending: products.pending || 0,
        approved: products.approved || 0,
        rejected: products.rejected || 0,
        published: products.published || 0,
      },

      orders: {
        totalSellerOrders:
          orders.totalSellerOrders || 0,
        pending: orders.pendingOrders || 0,
        processing:
          orders.processingOrders || 0,
        shipped: orders.shippedOrders || 0,
        delivered:
          orders.deliveredOrders || 0,
        cancelled:
          orders.cancelledOrders || 0,
      },

      finance: {
        grossSales: roundMoney(
          orders.grossSales,
        ),
        shippingRevenue: roundMoney(
          orders.totalShipping,
        ),
        platformCommission: roundMoney(
          orders.commission,
        ),
        sellerEarnings: roundMoney(
          orders.sellerEarnings,
        ),
      },

      wallets: {
        pendingBalance: roundMoney(
          wallets.pendingBalance,
        ),
        availableBalance: roundMoney(
          wallets.availableBalance,
        ),
        totalEarned: roundMoney(
          wallets.totalEarned,
        ),
      },

      payouts: {
        totalRequests:
          payouts.totalRequests || 0,
        pendingCount:
          payouts.pendingCount || 0,
        pendingAmount: roundMoney(
          payouts.pendingAmount,
        ),
        approvedAmount: roundMoney(
          payouts.approvedAmount,
        ),
        paidAmount: roundMoney(
          payouts.paidAmount,
        ),
        rejectedAmount: roundMoney(
          payouts.rejectedAmount,
        ),
      },

      returns: {
        total: returns.total || 0,
        requested: returns.requested || 0,
        inProgress: returns.inProgress || 0,
        refunded: returns.refunded || 0,
        refundAmount: roundMoney(
          returns.refundAmount,
        ),
      },

      recentApplications,
      recentPayouts,
    });
  } catch (error) {
    console.error(
      "getMarketplaceDashboard error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load marketplace dashboard",
    });
  }
};

/* =====================================================
   Admin seller-wise performance report
===================================================== */

export const getSellerPerformance = async (
  req,
  res,
) => {
  try {
    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100,
    );

    const pipeline = [
      {
        $unwind: "$sellerOrders",
      },
      {
        $match: {
          "sellerOrders.source": "seller",
        },
      },
      {
        $group: {
          _id: {
            seller:
              "$sellerOrders.seller",
            shop: "$sellerOrders.shop",
          },

          totalOrders: { $sum: 1 },

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

          commission: {
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

          sellerEarnings: {
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
      {
        $lookup: {
          from: "users",
          localField: "_id.seller",
          foreignField: "_id",
          as: "seller",
        },
      },
      {
        $lookup: {
          from: "shops",
          localField: "_id.shop",
          foreignField: "_id",
          as: "shop",
        },
      },
      {
        $unwind: {
          path: "$seller",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$shop",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,

          sellerId: "$_id.seller",
          shopId: "$_id.shop",

          sellerName: "$seller.name",
          sellerEmail: "$seller.email",

          shopName: "$shop.shopName",
          shopSlug: "$shop.slug",
          shopStatus: "$shop.status",

          pendingBalance:
            "$shop.pendingBalance",
          availableBalance:
            "$shop.availableBalance",
          totalEarned:
            "$shop.totalEarned",

          totalOrders: 1,
          deliveredOrders: 1,
          cancelledOrders: 1,
          grossSales: 1,
          commission: 1,
          sellerEarnings: 1,
        },
      },
      {
        $sort: {
          grossSales: -1,
        },
      },
    ];

    const countResult =
      await Order.aggregate([
        ...pipeline,
        {
          $count: "total",
        },
      ]);

    const items = await Order.aggregate([
      ...pipeline,
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: limit,
      },
    ]);

    const total = countResult[0]?.total || 0;

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(
      "getSellerPerformance error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load seller performance",
    });
  }
};