import mongoose from "mongoose";

const chatBotQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },

    answer: {
      type: String,
      required: true,
      trim: true,
    },

    key: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },

    icon: {
      type: String,
      default: "MessageCircle",
    },

    showAsQuickReply: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const ChatBotQuestion = mongoose.model(
  "ChatBotQuestion",
  chatBotQuestionSchema
);

export default ChatBotQuestion;