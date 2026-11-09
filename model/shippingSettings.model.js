import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: false },
    startAt: { type: Date },
    endAt: { type: Date },
    freeThreshold: { type: Number, default: 0 },
  },
  { _id: false }
);

const shippingSettingsSchema = new mongoose.Schema(
  {
    // single doc guard
    key: { type: String, default: "default", unique: true },

    // ✅ defaults
    insideDhakaRate: { type: Number, default: 60 },
    outsideDhakaRate: { type: Number, default: 120 },

    // global free delivery
    freeThreshold: { type: Number, default: 0 },

    // districts that are always free
    freeForDistricts: { type: [String], default: [] },

    campaign: { type: campaignSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("ShippingSettings", shippingSettingsSchema);
