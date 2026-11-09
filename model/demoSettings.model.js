import mongoose from "mongoose";
import { VEHICLE_TYPES } from "./demoRequest.model.js";
const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  enabled: { type: Boolean, default: true },
  title: { type: String, maxlength: 250, default: "ফর্মটি পূরণ করে, Trackvd GPS ট্র্যাকারের ডেমো দেখুন!" },
  successMessage: { type: String, maxlength: 250, default: "আপনার ডেমো রিকোয়েস্ট গ্রহণ করা হয়েছে। আমরা যোগাযোগ করব।" },
  trialImage: { type: String, default: "https://prohori.com/wp-content/uploads/2026/05/free-trial.gif" },
  creativeImage: { type: String, default: "https://prohori.com/wp-content/uploads/2026/07/Demo-page-creative.webp" },
  vehicleTypes: { type: [String], default: () => [...VEHICLE_TYPES] },
}, { timestamps: true });
export default mongoose.models.DemoSettings || mongoose.model("DemoSettings", schema);
