import mongoose from "mongoose";

const payoutPaymentMethodSchema =
  new mongoose.Schema(
    {
      method: {
        type: String,
        enum: [
          "bank",
          "bkash",
          "nagad",
          "rocket",
        ],
        required: true,
      },

      accountName: {
        type: String,
        required: true,
        trim: true,
      },

      accountNumber: {
        type: String,
        required: true,
        trim: true,
      },

      bankName: {
        type: String,
        trim: true,
        default: "",
      },

      branchName: {
        type: String,
        trim: true,
        default: "",
      },

      routingNumber: {
        type: String,
        trim: true,
        default: "",
      },
    },
    { _id: false },
  );

const payoutRequestSchema =
  new mongoose.Schema(
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

      amount: {
        type: Number,
        required: true,
        min: 100,
      },

      paymentMethod: {
        type: payoutPaymentMethodSchema,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "pending",
          "approved",
          "rejected",
          "paid",
          "cancelled",
        ],
        default: "pending",
        index: true,
      },

      sellerNote: {
        type: String,
        trim: true,
        default: "",
      },

      adminNote: {
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

      paidAt: {
        type: Date,
        default: null,
      },

      transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SellerTransaction",
        default: null,
      },
    },
    { timestamps: true },
  );

payoutRequestSchema.index({
  seller: 1,
  createdAt: -1,
});

payoutRequestSchema.index({
  shop: 1,
  status: 1,
  createdAt: -1,
});

const PayoutRequest =
  mongoose.models.PayoutRequest ||
  mongoose.model(
    "PayoutRequest",
    payoutRequestSchema,
  );

export default PayoutRequest;