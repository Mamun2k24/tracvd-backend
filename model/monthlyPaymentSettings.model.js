import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema({
  key: { type: String, default: "default", unique: true, immutable: true },
  bkashNumber: { type: String, trim: true, default: "" },
  accountType: { type: String, enum: ["personal", "merchant", "agent"], default: "personal" },
  instructions: { type: String, maxlength: 500, default: "প্রদর্শিত bKash নম্বরে পেমেন্ট করে Transaction ID দিন। Admin যাচাইয়ের পর বিল Confirm হবে।" },
  enabled: { type: Boolean, default: false },
}, { timestamps: true });
export default mongoose.models.MonthlyPaymentSettings || mongoose.model("MonthlyPaymentSettings", schema);
