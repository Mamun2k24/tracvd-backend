// models/siteTicker.model.js
import mongoose from "mongoose";

const tickerItemSchema = new mongoose.Schema(
  {
    // frontend থেকে crypto.randomUUID() দিয়ে আসতে পারে
    id: { type: String, required: true },

    text: { type: String, required: true, trim: true, maxlength: 80 },

    // future extension (optional)
    icon: { type: String, default: "" },

    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const siteTickerSchema = new mongoose.Schema(
  {
    // single doc রাখার জন্য key (unique)
    key: { type: String, default: "home_top_ticker", unique: true, index: true },

    enabled: { type: Boolean, default: true },
    direction: { type: String, enum: ["left", "right"], default: "left" },
    speed: { type: Number, default: 35, min: 10, max: 80 },
    pauseOnHover: { type: Boolean, default: true },

    items: { type: [tickerItemSchema], default: [] },
  },
  { timestamps: true }
);

const SiteTicker = mongoose.model("SiteTicker", siteTickerSchema);

export default SiteTicker;
