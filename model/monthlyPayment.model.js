import mongoose from "mongoose";
const { Schema } = mongoose;

const monthlyPaymentSchema = new Schema({
  customerName: { type: String, required: true, trim: true, maxlength: 100 },
  customerPhone: { type: String, required: true, trim: true, index: true },
  vehicleNumber: { type: String, required: true, trim: true, maxlength: 80 },
  orderReference: { type: String, trim: true, maxlength: 100, default: "" },
  billingMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  submittedAmount: { type: Number, required: true, min: 1, max: 1000000 },
  senderNumber: { type: String, required: true, trim: true },
  transactionId: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 80 },
  paymentMethod: { type: String, enum: ["bkash"], default: "bkash" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  adminNote: { type: String, trim: true, maxlength: 1000, default: "" },
  verifiedAmount: { type: Number, min: 0, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

monthlyPaymentSchema.index({ createdAt: -1 });
monthlyPaymentSchema.index({ billingMonth: 1, status: 1 });
export default mongoose.models.MonthlyPayment || mongoose.model("MonthlyPayment", monthlyPaymentSchema);
