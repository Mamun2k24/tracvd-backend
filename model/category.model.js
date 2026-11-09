// models/category.model.js
import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    // ✅ NEW: slug (URL / routing এর জন্য)
    slug: {
      type: String,
      trim: true,
      unique: true,
      index: true,
    },

    image: {
      type: String,
      required: true,
    },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
  },
  {
    collection: "categoriesname",
    timestamps: true,
  }
);

const Category = mongoose.model("Category", categorySchema);
export default Category;
