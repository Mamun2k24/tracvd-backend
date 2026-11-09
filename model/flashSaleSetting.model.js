import mongoose from "mongoose";

const FlashSaleSettingsSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "Flash Sale",
  },

  startDate: Date,

  endDate: Date,

  status: {
    type: String,
    default: "active",
  },
});

export default mongoose.model(
  "FlashSaleSettings",
  FlashSaleSettingsSchema
);