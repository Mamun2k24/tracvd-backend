import mongoose from "mongoose";
import { createHash } from "crypto";

import { Order, Product, Shop } from "../model/index.model.js";

import ReturnRequest from "../model/returnRequest.model.js";
import SellerTransaction from "../model/sellerTransaction.model.js";
import Invoice from "../model/invoice.model.js";
import { notifyUser, notifyAdmins } from "../services/notification.service.js";

const RETURN_WINDOW_DAYS = Math.max(
  Number(process.env.RETURN_WINDOW_DAYS || 7),
  1,
);

const ALLOWED_REASONS = [
  "damaged",
  "wrong_product",
  "defective",
  "size_issue",
  "not_as_described",
  "changed_mind",
  "other",
];

const hashGuestToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const getGuestToken = (req) => {
  return String(
    req.get("x-guest-access-token") ||
      req.headers["x-guest-access-token"] ||
      req.body?.guestAccessToken ||
      req.query?.guestAccessToken ||
      "",
  ).trim();
};

const roundMoney = (value) => Math.max(0, Math.round(Number(value) || 0));

const sendNotificationSafely = async (promise) => {
  try {
    await promise;
  } catch (error) {
    console.error("Notification failed:", error);
  }
};

const createReturnForOrder = async ({
  order,
  sellerOrderId,
  requestedBy,
  user = null,
  guestId = null,
  reason,
  details,
  evidence,
}) => {
  const session = await mongoose.startSession();

  let savedReturnRequest = null;

  try {
    await session.withTransaction(
      async () => {
        /*
         * Authorized query থেকে পাওয়া order ID
         * দিয়ে transaction-এর মধ্যে fresh
         * document load করা হচ্ছে।
         */
        const transactionOrder = await Order.findOne({
          _id: order._id,

          sellerOrders: {
            $elemMatch: {
              _id: sellerOrderId,
            },
          },
        }).session(session);

        if (!transactionOrder) {
          const error = new Error("Related order not found");

          error.statusCode = 404;
          throw error;
        }

        const sellerOrder = transactionOrder.sellerOrders.id(sellerOrderId);

        if (!sellerOrder) {
          const error = new Error("Seller sub-order not found");

          error.statusCode = 404;
          throw error;
        }

        if (sellerOrder.orderStatus !== "delivered") {
          const error = new Error("Only delivered orders can be returned");

          error.statusCode = 409;
          throw error;
        }

        if (!sellerOrder.deliveredAt) {
          const error = new Error("Order delivery date is missing");

          error.statusCode = 409;
          throw error;
        }

        const returnDeadline = new Date(sellerOrder.deliveredAt);

        returnDeadline.setDate(returnDeadline.getDate() + RETURN_WINDOW_DAYS);

        if (new Date() > returnDeadline) {
          const error = new Error(
            `Return window of ${RETURN_WINDOW_DAYS} days has expired`,
          );

          error.statusCode = 409;
          throw error;
        }

        if (sellerOrder.returnStatus && sellerOrder.returnStatus !== "none") {
          const error = new Error(
            "A return request already exists for this seller order",
          );

          error.statusCode = 409;
          throw error;
        }

        const existingReturn = await ReturnRequest.findOne({
          order: transactionOrder._id,

          sellerOrderId: sellerOrder._id,
        }).session(session);

        if (existingReturn) {
          const error = new Error(
            "A return request already exists for this seller order",
          );

          error.statusCode = 409;
          throw error;
        }

        const productRefundAmount = roundMoney(
          sellerOrder.productTotalAfterDiscount,
        );

        // Delivery charge refund করা হবে না
        const shippingRefundAmount = 0;

        const commissionReversal = Math.min(
          productRefundAmount,

          roundMoney(sellerOrder.commissionAmount),
        );

        const isSellerOrder = Boolean(
          sellerOrder.seller &&
            sellerOrder.shop,
        );

        const sellerDeduction =
          isSellerOrder
            ? roundMoney(
                productRefundAmount -
                  commissionReversal,
              )
            : 0;

        const items = sellerOrder.items.map((item) => ({
          product: item.product,

          productName: item.productName,

          quantity: item.quantity,

          unitPrice: roundMoney(item.finalPrice || item.price),

          lineRefundAmount: roundMoney(item.lineTotal),
        }));

        const [returnRequest] = await ReturnRequest.create(
          [
            {
              order: transactionOrder._id,

              sellerOrderId: sellerOrder._id,

              seller: sellerOrder.seller,

              shop: sellerOrder.shop,

              user,
              guestId,
              requestedBy,

              items,
              reason,
              details,
              evidence,

              productRefundAmount,
              shippingRefundAmount,

              totalRefundAmount: roundMoney(
                productRefundAmount + shippingRefundAmount,
              ),

              sellerDeduction,
              commissionReversal,

              status: "requested",
            },
          ],
          {
            session,
          },
        );

        sellerOrder.returnStatus = "requested";

        sellerOrder.returnRequest = returnRequest._id;

        await transactionOrder.save({
          session,
        });

        savedReturnRequest = returnRequest;
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

    return savedReturnRequest;
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateError = new Error(
        "A return request already exists for this seller order",
      );

      duplicateError.statusCode = 409;
      duplicateError.code = 11000;

      throw duplicateError;
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Logged-in customer return request
===================================================== */

export const requestMyReturn = async (req, res) => {
  try {
    const { orderId, sellerOrderId } = req.params;

    const reason = String(req.body.reason || "")
      .trim()
      .toLowerCase();

    const details = String(req.body.details || "").trim();

    const evidence = Array.isArray(req.body.evidence)
      ? req.body.evidence.map(String).filter(Boolean)
      : [];

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sellerOrderId)
    ) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    if (!ALLOWED_REASONS.includes(reason)) {
      return res.status(422).json({
        message: "Invalid return reason",
      });
    }

    if (details.length < 10) {
      return res.status(422).json({
        message: "Return details must contain at least 10 characters",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,

      sellerOrders: {
        $elemMatch: {
          _id: sellerOrderId,
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found or access denied",
      });
    }

    const returnRequest = await createReturnForOrder({
      order,
      sellerOrderId,
      requestedBy: "customer",
      user: req.user._id,
      reason,
      details,
      evidence,
    });

    await sendNotificationSafely(
      notifyUser({
        recipient: returnRequest.seller,
        sender: returnRequest.user || null,
        type: "return",
        title: "New return request",
        message: `A return request was submitted for order #${returnRequest.order}.`,
        orderId: returnRequest.order,
        shopId: returnRequest.shop,
        returnRequestId: returnRequest._id,
        sellerOrderId: returnRequest.sellerOrderId,
        actionUrl: `/seller/returns/${returnRequest._id}`,
        priority: "high",
        metadata: {
          reason: returnRequest.reason,
          status: returnRequest.status,
          refundAmount: returnRequest.totalRefundAmount,
        },
      }),
    );

    await sendNotificationSafely(
      notifyAdmins({
        sender: returnRequest.user || null,
        type: "return",
        title: "New return request",
        message: "A new return request requires review.",
        orderId: returnRequest.order,
        shopId: returnRequest.shop,
        returnRequestId: returnRequest._id,
        sellerOrderId: returnRequest.sellerOrderId,
        actionUrl: `/admin/returns/${returnRequest._id}`,
        priority: "high",
      }),
    );

    return res.status(201).json({
      message: "Return request submitted successfully",
      returnRequest,
    });
  } catch (error) {
    console.error("requestMyReturn error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "A return request already exists for this seller order",
      });
    }

    const statusCode = Number(error?.statusCode) || 500;

    return res.status(statusCode).json({
      message:
        statusCode < 500 ? error.message : "Failed to submit return request",

      ...(process.env.NODE_ENV !== "production" && {
        error: error.message,
      }),
    });
  }
};

/* =====================================================
   Guest return request
===================================================== */

export const requestGuestReturn = async (req, res) => {
  try {
    const { orderId, sellerOrderId } = req.params;

    const guestId = String(req.body.guestId || "").trim();

    const guestAccessToken = getGuestToken(req);

    const reason = String(req.body.reason || "")
      .trim()
      .toLowerCase();

    const details = String(req.body.details || "").trim();

    const evidence = Array.isArray(req.body.evidence)
      ? req.body.evidence.map(String).filter(Boolean)
      : [];

    if (!guestId || !guestAccessToken) {
      return res.status(422).json({
        message: "Guest ID and access token are required",
      });
    }

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sellerOrderId)
    ) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    if (!ALLOWED_REASONS.includes(reason)) {
      return res.status(422).json({
        message: "Invalid return reason",
      });
    }

    if (details.length < 10) {
      return res.status(422).json({
        message: "Return details must contain at least 10 characters",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: null,
      guestId,

      guestAccessTokenHash: hashGuestToken(guestAccessToken),

      sellerOrders: {
        $elemMatch: {
          _id: sellerOrderId,
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        message: "Guest order not found or access denied",
      });
    }

    const returnRequest = await createReturnForOrder({
      order,
      sellerOrderId,
      requestedBy: "guest",
      guestId,
      reason,
      details,
      evidence,
    });
    await sendNotificationSafely(
      notifyUser({
        recipient: returnRequest.seller,
        sender: returnRequest.user || null,
        type: "return",
        title: "New return request",
        message: `A return request was submitted for order #${returnRequest.order}.`,
        orderId: returnRequest.order,
        shopId: returnRequest.shop,
        returnRequestId: returnRequest._id,
        sellerOrderId: returnRequest.sellerOrderId,
        actionUrl: `/seller/returns/${returnRequest._id}`,
        priority: "high",
        metadata: {
          reason: returnRequest.reason,
          status: returnRequest.status,
          refundAmount: returnRequest.totalRefundAmount,
        },
      }),
    );

    await sendNotificationSafely(
      notifyAdmins({
        sender: returnRequest.user || null,
        type: "return",
        title: "New return request",
        message: "A new return request requires review.",
        orderId: returnRequest.order,
        shopId: returnRequest.shop,
        returnRequestId: returnRequest._id,
        sellerOrderId: returnRequest.sellerOrderId,
        actionUrl: `/admin/returns/${returnRequest._id}`,
        priority: "high",
      }),
    );

    return res.status(201).json({
      message: "Return request submitted successfully",
      returnRequest,
    });
  } catch (error) {
    const knownError = [
      "Seller sub-order not found",
      "Only delivered orders",
      "Order delivery date",
      "Return window",
      "A return request",
    ].some((text) => error.message.startsWith(text));

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "A return request already exists",
      });
    }

    return res.status(knownError ? 409 : 500).json({
      message: knownError ? error.message : "Failed to submit return request",
    });
  }
};

