// model/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    youtubeUrl: { type: String, required: true, trim: true }, // full youtube link
    thumbnailUrl: { type: String, trim: true },                // optional
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

videoSchema.index({ title: "text", description: "text" });

export default mongoose.model("Video", videoSchema);
