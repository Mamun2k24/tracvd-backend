import mongoose from "mongoose";
const { Schema } = mongoose;

const GeneralSettingsSchema = new Schema(
  {
    logoUrl: { type: String, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    openTime: { type: String, trim: true, default: "" },

    // 🌟 নতুন সোশ্যাল মিডিয়া ফিল্ডস
    facebookUrl: { type: String, trim: true, default: "" },
    instagramUrl: { type: String, trim: true, default: "" },
    whatsappUrl: { type: String, trim: true, default: "" },
    youtubeUrl: { type: String, trim: true, default: "" },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "general_settings" }
);

const GeneralSettings = mongoose.model("GeneralSettings", GeneralSettingsSchema);
export default GeneralSettings;