/* =====================================================
   Customer: My returns
===================================================== */

export const getMyReturns = async (req, res) => {
  try {
    const items = await ReturnRequest.find({
      user: req.user._id,
    })
      .populate("shop", "shopName slug logo")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load return requests",
    });
  }
};

/* =====================================================
   Seller: Own shop returns
===================================================== */

export const getSellerReturns = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();

    const query = {
      seller: req.user._id,
      shop: req.shop._id,

      ...(status ? { status } : {}),
    };

    const items = await ReturnRequest.find(query)
      .populate("order", "customer address district createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load seller returns",
    });
  }
};

/* =====================================================
   Admin: All returns
===================================================== */

export const getAdminReturns = async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();

    const query = status ? { status } : {};

    const items = await ReturnRequest.find(query)
      .populate("user", "name email mobile")
      .populate("seller", "name email mobile")
      .populate("shop", "shopName slug")
      .populate("order", "customer address district paymentMethod createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load return requests",
    });
  }
};

/* =====================================================
   Admin: Approve or reject return
===================================================== */

export const decideReturnRequest = async (req, res) => {
  const id = req.params.id;

  const action = String(req.body.action || "")
    .trim()
    .toLowerCase();

  const adminNote = String(req.body.adminNote || "").trim();

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      message: "Invalid return request ID",
    });
  }

  if (!["approve", "reject"].includes(action)) {
    return res.status(422).json({
      message: "Action must be approve or reject",
    });
  }

  if (action === "reject" && !adminNote) {
    return res.status(422).json({
      message: "Rejection reason is required",
    });
  }

  const session = await mongoose.startSession();

  let savedReturnRequest = null;

  try {
    await session.withTransaction(
      async () => {
        const nextStatus = action === "approve" ? "approved" : "rejected";

        /*
         * শুধু requested return approve/reject হবে।
         */
        const returnRequest = await ReturnRequest.findOneAndUpdate(
          {
            _id: id,
            status: "requested",
          },
          {
            $set: {
              status: nextStatus,
              adminNote,

              decidedBy: req.user._id,

              decidedAt: new Date(),
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!returnRequest) {
          const existingReturn =
            await ReturnRequest.findById(id).session(session);

          const error = new Error(
            existingReturn
              ? `Return request is already ${existingReturn.status}`
              : "Return request not found",
          );

          error.statusCode = existingReturn ? 409 : 404;

          throw error;
        }

        const order = await Order.findOne({
          _id: returnRequest.order,

          "sellerOrders._id": returnRequest.sellerOrderId,
        }).session(session);

        if (!order) {
          const error = new Error("Related order not found");

          error.statusCode = 404;
          throw error;
        }

        const sellerOrder = order.sellerOrders.id(returnRequest.sellerOrderId);

        if (!sellerOrder) {
          const error = new Error("Seller sub-order not found");

          error.statusCode = 404;
          throw error;
        }

        if (String(sellerOrder.returnRequest) !== String(returnRequest._id)) {
          const error = new Error("Return request does not match seller order");

          error.statusCode = 409;
          throw error;
        }

        sellerOrder.returnStatus = nextStatus;

        await order.save({
          session,
        });

        savedReturnRequest = returnRequest;
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

    /*
     * Transaction commit হওয়ার পরে
     * customer notification।
     */
    if (savedReturnRequest.user) {
      await sendNotificationSafely(
        notifyUser({
          recipient: savedReturnRequest.user,

          sender: req.user?._id || req.user?.id,

          type: "return",

          title:
            action === "approve"
              ? "Return request approved"
              : "Return request rejected",

          message:
            action === "approve"
              ? "Your return request has been approved. Please return the product."
              : adminNote,

          orderId: savedReturnRequest.order,

          shopId: savedReturnRequest.shop,

          returnRequestId: savedReturnRequest._id,

          sellerOrderId: savedReturnRequest.sellerOrderId,

          actionUrl: `/orders/${savedReturnRequest.order}`,

          priority: action === "reject" ? "high" : "normal",

          metadata: {
            status: savedReturnRequest.status,

            reason: action === "reject" ? adminNote : "",
          },
        }),
      );
    }

    // Platform return-এ seller null থাকে।
    if (savedReturnRequest.seller) {
      await sendNotificationSafely(
        notifyUser({
          recipient: savedReturnRequest.seller,

        sender: req.user?._id || req.user?.id,

        type: "return",

        title:
          action === "approve"
            ? "Return request approved"
            : "Return request rejected",

        message:
          action === "approve"
            ? "Admin approved a return request for one of your orders."
            : `Admin rejected the return request. Reason: ${adminNote}`,

        orderId: savedReturnRequest.order,

        shopId: savedReturnRequest.shop,

        returnRequestId: savedReturnRequest._id,

        sellerOrderId: savedReturnRequest.sellerOrderId,

        actionUrl: `/seller/returns/${savedReturnRequest._id}`,

          metadata: {
            status: savedReturnRequest.status,

            reason: action === "reject" ? adminNote : "",
          },
        }),
      );
    }

    return res.status(200).json({
      message:
        action === "approve"
          ? "Return request approved"
          : "Return request rejected",

      returnRequest: savedReturnRequest,
    });
  } catch (error) {
    console.error("decideReturnRequest error:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to process return request",
    });
  } finally {
    await session.endSession();
  }
};

const syncOrderRefundStatus = (order) => {
  const activeSellerOrders = order.sellerOrders.filter(
    (sellerOrder) => sellerOrder.orderStatus !== "cancelled",
  );

  const refundedCount = activeSellerOrders.filter(
    (sellerOrder) => sellerOrder.returnStatus === "refunded",
  ).length;

  if (
    activeSellerOrders.length > 0 &&
    refundedCount === activeSellerOrders.length
  ) {
    order.refundStatus = "refunded";
    return;
  }

  order.refundStatus = refundedCount > 0 ? "partial" : "none";
};

/* =====================================================
   Seller: Customer is returning product
===================================================== */

export const markReturnReturning = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid return request ID",
      });
    }

    const returnRequest = await ReturnRequest.findOne({
      _id: req.params.id,
      seller: req.user._id,
      shop: req.shop._id,
      status: "approved",
    });

    if (!returnRequest) {
      return res.status(404).json({
        message: "Approved return request not found",
      });
    }

    const order = await Order.findOne({
      _id: returnRequest.order,
      "sellerOrders._id": returnRequest.sellerOrderId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Related order not found",
      });
    }

    const sellerOrder = order.sellerOrders.id(returnRequest.sellerOrderId);

    returnRequest.status = "returning";
    sellerOrder.returnStatus = "returning";

    await returnRequest.save();
    await order.save();

    return res.json({
      message: "Return marked as returning",
      returnRequest,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update return status",
    });
  }
};

