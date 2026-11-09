
import mongoose from "mongoose";
import { Order } from "../model/index.model.js";
import Invoice from "../model/invoice.model.js";
import SellerTransaction from "../model/sellerTransaction.model.js";

const fail = (status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
};

const hasText = (value) => String(value ?? "").trim().length > 0;

export const permanentlyDeleteOrder = async (req, res) => {
  // Defense in depth: protect this handler even if a route is wired incorrectly.
  // If your project uses a different admin role property, update this guard
  // and keep the route's own admin authorization middleware as well.
  const role = String(req.user?.role || "").toLowerCase();
  const isAdmin = ["admin", "superadmin", "super_admin"].includes(role) ||
    req.user?.isAdmin === true;
  if (!isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { orderId } = req.params;

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }
  if (
    req.body?.confirmation !== "DELETE" ||
    String(req.body?.orderId || "") !== orderId
  ) {
    return res.status(422).json({
      message: "Type DELETE and confirm the exact order ID before permanently deleting.",
    });
  }

  const session = await mongoose.startSession();
  try {
    let deletedInvoiceCount = 0;

    await session.withTransaction(async () => {
      // Read-only lean() avoids validating legacy Order documents with missing fields.
      const order = await Order.findById(orderId).session(session).lean();
      if (!order) fail(404, "Order not found or already deleted");

      // Stock is reduced on placement; cancellation must restore it FIRST.
      if (order.orderStatus !== "cancelled") {
        fail(409, "Cancel this order and restore stock before permanently deleting it.");
      }

      const sellerOrders = order.sellerOrders;
      if (!Array.isArray(sellerOrders) || sellerOrders.length === 0) {
        fail(409, "Legacy order has no seller records. Admin must reconcile stock before deletion.");
      }
      if (order.stockRestored !== true || sellerOrders.some((s) =>
        s.orderStatus !== "cancelled" || s.stockRestored !== true
      )) {
        fail(409, "Some seller items are active or stock restoration is unconfirmed.");
      }

      // Never remove a paid order or a customer payment that might need settlement/refund.
      if (order.paymentStatus !== "unpaid" || order.paidAt) {
        fail(409, "Payment/advance may need reconciliation; only unpaid orders can be deleted.");
      }
      const manual = order.manualPayment || {};
      if (
        ["pending", "verified"].includes(manual.status) ||
        hasText(manual.transactionId) ||
        Number(manual.amount || 0) > 0
      ) {
        fail(409, "Manual payment details exist. Reconcile the bKash/Nagad advance first.");
      }

      if (order.refundStatus && order.refundStatus !== "none") {
        fail(409, "Orders with refund activity cannot be permanently deleted.");
      }
      if (sellerOrders.some((s) =>
        s.earningProcessed === true ||
        ![undefined, null, "pending", "cancelled"].includes(s.payoutStatus) ||
        Boolean(s.returnRequest) ||
        (s.returnStatus && s.returnStatus !== "none") ||
        Boolean(s.deliveredAt) ||
        hasText(s.courierName) || hasText(s.trackingCode)
      )) {
        fail(409, "Seller earning, payout, return, delivery, or courier history prevents deletion.");
      }

      const courier = order.steadfast || {};
      if (
        (courier.status && courier.status !== "not_sent") ||
        courier.consignmentId || hasText(courier.trackingCode) || courier.sentAt
      ) {
        fail(409, "Steadfast entry or unresolved courier attempt exists. Do not delete this order.");
      }

      // Check for linked financial transactions that must remain auditable.
      const sellerTransaction = await SellerTransaction.findOne({ order: order._id })
        .session(session)
        .select("_id")
        .lean();
      if (sellerTransaction) {
        fail(409, "Seller financial transaction exists for this order.");
      }

      // Invoice is created when an order is placed. Delete it only if it is UNPAID.
      const invoices = await Invoice.find({ orderId: order._id })
        .session(session)
        .select("_id status")
        .lean();
      if (invoices.some((invoice) => invoice.status !== "unpaid")) {
        fail(409, "Paid/refunded or otherwise finalized invoice exists for this order.");
      }
      if (order.invoiceId && !invoices.some(
        (invoice) => String(invoice._id) === String(order.invoiceId)
      )) {
        const referencedInvoice = await Invoice.findById(order.invoiceId)
          .session(session)
          .select("_id")
          .lean();
        if (referencedInvoice) {
          fail(409, "Invoice references do not match. Reconcile invoice before deleting.");
        }
      }

      // Guard status/stock again in the write; transaction keeps invoice+order atomic.
      const deleted = await Order.deleteOne({
        _id: order._id,
        orderStatus: "cancelled",
        stockRestored: true,
      }).session(session);

      if (deleted.deletedCount !== 1) {
        fail(409, "Order changed during deletion. Refresh and try again.");
      }

      if (invoices.length) {
        const invoiceResult = await Invoice.deleteMany({
          orderId: order._id,
          status: "unpaid",
        }).session(session);
        deletedInvoiceCount = invoiceResult.deletedCount || 0;
        if (deletedInvoiceCount !== invoices.length) {
          fail(409, "Invoice changed during deletion. Order deletion was rolled back.");
        }
      }
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    console.info("Admin permanently deleted cancelled unpaid order", {
      orderId,
      adminId: String(req.user?._id || req.user?.id || "unknown"),
      deletedInvoiceCount,
    });
    return res.status(200).json({
      message: "Order permanently deleted from MongoDB",
      deletedOrderId: orderId,
      deletedInvoiceCount,
    });
  } catch (error) {
    console.error("permanentlyDeleteOrder failed:", {
      orderId,
      message: error?.message,
      code: error?.code || null,
    });
    return res.status(error?.statusCode || 500).json({
      message: error?.statusCode
        ? error.message
        : "Deletion failed. The order was not confirmed as safely deletable.",
    });
  } finally {
    await session.endSession();
  }
};