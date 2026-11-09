import mongoose from "mongoose";

export const DEMO_STATUSES = [
  "pending",
  "contacted",
  "scheduled",
  "completed",
  "converted",
  "no_response",
  "cancelled",
];
export const VEHICLE_TYPES = [
  "প্রাইভেট কার",
  "মোটরসাইকেল",
  "মাইক্রোবাস",
  "বাস",
  "ট্রাক",
  "পিকআপ",
  "অন্যান্য",
];

const demoRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^01[3-9]\d{8}$/ },
    vehicle: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: DEMO_STATUSES,
      default: "pending",
      index: true,
    },
    demoAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 3000, default: "" },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusHistory: [
      {
        status: { type: String, enum: DEMO_STATUSES },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    source: { type: String, default: "website" },
  },
  { timestamps: true },
);

demoRequestSchema.index({ createdAt: -1 });
export default mongoose.models.DemoRequest ||
  mongoose.model("DemoRequest", demoRequestSchema);
