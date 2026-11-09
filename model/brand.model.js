// model/brand.model.js
import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String, // image URL
      required: true,
    },
    website: {
      type: String, // optional brand website url
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;
