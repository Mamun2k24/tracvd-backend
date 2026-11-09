// model/invoice.model.js
import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    qty: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    // Logged-in customer হলে থাকবে
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Guest customer হলে থাকবে
    guestId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Invoice must contain at least one item",
      },
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

   status: {
  type: String,
  enum: [
    "unpaid",
    "paid",
    "cancelled",
    "partially_refunded",
    "refunded",
  ],
  default: "unpaid",
},

    issuedAt: {
      type: Date,
      default: Date.now,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

// একই order-এর একাধিক invoice তৈরি হওয়া প্রতিরোধ
invoiceSchema.index({ orderId: 1 }, { unique: true });

const Invoice =
  mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

export default Invoice;