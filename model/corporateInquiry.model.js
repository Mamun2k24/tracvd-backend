import mongoose from "mongoose";

const corporateInquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^01[3-9]\d{8}$/,
    },
    vehicle: { type: Number, required: true, min: 1, max: 100000 },
    status: {
      type: String,
      enum: ["new", "contacted", "closed"],
      default: "new",
      index: true,
    },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true, collection: "corporate_inquiries" },
);

corporateInquirySchema.index({ createdAt: -1 });
export default mongoose.models.CorporateInquiry ||
  mongoose.model("CorporateInquiry", corporateInquirySchema);
