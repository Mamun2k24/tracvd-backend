import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
      index: true,
    },

    sender: {
      type: String,
      enum: ["user", "admin", "bot"],
      required: true,
    },

    senderUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    messageType: {
      type: String,
      enum: ["text", "quick_reply", "order_status", "system", "image"],
      default: "text",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
    attachment: {
  url: { type: String, default: null },
  thumbUrl: { type: String, default: null },
  deleteUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null },
},
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;