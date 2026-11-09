import mongoose from "mongoose";

const returnItemSchema =
  new mongoose.Schema(
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },

      productName: {
        type: String,
        required: true,
        trim: true,
      },

      quantity: {
        type: Number,
        required: true,
        min: 1,
      },

      unitPrice: {
        type: Number,
        required: true,
        min: 0,
      },

      lineRefundAmount: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    { _id: false },
  );

const returnRequestSchema =
  new mongoose.Schema(
    {
      order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
      },

      sellerOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },

      seller: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
  index: true,
},

     shop: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Shop",
  default: null,
  index: true,
},

      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
      },

      guestId: {
        type: String,
        trim: true,
        default: null,
        index: true,
      },

      requestedBy: {
        type: String,
        enum: ["customer", "guest", "admin"],
        required: true,
      },

      items: {
        type: [returnItemSchema],
        required: true,
        validate: {
          validator: (items) =>
            Array.isArray(items) &&
            items.length > 0,
          message:
            "Return must contain at least one item",
        },
      },

      reason: {
        type: String,
        enum: [
          "damaged",
          "wrong_product",
          "defective",
          "size_issue",
          "not_as_described",
          "changed_mind",
          "other",
        ],
        required: true,
      },

      details: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
      },

      evidence: {
        type: [String],
        default: [],
      },

      productRefundAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      shippingRefundAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      totalRefundAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      sellerDeduction: {
        type: Number,
        default: 0,
        min: 0,
      },

      commissionReversal: {
        type: Number,
        default: 0,
        min: 0,
      },

      status: {
        type: String,
        enum: [
          "requested",
          "approved",
          "rejected",
          "returning",
          "received",
          "refunded",
          "cancelled",
        ],
        default: "requested",
        index: true,
      },

      adminNote: {
        type: String,
        trim: true,
        default: "",
      },

      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      decidedAt: {
        type: Date,
        default: null,
      },

      receivedAt: {
        type: Date,
        default: null,
      },

      refundedAt: {
        type: Date,
        default: null,
      },

      stockRestored: {
        type: Boolean,
        default: false,
      },

      financialAdjusted: {
        type: Boolean,
        default: false,
      },
    },
    { timestamps: true },
  );

// একটি seller sub-order-এর জন্য একটিই return request
returnRequestSchema.index(
  {
    order: 1,
    sellerOrderId: 1,
  },
  {
    unique: true,
  },
);

returnRequestSchema.index({
  seller: 1,
  status: 1,
  createdAt: -1,
});

const ReturnRequest =
  mongoose.models.ReturnRequest ||
  mongoose.model(
    "ReturnRequest",
    returnRequestSchema,
  );

export default ReturnRequest;