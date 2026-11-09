import mongoose from "mongoose";

const sellerTransactionSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },

    sellerOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "earning",
        "earning_release",
        "withdrawal",
        "refund",
        "adjustment",
      ],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceEffect: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
      index: true,
    },

    returnRequest: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "ReturnRequest",
  default: null,
  index: true,
},

    commissionAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    grossAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "available",
        "requested",
        "approved",
        "paid",
        "rejected",
        "cancelled",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// একই seller sub-order-এর earning দ্বিতীয়বার তৈরি হতে দেবে না
sellerTransactionSchema.index(
  {
    seller: 1,
    order: 1,
    sellerOrderId: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "earning",
    },
  },
);

sellerTransactionSchema.index(
  {
    returnRequest: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: "refund",
    },
  },
);

const SellerTransaction =
  mongoose.models.SellerTransaction ||
  mongoose.model(
    "SellerTransaction",
    sellerTransactionSchema,
  );

export default SellerTransaction;