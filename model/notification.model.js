import mongoose from "mongoose";

const notificationSchema =
  new mongoose.Schema(
    {
      recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      type: {
        type: String,
        enum: [
          "seller",
          "product",
          "order",
          "payment",
          "delivery",
          "payout",
          "return",
          "system",
        ],
        default: "system",
        index: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      message: {
        type: String,
        required: true,
        trim: true,
      },

      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null,
      },

      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        default: null,
      },

      shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Shop",
        default: null,
      },

      payoutId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PayoutRequest",
        default: null,
      },

      returnRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ReturnRequest",
        default: null,
      },

      sellerOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },

      actionUrl: {
        type: String,
        trim: true,
        default: "",
      },

      priority: {
        type: String,
        enum: ["low", "normal", "high"],
        default: "normal",
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      isRead: {
        type: Boolean,
        default: false,
        index: true,
      },

      readAt: {
        type: Date,
        default: null,
      },
    },
    { timestamps: true },
  );

notificationSchema.index({
  recipient: 1,
  isRead: 1,
  createdAt: -1,
});

const Notification =
  mongoose.models.Notification ||
  mongoose.model(
    "Notification",
    notificationSchema,
  );

export default Notification;