/* =====================================================
   Admin: Returned products received and restore stock
===================================================== */

export const markReturnReceived = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid return request ID",
    });
  }

  const session = await mongoose.startSession();

  let savedReturnRequest = null;

  try {
    await session.withTransaction(
      async () => {
        /*
         * stockRestored:false থাকার কারণে
         * একই return দ্বিতীয়বার receive হবে না।
         */
        const returnRequest = await ReturnRequest.findOne({
          _id: req.params.id,

          status: {
            $in: ["approved", "returning"],
          },

          stockRestored: false,
        }).session(session);

        if (!returnRequest) {
          const existingReturn = await ReturnRequest.findById(
            req.params.id,
          ).session(session);

          const error = new Error(
            existingReturn
              ? "Returned product is already received or not ready"
              : "Return request not found",
          );

          error.statusCode = existingReturn ? 409 : 404;

          throw error;
        }

        const order = await Order.findOne({
          _id: returnRequest.order,

          "sellerOrders._id": returnRequest.sellerOrderId,
        }).session(session);

        if (!order) {
          const error = new Error("Related order not found");

          error.statusCode = 404;
          throw error;
        }

        const sellerOrder = order.sellerOrders.id(returnRequest.sellerOrderId);

        if (!sellerOrder) {
          const error = new Error("Seller sub-order not found");

          error.statusCode = 404;
          throw error;
        }

        /*
         * একই product একাধিক item-এ থাকলে
         * quantity একসঙ্গে যোগ করা।
         */
        const quantityMap = new Map();

        for (const item of returnRequest.items) {
          if (!item.product) continue;

          const productId = String(item.product);

          const quantity = Math.max(Number(item.quantity || 0), 0);

          if (quantity <= 0) continue;

          quantityMap.set(
            productId,
            (quantityMap.get(productId) || 0) + quantity,
          );
        }

        if (quantityMap.size > 0) {
          const stockResult = await Product.bulkWrite(
            [...quantityMap.entries()].map(([productId, quantity]) => ({
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
            })),
            {
              session,
            },
          );

          if (stockResult.matchedCount !== quantityMap.size) {
            const error = new Error(
              "One or more returned products were not found",
            );

            error.statusCode = 409;
            throw error;
          }
        }

        returnRequest.status = "received";

        returnRequest.receivedAt = new Date();

        returnRequest.stockRestored = true;

        returnRequest.adminNote = String(
          req.body.adminNote || returnRequest.adminNote || "",
        ).trim();

        sellerOrder.returnStatus = "received";

        await returnRequest.save({
          session,
        });

        await order.save({
          session,
        });

        savedReturnRequest = returnRequest;
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

    // Commit হওয়ার পর customer notification
    if (savedReturnRequest.user) {
      await sendNotificationSafely(
        notifyUser({
          recipient: savedReturnRequest.user,

          sender: req.user?._id || req.user?.id,

          type: "return",

          title: "Returned product received",

          message:
            "Your returned product has been received and is waiting for refund processing.",

          orderId: savedReturnRequest.order,

          shopId: savedReturnRequest.shop,

          returnRequestId: savedReturnRequest._id,

          sellerOrderId: savedReturnRequest.sellerOrderId,

          actionUrl: `/orders/${savedReturnRequest.order}`,

          metadata: {
            status: "received",
          },
        }),
      );
    }

    // Platform return-এ seller null থাকে।
    if (savedReturnRequest.seller) {
      await sendNotificationSafely(
        notifyUser({
          recipient: savedReturnRequest.seller,

        sender: req.user?._id || req.user?.id,

        type: "return",

        title: "Return received by admin",

        message: "The returned product was received and stock was restored.",

        orderId: savedReturnRequest.order,

        shopId: savedReturnRequest.shop,

        returnRequestId: savedReturnRequest._id,

        sellerOrderId: savedReturnRequest.sellerOrderId,

        actionUrl: `/seller/returns/${savedReturnRequest._id}`,

          metadata: {
            status: "received",
          },
        }),
      );
    }

    return res.status(200).json({
      message: "Returned products received and stock restored",

      returnRequest: savedReturnRequest,
    });
  } catch (error) {
    console.error("markReturnReceived error:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to receive returned products",
    });
  } finally {
    await session.endSession();
  }
};

