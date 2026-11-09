// model/sellerVerification.model.js
import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ["nid_front", "nid_back", "trade_license", "vat_cert", "other"],
    required: true,
  },
  url: { type: String, required: true },   // file URL (S3/Cloudinary/Local)
  note: { type: String },
});

const sellerVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    businessName: { type: String, required: true },
    contactEmail: { type: String },
    contactPhone: { type: String },
    documents: { type: [docSchema], validate: v => v.length > 0 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    adminNote: { type: String },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

// handy computed flags (virtuals) — চাইলে UI তে ব্যবহার করো
sellerVerificationSchema.virtual("isSellerVerified").get(function () {
  return this.status === "approved";
});

export default mongoose.model("SellerVerification", sellerVerificationSchema);
