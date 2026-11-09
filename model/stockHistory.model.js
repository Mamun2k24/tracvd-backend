import mongoose from "mongoose";

const stockHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: ["add", "remove", "set"],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },

    newStock: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

stockHistorySchema.index({
  product: 1,
  createdAt: -1,
});

const StockHistory = mongoose.model(
  "StockHistory",
  stockHistorySchema
);

export default StockHistory;