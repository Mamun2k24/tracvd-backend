// model/HeaderSetting.model.js
import mongoose from "mongoose";

const socialItemSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    isActive: { type: Boolean, default: false },
  },
  { _id: false }
);

const headerSettingSchema = new mongoose.Schema(
  {
    topBarText: { type: String, default: "BEST SPECIAL OFFERS! 40% OFF!" },
    // ✅ new (multiple)
    topBarTexts: { type: [String], default: [] },
    showTopBar: { type: Boolean, default: true },

    // ✅ Popular social networks (url + isActive)
    socialLinks: {
      facebook: socialItemSchema,
      instagram: socialItemSchema,
      whatsapp: socialItemSchema,
      threads: socialItemSchema,
      youtube: socialItemSchema,
      twitter: socialItemSchema,   // X/Twitter
      linkedin: socialItemSchema,
      tiktok: socialItemSchema,
      pinterest: socialItemSchema,
      telegram: socialItemSchema,
      snapchat: socialItemSchema,
      reddit: socialItemSchema,
      github: socialItemSchema,
    },
  },
  { timestamps: true }
);

const HeaderSetting = mongoose.model("HeaderSetting", headerSettingSchema);
export default HeaderSetting;
