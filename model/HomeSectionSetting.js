import mongoose from "mongoose";

const { Schema } = mongoose;

const subtitleSchema = new Schema(
  {
    text: { type: String, trim: true, required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const homeSectionSettingSchema = new Schema(
  {
    // men | women | kids | accessories
    key: {
      type: String,
      required: true,
      unique: true,
      enum: ["men", "women", "kids", "accessories"],
      index: true,
    },

    sectionTitle: { type: String, trim: true, required: true },

    // minimum 3 active subtitle should be ensured in controller validation
    subtitles: { type: [subtitleSchema], default: [] },

    // optional: show/hide entire section
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const HomeSectionSetting =
  mongoose.models.HomeSectionSetting ||
  mongoose.model("HomeSectionSetting", homeSectionSettingSchema);

export default HomeSectionSetting;
