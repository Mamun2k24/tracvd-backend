import mongoose from "mongoose";

const siteReviewSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  comment: { type: String, required: true, trim: true, maxlength: 2000 },
  rating: { type: Number, required: true, min: 1, max: 5 },
  avatar: { type: String, trim: true, default: "" },
  reviewDate: { type: Date, required: true, default: Date.now },
  source: { type: String, enum: ["website", "google", "other"], default: "website" },
  sourceUrl: { type: String, trim: true, default: "" },
  verified: { type: Boolean, default: false },
  published: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

siteReviewSchema.index({ published: 1, sortOrder: 1, createdAt: -1 });
export default mongoose.models.SiteReview || mongoose.model("SiteReview", siteReviewSchema);
