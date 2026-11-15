import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, unique: true, index: true },
  excerpt: { type: String, trim: true, maxlength: 400, default: "" },
  content: { type: String, required: true, maxlength: 100000 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  coverImage: { type: String, default: "" },
  imageAlt: { type: String, default: "", maxlength: 180 },
  author: { type: String, default: "Trackvio Team", maxlength: 100 },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  publishedAt: { type: Date, default: null },
  views: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
blogSchema.index({ status: 1, category: 1, publishedAt: -1 });
blogSchema.index({ title: "text", excerpt: "text", content: "text" });
export default mongoose.models.Blog || mongoose.model("Blog", blogSchema);
