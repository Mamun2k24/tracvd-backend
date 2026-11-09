// controller/invoice.controller.js
import mongoose from "mongoose";
import Invoice from "../model/invoice.model.js";
import { Order, User } from "../model/index.model.js";

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// --- Create from Order (unchanged) ---
export const createInvoice = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId || !isObjectId(orderId)) {
      return res.status(400).json({ message: "Valid orderId is required (24-char ObjectId)." });
    }

    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const dup = await Invoice.findOne({ orderId: order._id }).lean();
    if (dup) return res.status(409).json({ message: "Invoice already exists for this order" });

    const items = (order.products || []).map((it) => {
      const qty = it?.quantity ?? 1;
      const price = it?.price ?? 0;
      return {
        productId: it?.product,
        name: it?.productName || it?.name || "",
        qty,
        price,
        subtotal: qty * price,
      };
    });

    const itemsTotal = items.reduce((sum, x) => sum + (x.subtotal || 0), 0);
    const totalAmount = itemsTotal + (order.shippingCost || 0);

    const inv = await Invoice.create({
      orderId: order._id,
      userId: order.user || req.user?.id,
      items,
      totalAmount,
      status: "unpaid",
      issuedAt: new Date(),
    });

    return res.status(201).json(inv);
  } catch (err) {
    console.error("createInvoice error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// --- List (admin) ---
// export const listInvoices = async (_req, res) => {
//   try {
//     const rows = await Invoice.find({})
//       .sort({ issuedAt: -1 })
//       .populate("userId", "name mobile");
//     return res.json(rows);
//   } catch (err) {
//     console.error("listInvoices error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };


export const listInvoices = async (_req, res) => {
  try {
    const rows = await Invoice.find({})
      .sort({ issuedAt: -1 })
      .populate({
        path: "orderId",
        select: "customer address district paymentMethod",
      })
      .populate({
        path: "userId",
        select: "name mobile",
      });

    return res.status(200).json(rows);
  } catch (err) {
    console.error("listInvoices error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// --- List mine (user) ---
// export const listMyInvoices = async (req, res) => {
//   try {
//     const userId = req.user?.id || req.user?._id;
//     const rows = await Invoice.find({ userId }).sort({ issuedAt: -1 });
//     return res.json(rows);
//   } catch (err) {
//     console.error("listMyInvoices error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };

export const listMyInvoices = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const rows = await Invoice.find({ userId })
      .sort({ issuedAt: -1 })
      .populate({
        path: "orderId",
        select: "customer address district paymentMethod",
      });

    return res.status(200).json(rows);
  } catch (err) {
    console.error("listMyInvoices error:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// --- ✅ Mark Paid (admin) — also sync Order ---
export const markPaid = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid invoice id" });

    const inv = await Invoice.findByIdAndUpdate(
      id,
      { $set: { status: "paid", paidAt: new Date() } },
      { new: true }
    );
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv.orderId) {
      await Order.updateOne(
        { _id: inv.orderId },
        {
          $set: {
            paymentStatus: "paid",       // Order model: unpaid|paid|partial|refunded
            paidAt: new Date(),
            invoiceId: inv._id,
          },
        }
      );
    }

    return res.json(inv);
  } catch (err) {
    console.error("markPaid error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// --- (Optional) Mark Unpaid / rollback ---
export const markUnpaid = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: "Invalid invoice id" });

    const inv = await Invoice.findByIdAndUpdate(
      id,
      { $set: { status: "unpaid" }, $unset: { paidAt: 1 } },
      { new: true }
    );
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv.orderId) {
      await Order.updateOne(
        { _id: inv.orderId },
        { $set: { paymentStatus: "unpaid" }, $unset: { paidAt: 1 } }
      );
    }

    return res.json(inv);
  } catch (err) {
    console.error("markUnpaid error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
