import mongoose from "mongoose";
import Order from "../model/order.model.js";
import Shop from "../model/shop.model.js";
import SellerTransaction from "../model/sellerTransaction.model.js";
import PayoutRequest from "../model/payoutRequest.model.js";
import {
  notifyUser,
  notifyAdmins,
} from "../services/notification.service.js";

const MIN_WITHDRAWAL = 100;

const roundMoney = (value) =>
  Math.max(0, Math.round(Number(value) || 0));

const validId = (id) =>
  mongoose.isValidObjectId(id);

const paymentMethodIsValid = (paymentMethod) => {
  if (!paymentMethod) return false;

  const {
    method,
    accountName,
    accountNumber,
    bankName,
  } = paymentMethod;

  if (
    !["bank", "bkash", "nagad", "rocket"].includes(
      method,
    )
  ) {
    return false;
  }

  if (
    !String(accountName || "").trim() ||
    !String(accountNumber || "").trim()
  ) {
    return false;
  }

  if (
    method === "bank" &&
    !String(bankName || "").trim()
  ) {
    return false;
  }

  return true;
};

/* =====================================================
   Seller: Wallet summary
===================================================== */

export const getMyWallet = async (req, res) => {
  try {
    const shop = await Shop.findOne({
      _id: req.shop._id,
      owner: req.user._id,
    })
      .select(
        "+paymentMethod pendingBalance availableBalance totalEarned",
      )
      .lean();

    if (!shop) {
      return res.status(404).json({
        message: "Seller shop not found",
      });
    }

    const [pendingWithdrawals, recentTransactions] =
      await Promise.all([
        PayoutRequest.aggregate([
          {
            $match: {
              seller: req.user._id,
              shop: req.shop._id,
              status: {
                $in: ["pending", "approved"],
              },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: "$amount",
              },
            },
          },
        ]),

        SellerTransaction.find({
          seller: req.user._id,
          shop: req.shop._id,
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

    return res.json({
      wallet: {
        pendingBalance: roundMoney(
          shop.pendingBalance,
        ),
        availableBalance: roundMoney(
          shop.availableBalance,
        ),
        totalEarned: roundMoney(
          shop.totalEarned,
        ),
        withdrawalReserved: roundMoney(
          pendingWithdrawals[0]?.total || 0,
        ),
      },

      paymentMethod:
        shop.paymentMethod || null,

      recentTransactions,
    });
  } catch (error) {
    console.error("getMyWallet error:", error);

    return res.status(500).json({
      message: "Failed to load wallet",
    });
  }
};

/* =====================================================
   Seller: Update payment method
===================================================== */

export const updatePaymentMethod = async (
  req,
  res,
) => {
  try {
    const method = String(
      req.body.method || "",
    )
      .trim()
      .toLowerCase();

    const paymentMethod = {
      method,
      accountName: String(
        req.body.accountName || "",
      ).trim(),

      accountNumber: String(
        req.body.accountNumber || "",
      ).trim(),

      bankName: String(
        req.body.bankName || "",
      ).trim(),

      branchName: String(
        req.body.branchName || "",
      ).trim(),

      routingNumber: String(
        req.body.routingNumber || "",
      ).trim(),
    };

    if (!paymentMethodIsValid(paymentMethod)) {
      return res.status(422).json({
        message:
          method === "bank"
            ? "Bank name, account name and account number are required"
            : "Valid payment method, account name and account number are required",
      });
    }

    const shop = await Shop.findOneAndUpdate(
      {
        _id: req.shop._id,
        owner: req.user._id,
        status: "approved",
        isActive: true,
      },
      {
        $set: {
          paymentMethod,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("+paymentMethod");

    if (!shop) {
      return res.status(404).json({
        message: "Active seller shop not found",
      });
    }

    return res.json({
      message:
        "Payment method updated successfully",
      paymentMethod: shop.paymentMethod,
    });
  } catch (error) {
    console.error(
      "updatePaymentMethod error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to update payment method",
    });
  }
};

/* =====================================================
   Seller: Transaction history
===================================================== */

export const getMyTransactions = async (
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

    const status = String(
      req.query.status || "",
    ).trim();

    const type = String(
      req.query.type || "",
    ).trim();

    const query = {
      seller: req.user._id,
      shop: req.shop._id,

      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    };

    const [items, total] = await Promise.all([
      SellerTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(
          "order",
          "orderStatus paymentStatus totalPrice createdAt",
        )
        .lean(),

      SellerTransaction.countDocuments(query),
    ]);

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(
      "getMyTransactions error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load transactions",
    });
  }
};

/* =====================================================
   Seller: Create withdrawal request
===================================================== */

export const requestWithdrawal = async (
  req,
  res,
) => {
  const session =
    await mongoose.startSession();

  let payout = null;
  let availableBalance = 0;
  let notificationShop = null;

  try {
    const amount = roundMoney(
      req.body.amount,
    );

    const sellerNote = String(
      req.body.sellerNote || "",
    ).trim();

    if (amount < MIN_WITHDRAWAL) {
      return res.status(422).json({
        message: `Minimum withdrawal amount is ${MIN_WITHDRAWAL}`,
      });
    }

    await session.withTransaction(
      async () => {
        const shop = await Shop.findOne({
          _id: req.shop._id,
          owner: req.user._id,
          status: "approved",
          isActive: true,
        })
          .select("+paymentMethod")
          .session(session);

        if (!shop) {
          const error = new Error(
            "Active seller shop not found",
          );

          error.statusCode = 404;
          throw error;
        }

        if (
          !paymentMethodIsValid(
            shop.paymentMethod,
          )
        ) {
          const error = new Error(
            "Add a valid payment method before requesting withdrawal",
          );

          error.statusCode = 422;
          throw error;
        }

        /*
         * Conditional update থাকার কারণে
         * simultaneous request হলেও
         * balance negative হবে না।
         */
        const reservedShop =
          await Shop.findOneAndUpdate(
            {
              _id: shop._id,
              owner: req.user._id,
              status: "approved",
              isActive: true,
              availableBalance: {
                $gte: amount,
              },
            },
            {
              $inc: {
                availableBalance: -amount,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!reservedShop) {
          const error = new Error(
            "Insufficient available balance",
          );

          error.statusCode = 422;
          throw error;
        }

        const [transaction] =
          await SellerTransaction.create(
            [
              {
                seller: req.user._id,
                shop: shop._id,

                type: "withdrawal",
                balanceEffect: "debit",

                amount,
                status: "requested",

                description:
                  "Seller withdrawal request",
              },
            ],
            {
              session,
            },
          );

        const [createdPayout] =
          await PayoutRequest.create(
            [
              {
                seller: req.user._id,
                shop: shop._id,
                amount,

                paymentMethod: {
                  method:
                    shop.paymentMethod.method,

                  accountName:
                    shop.paymentMethod
                      .accountName,

                  accountNumber:
                    shop.paymentMethod
                      .accountNumber,

                  bankName:
                    shop.paymentMethod
                      .bankName || "",

                  branchName:
                    shop.paymentMethod
                      .branchName || "",

                  routingNumber:
                    shop.paymentMethod
                      .routingNumber || "",
                },

                sellerNote,
                status: "pending",
                transaction:
                  transaction._id,
              },
            ],
            {
              session,
            },
          );

        payout = createdPayout;

        availableBalance =
          reservedShop.availableBalance;

        notificationShop = {
          _id: shop._id,
          shopName: shop.shopName,
        };
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

    // Transaction commit হওয়ার পরে notification
    await notifyAdmins({
      sender:
        req.user?._id || req.user?.id,

      type: "payout",
      title: "New withdrawal request",

      message: `${notificationShop.shopName} requested a withdrawal of ৳${payout.amount}.`,

      shopId: notificationShop._id,
      payoutId: payout._id,

      actionUrl:
        `/admin/payouts/${payout._id}`,

      priority: "high",

      metadata: {
        amount: payout.amount,
        method:
          payout.paymentMethod?.method,
        status: payout.status,
      },
    }).catch((error) => {
      console.error(
        "Withdrawal notification failed:",
        error,
      );
    });

    return res.status(201).json({
      message:
        "Withdrawal request submitted successfully",

      payout,
      availableBalance,
    });
  } catch (error) {
    console.error(
      "requestWithdrawal error:",
      error,
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "Duplicate withdrawal transaction detected",
      });
    }

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to submit withdrawal request",
      });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Seller: My withdrawal requests
===================================================== */

export const getMyWithdrawals = async (
  req,
  res,
) => {
  try {
    const items = await PayoutRequest.find({
      seller: req.user._id,
      shop: req.shop._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (error) {
    return res.status(500).json({
      message:
        "Failed to load withdrawal requests",
    });
  }
};

/* =====================================================
   Seller: Cancel pending withdrawal
===================================================== */

export const cancelMyWithdrawal = async (
  req,
  res,
) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid payout ID",
    });
  }

  const session =
    await mongoose.startSession();

  let payout = null;
  let availableBalance = 0;

  try {
    await session.withTransaction(
      async () => {
        /*
         * শুধু pending payout-ই cancel হবে।
         * একই request দ্বিতীয়বার পাঠালে
         * balance আর ফেরত দেবে না।
         */
        payout =
          await PayoutRequest.findOneAndUpdate(
            {
              _id: req.params.id,
              seller: req.user._id,
              shop: req.shop._id,
              status: "pending",
            },
            {
              $set: {
                status: "cancelled",
                processedAt: new Date(),
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!payout) {
          const existingPayout =
            await PayoutRequest.findOne({
              _id: req.params.id,
              seller: req.user._id,
              shop: req.shop._id,
            }).session(session);

          const error = new Error(
            existingPayout
              ? `Withdrawal cannot be cancelled because its status is ${existingPayout.status}`
              : "Withdrawal request not found",
          );

          error.statusCode = existingPayout
            ? 409
            : 404;

          throw error;
        }

        const shop =
          await Shop.findOneAndUpdate(
            {
              _id: payout.shop,
              owner: payout.seller,
            },
            {
              $inc: {
                availableBalance:
                  payout.amount,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!shop) {
          const error = new Error(
            "Seller shop not found",
          );

          error.statusCode = 404;
          throw error;
        }

        if (!payout.transaction) {
          const error = new Error(
            "Withdrawal transaction reference not found",
          );

          error.statusCode = 409;
          throw error;
        }

        const transaction =
          await SellerTransaction.findOneAndUpdate(
            {
              _id: payout.transaction,
              seller: payout.seller,
              shop: payout.shop,
              type: "withdrawal",
              status: "requested",
            },
            {
              $set: {
                status: "cancelled",
                processedAt: new Date(),
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!transaction) {
          const error = new Error(
            "Withdrawal transaction is already processed or missing",
          );

          error.statusCode = 409;
          throw error;
        }

        availableBalance =
          shop.availableBalance;
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

    // Commit হওয়ার পর admin notification
    await notifyAdmins({
      sender:
        req.user?._id || req.user?.id,

      type: "payout",
      title: "Withdrawal cancelled",

      message: `Seller cancelled a withdrawal request of ৳${payout.amount}.`,

      shopId: payout.shop,
      payoutId: payout._id,

      actionUrl:
        `/admin/payouts/${payout._id}`,

      metadata: {
        amount: payout.amount,
        status: payout.status,
      },
    }).catch((error) => {
      console.error(
        "Withdrawal cancellation notification failed:",
        error,
      );
    });

    return res.status(200).json({
      message:
        "Withdrawal request cancelled",

      payout,
      availableBalance,
    });
  } catch (error) {
    console.error(
      "cancelMyWithdrawal error:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to cancel withdrawal request",
      });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Admin: Release pending earning
===================================================== */

export const releaseSellerEarning = async (
  req,
  res,
) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid transaction ID",
    });
  }

  const session =
    await mongoose.startSession();

  let transaction = null;
  let wallet = null;

  try {
    await session.withTransaction(
      async () => {
        /*
         * শুধু pending earning-ই release হবে।
         * একই transaction দ্বিতীয়বার release
         * করা যাবে না।
         */
        transaction =
          await SellerTransaction.findOneAndUpdate(
            {
              _id: req.params.id,
              type: "earning",
              status: "pending",
            },
            {
              $set: {
                status: "available",
                processedBy: req.user._id,
                processedAt: new Date(),
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!transaction) {
          const existingTransaction =
            await SellerTransaction.findById(
              req.params.id,
            ).session(session);

          let message =
            "Earning transaction not found";

          let statusCode = 404;

          if (existingTransaction) {
            message =
              existingTransaction.type !==
              "earning"
                ? "Transaction is not an earning transaction"
                : `Earning is already ${existingTransaction.status}`;

            statusCode = 409;
          }

          const error = new Error(message);
          error.statusCode = statusCode;

          throw error;
        }

        const amount = roundMoney(
          transaction.amount,
        );

        if (amount <= 0) {
          const error = new Error(
            "Invalid earning amount",
          );

          error.statusCode = 422;
          throw error;
        }

        const shop =
          await Shop.findOneAndUpdate(
            {
              _id: transaction.shop,
              owner: transaction.seller,

              pendingBalance: {
                $gte: amount,
              },
            },
            {
              $inc: {
                pendingBalance: -amount,
                availableBalance: amount,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!shop) {
          const error = new Error(
            "Shop pending balance is insufficient or shop was not found",
          );

          error.statusCode = 409;
          throw error;
        }

        /*
         * সংশ্লিষ্ট seller sub-order-এর
         * payoutStatus available করা।
         */
        if (
          transaction.order &&
          transaction.sellerOrderId
        ) {
          await Order.updateOne(
            {
              _id: transaction.order,

              sellerOrders: {
                $elemMatch: {
                  _id:
                    transaction.sellerOrderId,
                  seller:
                    transaction.seller,
                },
              },
            },
            {
              $set: {
                "sellerOrders.$.payoutStatus":
                  "available",
              },
            },
            {
              session,
            },
          );
        }

        wallet = {
          pendingBalance:
            shop.pendingBalance,

          availableBalance:
            shop.availableBalance,

          totalEarned:
            shop.totalEarned,
        };
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

    // Transaction commit হওয়ার পর seller notification
    await notifyUser({
      recipient: transaction.seller,
      sender:
        req.user?._id || req.user?.id,

      type: "payment",
      title: "Earning available",

      message: `৳${transaction.amount} is now available for withdrawal.`,

      orderId: transaction.order,
      shopId: transaction.shop,
      sellerOrderId:
        transaction.sellerOrderId,

      actionUrl: "/seller/wallet",

      metadata: {
        amount: transaction.amount,
        status: transaction.status,
      },
    }).catch((error) => {
      console.error(
        "Earning release notification failed:",
        error,
      );
    });

    return res.status(200).json({
      message:
        "Seller earning released successfully",

      transaction,
      wallet,
    });
  } catch (error) {
    console.error(
      "releaseSellerEarning error:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to release seller earning",
      });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Admin: Payout list
===================================================== */

export const getAllPayoutRequests = async (
  req,
  res,
) => {
  try {
    const status = String(
      req.query.status || "",
    ).trim();

    const query = status ? { status } : {};

    const items = await PayoutRequest.find(query)
      .populate("seller", "name email mobile")
      .populate("shop", "shopName slug")
      .populate(
        "processedBy",
        "name email role",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (error) {
    return res.status(500).json({
      message:
        "Failed to load payout requests",
    });
  }
};

/* =====================================================
   Admin: Approve payout
===================================================== */

export const approvePayout = async (
  req,
  res,
) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid payout ID",
    });
  }

  const adminNote = String(
    req.body.adminNote || "",
  ).trim();

  const session =
    await mongoose.startSession();

  let payout = null;

  try {
    await session.withTransaction(
      async () => {
        const processedAt = new Date();

        /*
         * শুধু pending payout-ই
         * approve করা যাবে।
         */
        payout =
          await PayoutRequest.findOneAndUpdate(
            {
              _id: req.params.id,
              status: "pending",
            },
            {
              $set: {
                status: "approved",
                adminNote,

                processedBy:
                  req.user._id,

                processedAt,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!payout) {
          const existingPayout =
            await PayoutRequest.findById(
              req.params.id,
            ).session(session);

          const error = new Error(
            existingPayout
              ? `Payout cannot be approved because its status is ${existingPayout.status}`
              : "Payout request not found",
          );

          error.statusCode = existingPayout
            ? 409
            : 404;

          throw error;
        }

        if (!payout.transaction) {
          const error = new Error(
            "Withdrawal transaction reference not found",
          );

          error.statusCode = 409;
          throw error;
        }

        /*
         * সংশ্লিষ্ট withdrawal transaction
         * requested থেকে approved হবে।
         */
        const transaction =
          await SellerTransaction.findOneAndUpdate(
            {
              _id: payout.transaction,
              seller: payout.seller,
              shop: payout.shop,
              type: "withdrawal",
              status: "requested",
            },
            {
              $set: {
                status: "approved",

                processedBy:
                  req.user._id,

                processedAt,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!transaction) {
          const error = new Error(
            "Requested withdrawal transaction not found or already processed",
          );

          error.statusCode = 409;
          throw error;
        }
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

    // Transaction commit হওয়ার পর notification
    await notifyUser({
      recipient: payout.seller,
      sender:
        req.user?._id || req.user?.id,

      type: "payout",
      title: "Withdrawal approved",

      message: `Your withdrawal request of ৳${payout.amount} has been approved.`,

      shopId: payout.shop,
      payoutId: payout._id,

      actionUrl:
        `/seller/wallet/payouts/${payout._id}`,

      metadata: {
        amount: payout.amount,
        status: payout.status,
        adminNote:
          payout.adminNote || "",
      },
    }).catch((error) => {
      console.error(
        "Payout approval notification failed:",
        error,
      );
    });

    return res.status(200).json({
      message:
        "Payout request approved",

      payout,
    });
  } catch (error) {
    console.error(
      "approvePayout error:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to approve payout",
      });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Admin: Reject payout and refund balance
===================================================== */

export const rejectPayout = async (
  req,
  res,
) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid payout ID",
    });
  }

  const reason = String(
    req.body.reason || "",
  ).trim();

  if (!reason) {
    return res.status(422).json({
      message:
        "Rejection reason is required",
    });
  }

  const session =
    await mongoose.startSession();

  let payout = null;
  let availableBalance = 0;

  try {
    await session.withTransaction(
      async () => {
        /*
         * শুধু pending অথবা approved payout
         * reject করা যাবে।
         */
        payout =
          await PayoutRequest.findOneAndUpdate(
            {
              _id: req.params.id,

              status: {
                $in: [
                  "pending",
                  "approved",
                ],
              },
            },
            {
              $set: {
                status: "rejected",
                adminNote: reason,

                processedBy:
                  req.user._id,

                processedAt:
                  new Date(),
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!payout) {
          const existingPayout =
            await PayoutRequest.findById(
              req.params.id,
            ).session(session);

          const error = new Error(
            existingPayout
              ? `Payout cannot be rejected because its status is ${existingPayout.status}`
              : "Payout request not found",
          );

          error.statusCode = existingPayout
            ? 409
            : 404;

          throw error;
        }

        if (!payout.transaction) {
          const error = new Error(
            "Withdrawal transaction reference not found",
          );

          error.statusCode = 409;
          throw error;
        }

        /*
         * Withdrawal transaction শুধু
         * requested/approved অবস্থায় reject হবে।
         */
        const transaction =
          await SellerTransaction.findOneAndUpdate(
            {
              _id: payout.transaction,
              seller: payout.seller,
              shop: payout.shop,
              type: "withdrawal",

              status: {
                $in: [
                  "requested",
                  "approved",
                ],
              },
            },
            {
              $set: {
                status: "rejected",

                processedBy:
                  req.user._id,

                processedAt:
                  new Date(),
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!transaction) {
          const error = new Error(
            "Withdrawal transaction is already processed or missing",
          );

          error.statusCode = 409;
          throw error;
        }

        /*
         * Reserve করা টাকা seller-এর
         * available balance-এ ফেরত দেওয়া।
         */
        const shop =
          await Shop.findOneAndUpdate(
            {
              _id: payout.shop,
              owner: payout.seller,
            },
            {
              $inc: {
                availableBalance:
                  payout.amount,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!shop) {
          const error = new Error(
            "Seller shop not found",
          );

          error.statusCode = 404;
          throw error;
        }

        availableBalance =
          shop.availableBalance;
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

    // Commit হওয়ার পরে seller notification
    await notifyUser({
      recipient: payout.seller,
      sender:
        req.user?._id || req.user?.id,

      type: "payout",
      title:
        "Withdrawal request rejected",

      message: `Your withdrawal request of ৳${payout.amount} was rejected.`,

      shopId: payout.shop,
      payoutId: payout._id,

      actionUrl:
        `/seller/wallet/payouts/${payout._id}`,

      priority: "high",

      metadata: {
        amount: payout.amount,
        status: payout.status,
        reason,
      },
    }).catch((error) => {
      console.error(
        "Payout rejection notification failed:",
        error,
      );
    });

    return res.status(200).json({
      message:
        "Payout rejected and balance refunded",

      payout,
      availableBalance,
    });
  } catch (error) {
    console.error(
      "rejectPayout error:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to reject payout",
      });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Admin: Mark approved payout as paid
===================================================== */

export const markPayoutPaid = async (
  req,
  res,
) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid payout ID",
    });
  }

  const adminNote = String(
    req.body.adminNote || "",
  ).trim();

  const session =
    await mongoose.startSession();

  let payout = null;

  try {
    await session.withTransaction(
      async () => {
        const paidAt = new Date();

        /*
         * শুধু approved payout-ই
         * paid করা যাবে।
         */
        payout =
          await PayoutRequest.findOneAndUpdate(
            {
              _id: req.params.id,
              status: "approved",
            },
            {
              $set: {
                status: "paid",
                adminNote,

                processedBy:
                  req.user._id,

                processedAt: paidAt,
                paidAt,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!payout) {
          const existingPayout =
            await PayoutRequest.findById(
              req.params.id,
            ).session(session);

          const error = new Error(
            existingPayout
              ? `Payout cannot be marked as paid because its status is ${existingPayout.status}`
              : "Payout request not found",
          );

          error.statusCode = existingPayout
            ? 409
            : 404;

          throw error;
        }

        if (!payout.transaction) {
          const error = new Error(
            "Withdrawal transaction reference not found",
          );

          error.statusCode = 409;
          throw error;
        }

        /*
         * সংশ্লিষ্ট withdrawal transaction-ও
         * approved থেকে paid হবে।
         */
        const transaction =
          await SellerTransaction.findOneAndUpdate(
            {
              _id: payout.transaction,
              seller: payout.seller,
              shop: payout.shop,
              type: "withdrawal",
              status: "approved",
            },
            {
              $set: {
                status: "paid",

                processedBy:
                  req.user._id,

                processedAt: paidAt,
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!transaction) {
          const error = new Error(
            "Approved withdrawal transaction not found or already processed",
          );

          error.statusCode = 409;
          throw error;
        }
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

    // Commit সফল হওয়ার পর notification
    await notifyUser({
      recipient: payout.seller,
      sender:
        req.user?._id || req.user?.id,

      type: "payment",

      title:
        "Withdrawal payment completed",

      message: `৳${payout.amount} has been sent to your ${payout.paymentMethod?.method || "payment"} account.`,

      shopId: payout.shop,
      payoutId: payout._id,

      actionUrl:
        `/seller/wallet/payouts/${payout._id}`,

      priority: "high",

      metadata: {
        amount: payout.amount,
        status: payout.status,
        paidAt: payout.paidAt,
        adminNote:
          payout.adminNote || "",
      },
    }).catch((error) => {
      console.error(
        "Paid payout notification failed:",
        error,
      );
    });

    return res.status(200).json({
      message:
        "Payout marked as paid",

      payout,
    });
  } catch (error) {
    console.error(
      "markPayoutPaid error:",
      error,
    );

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to mark payout as paid",
      });
  } finally {
    await session.endSession();
  }
};

export const getAdminSellerTransactions = async (
  req,
  res,
) => {
  try {
    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit || 20),
        1,
      ),
      100,
    );

    const type = String(
      req.query.type || "",
    ).trim();

    const status = String(
      req.query.status || "",
    ).trim();

    const seller = String(
      req.query.seller || "",
    ).trim();

    const shop = String(
      req.query.shop || "",
    ).trim();

    const validTypes = [
      "earning",
      "earning_release",
      "withdrawal",
      "refund",
      "adjustment",
    ];

    const validStatuses = [
      "pending",
      "available",
      "requested",
      "approved",
      "paid",
      "rejected",
      "cancelled",
    ];

    if (
      type &&
      !validTypes.includes(type)
    ) {
      return res.status(422).json({
        message:
          "Invalid transaction type",
      });
    }

    if (
      status &&
      !validStatuses.includes(status)
    ) {
      return res.status(422).json({
        message:
          "Invalid transaction status",
      });
    }

    if (
      seller &&
      !mongoose.isValidObjectId(seller)
    ) {
      return res.status(400).json({
        message: "Invalid seller ID",
      });
    }

    if (
      shop &&
      !mongoose.isValidObjectId(shop)
    ) {
      return res.status(400).json({
        message: "Invalid shop ID",
      });
    }

    const filter = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(seller ? { seller } : {}),
      ...(shop ? { shop } : {}),
    };

    const [items, total] =
      await Promise.all([
        SellerTransaction.find(filter)
          .populate(
            "seller",
            "name email mobile profileImage sellerStatus",
          )
          .populate(
            "shop",
            "shopName slug logo status isActive",
          )
          .populate(
            "order",
            "customer totalPrice orderStatus paymentStatus createdAt",
          )
          .populate(
            "processedBy",
            "name email role",
          )
          .populate(
            "returnRequest",
            "reason status totalRefundAmount",
          )
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        SellerTransaction.countDocuments(
          filter,
        ),
      ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(
        total / limit,
      ),
    });
  } catch (error) {
    console.error(
      "getAdminSellerTransactions error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load seller transactions",
      error: error.message,
    });
  }
};