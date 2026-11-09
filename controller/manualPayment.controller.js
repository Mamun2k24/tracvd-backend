import mongoose from "mongoose";
import { Order } from "../model/index.model.js";
import Invoice from "../model/invoice.model.js";
import { notifyUser } from "../services/notification.service.js";

const safeNotify = async (payload) => {
  try {
    await notifyUser(payload);
  } catch (error) {
    console.error("Manual payment notification failed:", error);
  }
};

export const getPendingManualPayments = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100,
    );

    const filter = {
      paymentStatus: "pending_verification",
      "manualPayment.status": "pending",
    };

    const [items, total] = await Promise.all([
      Order.find(filter)
        .select(
          "customer totalPrice paymentMethod paymentStatus manualPayment createdAt",
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getPendingManualPayments error:", error);
    return res.status(500).json({
      message: "Failed to load pending payments",
    });
  }
};

export const decideManualPayment = async (req, res) => {
  const { orderId } = req.params;
  const decision = String(req.body?.decision || "")
    .trim()
    .toLowerCase();
  const adminNote = String(req.body?.adminNote || "")
    .trim()
    .slice(0, 500);

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  if (!["verified", "rejected"].includes(decision)) {
    return res.status(422).json({
      message: "Decision must be verified or rejected",
    });
  }

  const session = await mongoose.startSession();
  let savedOrder = null;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        paymentMethod: { $in: ["bKash", "Nagad"] },
        paymentStatus: "pending_verification",
        "manualPayment.status": "pending",
      }).session(session);

      if (!order) {
        const existing = await Order.findById(orderId).session(session);
        const error = new Error(
          existing
            ? "Payment has already been reviewed or is not awaiting verification"
            : "Order not found",
        );
        error.statusCode = existing ? 409 : 404;
        throw error;
      }

      order.manualPayment.status = decision;
      order.manualPayment.verifiedAt = new Date();
      order.manualPayment.verifiedBy = req.user._id;
      order.manualPayment.adminNote = adminNote;

      if (decision === "verified") {
        order.paymentStatus = "paid";
        order.paidAt = new Date();

        for (const sellerOrder of order.sellerOrders) {
          if (sellerOrder.orderStatus !== "cancelled") {
            sellerOrder.paymentStatus = "paid";
          }
        }
      } else {
        order.paymentStatus = "rejected";
        order.paidAt = null;
      }

      await order.save({ session });

      if (order.invoiceId) {
        await Invoice.findByIdAndUpdate(
          order.invoiceId,
          {
            $set: {
              status: decision === "verified" ? "paid" : "unpaid",
              paidAt: decision === "verified" ? order.paidAt : null,
              notes:
                adminNote ||
                (decision === "verified"
                  ? "Manual payment verified"
                  : "Manual payment rejected"),
            },
          },
          { session, runValidators: true },
        );
      }

      savedOrder = order;
    });

    if (savedOrder.user) {
      await safeNotify({
        recipient: savedOrder.user,
        sender: req.user?._id || req.user?.id,
        type: "payment",
        title:
          decision === "verified"
            ? "Payment verified"
            : "Payment verification failed",
        message:
          decision === "verified"
            ? `Your ${savedOrder.paymentMethod} payment for order #${savedOrder._id} was verified.`
            : `Your ${savedOrder.paymentMethod} payment for order #${savedOrder._id} was rejected.`,
        orderId: savedOrder._id,
        actionUrl: `/orders/${savedOrder._id}`,
        priority: "high",
        metadata: {
          paymentStatus: savedOrder.paymentStatus,
          paymentMethod: savedOrder.paymentMethod,
        },
      });
    }

    return res.status(200).json({
      message:
        decision === "verified"
          ? "Payment verified successfully"
          : "Payment rejected",
      order: savedOrder,
    });
  } catch (error) {
    console.error("decideManualPayment error:", error);
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to review payment",
    });
  } finally {
    await session.endSession();
  }
};