/* =====================================================
   Admin: Finalize refund
===================================================== */

export const finalizeRefund = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      message: "Invalid return request ID",
    });
  }

  const session = await mongoose.startSession();

  let savedReturnRequest = null;
  let refundTransaction = null;
  let refundResult = null;
  let walletResult = null;
  let savedOrder = null;

  try {
    await session.withTransaction(
      async () => {
        const returnRequest =
          await ReturnRequest.findOne({
            _id: req.params.id,
            status: "received",
            stockRestored: true,
            financialAdjusted: false,
          }).session(session);

        if (!returnRequest) {
          const existingReturn =
            await ReturnRequest.findById(
              req.params.id,
            ).session(session);

          const error = new Error(
            existingReturn
              ? "Refund has already been processed or return is not ready"
              : "Return request not found",
          );

          error.statusCode =
            existingReturn ? 409 : 404;

          throw error;
        }

        const order = await Order.findOne({
          _id: returnRequest.order,
          "sellerOrders._id":
            returnRequest.sellerOrderId,
        }).session(session);

        if (!order) {
          const error = new Error(
            "Related order not found",
          );

          error.statusCode = 404;
          throw error;
        }

        const sellerOrder =
          order.sellerOrders.id(
            returnRequest.sellerOrderId,
          );

        if (!sellerOrder) {
          const error = new Error(
            "Seller sub-order not found",
          );

          error.statusCode = 404;
          throw error;
        }

        const isSellerReturn = Boolean(
          returnRequest.seller &&
            returnRequest.shop &&
            sellerOrder.seller &&
            sellerOrder.shop,
        );

        let shop = null;

        if (isSellerReturn) {
          shop = await Shop.findOne({
            _id: returnRequest.shop,
            owner: returnRequest.seller,
          }).session(session);

          if (!shop) {
            const error = new Error(
              "Related seller shop not found",
            );

            error.statusCode = 404;
            throw error;
          }
        }

        const sellerDeduction =
          isSellerReturn
            ? roundMoney(
                returnRequest.sellerDeduction,
              )
            : 0;

        const pendingBalance =
          isSellerReturn
            ? roundMoney(shop.pendingBalance)
            : 0;

        const availableBalance =
          isSellerReturn
            ? roundMoney(shop.availableBalance)
            : 0;

        const deductFromPending =
          isSellerReturn
            ? Math.min(
                pendingBalance,
                sellerDeduction,
              )
            : 0;

        const remainingAfterPending =
          sellerDeduction - deductFromPending;

        const deductFromAvailable =
          isSellerReturn
            ? Math.min(
                availableBalance,
                remainingAfterPending,
              )
            : 0;

        const sellerDebt =
          isSellerReturn
            ? roundMoney(
                remainingAfterPending -
                  deductFromAvailable,
              )
            : 0;

        let createdTransaction = null;

        if (isSellerReturn) {
          const [transaction] =
            await SellerTransaction.create(
              [
                {
                  seller:
                    returnRequest.seller,
                  shop:
                    returnRequest.shop,
                  order:
                    returnRequest.order,
                  sellerOrderId:
                    returnRequest.sellerOrderId,
                  returnRequest:
                    returnRequest._id,

                  type: "refund",
                  balanceEffect: "debit",
                  amount: sellerDeduction,

                  grossAmount: roundMoney(
                    returnRequest.totalRefundAmount,
                  ),

                  commissionAmount: roundMoney(
                    returnRequest.commissionReversal,
                  ),

                  status: "paid",

                  description:
                    `Refund adjustment for return #${returnRequest._id}`,

                  processedBy: req.user._id,
                  processedAt: new Date(),
                },
              ],
              { session },
            );

          createdTransaction = transaction;
        }

        if (isSellerReturn) {
          shop.pendingBalance =
            pendingBalance - deductFromPending;

          shop.availableBalance =
            availableBalance - deductFromAvailable;

          shop.sellerDebt = roundMoney(
            Number(shop.sellerDebt || 0) +
              sellerDebt,
          );

          shop.totalEarned = Math.max(
            0,
            roundMoney(shop.totalEarned) -
              sellerDeduction,
          );

          await shop.save({ session });
        }

        sellerOrder.returnStatus = "refunded";

        if (isSellerReturn) {
          sellerOrder.payoutStatus = "refunded";
        }

        returnRequest.status = "refunded";
        returnRequest.refundedAt = new Date();
        returnRequest.financialAdjusted = true;

        returnRequest.adminNote = String(
          req.body.adminNote ||
            returnRequest.adminNote ||
            "",
        ).trim();

        syncOrderRefundStatus(order);

        await returnRequest.save({ session });
        await order.save({ session });

        if (order.invoiceId) {
          await Invoice.findByIdAndUpdate(
            order.invoiceId,
            {
              $set: {
                status:
                  order.refundStatus ===
                  "refunded"
                    ? "refunded"
                    : "partially_refunded",

                notes:
                  returnRequest.adminNote ||
                  "Customer refund processed",
              },
            },
            {
              session,
              runValidators: true,
            },
          );
        }

        refundTransaction = createdTransaction;
        savedReturnRequest = returnRequest;
        savedOrder = order;

        refundResult = {
          customerRefund:
            returnRequest.totalRefundAmount,
          isSellerReturn,
          sellerDeduction,
          commissionReversal:
            isSellerReturn
              ? roundMoney(
                  returnRequest.commissionReversal,
                )
              : 0,
          deductedFromPending:
            deductFromPending,
          deductedFromAvailable:
            deductFromAvailable,
          addedToSellerDebt: sellerDebt,
        };

        walletResult = isSellerReturn
          ? {
              pendingBalance:
                shop.pendingBalance,
              availableBalance:
                shop.availableBalance,
              totalEarned:
                shop.totalEarned,
              sellerDebt: shop.sellerDebt,
            }
          : null;
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

    if (savedReturnRequest.user) {
      await sendNotificationSafely(
        notifyUser({
          recipient:
            savedReturnRequest.user,
          sender:
            req.user?._id || req.user?.id,
          type: "payment",
          title: "Refund completed",
          message:
            `Your refund of ৳${savedReturnRequest.totalRefundAmount} has been completed.`,
          orderId:
            savedReturnRequest.order,
          returnRequestId:
            savedReturnRequest._id,
          actionUrl:
            `/orders/${savedReturnRequest.order}`,
          priority: "high",
          metadata: {
            refundAmount:
              savedReturnRequest.totalRefundAmount,
            status: "refunded",
          },
        }),
      );
    }

    if (savedReturnRequest.seller) {
      await sendNotificationSafely(
        notifyUser({
          recipient:
            savedReturnRequest.seller,
          sender:
            req.user?._id || req.user?.id,
          type: "return",
          title: "Order refund completed",
          message:
            `৳${savedReturnRequest.totalRefundAmount} was refunded for a returned order.`,
          orderId:
            savedReturnRequest.order,
          shopId:
            savedReturnRequest.shop,
          returnRequestId:
            savedReturnRequest._id,
          sellerOrderId:
            savedReturnRequest.sellerOrderId,
          actionUrl:
            `/seller/returns/${savedReturnRequest._id}`,
          metadata: {
            refundAmount:
              savedReturnRequest.totalRefundAmount,
            sellerDeduction:
              refundResult.sellerDeduction,
            status: "refunded",
          },
        }),
      );
    }

    return res.status(200).json({
      message:
        "Refund finalized successfully",
      refund: refundResult,
      wallet: walletResult,
      parentRefundStatus:
        savedOrder.refundStatus,
      returnRequest:
        savedReturnRequest,
      refundTransaction,
    });
  } catch (error) {
    console.error(
      "finalizeRefund error:",
      error,
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "Refund has already been processed",
      });
    }

    return res
      .status(error.statusCode || 500)
      .json({
        message:
          error.message ||
          "Failed to finalize refund",
      });
  } finally {
    await session.endSession();
  }
};
export const getGuestReturns = async (req, res) => {
  try {
    const { orderId } = req.params;

    const guestId = String(
      req.query.guestId || "",
    ).trim();

    // requestGuestReturn controller-এর একই helper
    const guestAccessToken = getGuestToken(req);

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    if (!guestId || !guestAccessToken) {
      return res.status(401).json({
        message:
          "Guest ID and access token are required",
      });
    }

    // আগে order ownership/access যাচাই
    const order = await Order.findOne({
      _id: orderId,
      user: null,
      guestId,

      guestAccessTokenHash: hashGuestToken(
        guestAccessToken,
      ),
    })
      .select("_id guestId")
      .lean();

    if (!order) {
      return res.status(404).json({
        message:
          "Guest order not found or access denied",
      });
    }

    const items = await ReturnRequest.find({
      order: order._id,
      user: null,
      guestId,
      requestedBy: "guest",
    })
      .select(`
        order
        sellerOrderId
        shop
        items
        reason
        details
        evidence
        productRefundAmount
        shippingRefundAmount
        totalRefundAmount
        status
        adminNote
        decidedAt
        receivedAt
        refundedAt
        createdAt
        updatedAt
      `)
      .populate(
        "shop",
        "shopName slug logo",
      )
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      items,
      total: items.length,
    });
  } catch (error) {
    console.error(
      "getGuestReturns error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load guest return requests",
    });
  }
};