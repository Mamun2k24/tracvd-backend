import mongoose from "mongoose";

const chatConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    guestId: {
      type: String,
      index: true,
      default: null,
    },

    customerName: {
      type: String,
      default: "Guest User",
      trim: true,
    },

    customerEmail: {
      type: String,
      default: null,
      trim: true,
    },

    customerMobile: {
      type: String,
      default: null,
      trim: true,
    },

    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["open", "pending", "closed"],
      default: "open",
    },

    mode: {
      type: String,
      enum: ["bot", "live"],
      default: "bot",
    },

    lastMessage: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    unreadForAdmin: {
      type: Number,
      default: 0,
    },

    unreadForUser: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const ChatConversation = mongoose.model(
  "ChatConversation",
  chatConversationSchema
);

export default ChatConversation;