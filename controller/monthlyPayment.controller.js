import mongoose from "mongoose";
import MonthlyPayment from "../model/monthlyPayment.model.js";
import Settings from "../model/monthlyPaymentSettings.model.js";

const phoneRx = /^01[3-9]\d{8}$/;
const monthRx = /^\d{4}-(0[1-9]|1[0-2])$/;
const trimmed = (value) => String(value ?? "").trim();
const safeAmount = (value) => {
  if (value === "" || value === null || value === undefined) return NaN;
  const n = Number(value);
  return Number.isFinite(n) && Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : NaN;
};
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const publicSettings = asyncHandler(async (_req, res) => {
  const s = await Settings.findOne({ key: "default" }).lean();
  res.json({ enabled: Boolean(s?.enabled && s.bkashNumber), bkashNumber: s?.enabled ? s.bkashNumber : "", accountType: s?.accountType || "personal", instructions: s?.instructions || "" });
});

export const submitMonthlyPayment = asyncHandler(async (req, res) => {
  // Bot honeypot: do not create a payment.
  if (req.body?.website) return res.status(400).json({ message: "Invalid submission" });
  const customerName = trimmed(req.body.customerName);
  const customerPhone = trimmed(req.body.customerPhone);
  const vehicleNumber = trimmed(req.body.vehicleNumber);
  const orderReference = trimmed(req.body.orderReference);
  const billingMonth = trimmed(req.body.billingMonth);
  const senderNumber = trimmed(req.body.senderNumber);
  const transactionId = trimmed(req.body.transactionId).toUpperCase().replace(/\s+/g, "");
  const submittedAmount = safeAmount(req.body.submittedAmount);
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (!customerName || customerName.length > 100 || !vehicleNumber || vehicleNumber.length > 80 || orderReference.length > 100 || !phoneRx.test(customerPhone) || !phoneRx.test(senderNumber) || !monthRx.test(billingMonth) || billingMonth > currentMonth || !Number.isFinite(submittedAmount) || !/^[A-Z0-9-]{5,80}$/.test(transactionId)) {
    return res.status(400).json({ message: "ফর্মের তথ্য সঠিকভাবে পূরণ করুন (ভবিষ্যৎ মাস গ্রহণযোগ্য নয়)।" });
  }
  const s = await Settings.findOne({ key: "default" }).lean();
  if (!s?.enabled || !s.bkashNumber) return res.status(503).json({ message: "Monthly payment is currently unavailable" });
  try {
    const created = await MonthlyPayment.create({ customerName, customerPhone, vehicleNumber, orderReference, billingMonth, senderNumber, transactionId, submittedAmount });
    return res.status(201).json({ success: true, receiptId: created._id, status: "pending", message: "Request জমা হয়েছে। Admin যাচাইয়ের পর Confirm হবে।" });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "এই Transaction ID ইতোমধ্যে জমা দেওয়া হয়েছে।" });
    throw err;
  }
});

export const adminGetSettings = asyncHandler(async (_req, res) => {
  res.json((await Settings.findOne({ key: "default" }).lean()) || { enabled: false, bkashNumber: "", accountType: "personal", instructions: "" });
});

export const adminUpdateSettings = asyncHandler(async (req, res) => {
  const bkashNumber = trimmed(req.body.bkashNumber);
  const accountType = trimmed(req.body.accountType);
  const instructions = trimmed(req.body.instructions);
  const enabled = req.body.enabled === true;
  if (bkashNumber && !phoneRx.test(bkashNumber)) return res.status(400).json({ message: "সঠিক bKash নম্বর দিন।" });
  if (enabled && !bkashNumber) return res.status(400).json({ message: "Enable করার আগে bKash নম্বর দিন।" });
  if (!["personal", "merchant", "agent"].includes(accountType) || instructions.length > 500) return res.status(400).json({ message: "Settings invalid" });
  const saved = await Settings.findOneAndUpdate({ key: "default" }, { $set: { bkashNumber, accountType, instructions, enabled } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  res.json({ success: true, settings: saved });
});

export const adminListPayments = asyncHandler(async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 20;
  const filter = {};
  if (["pending", "approved", "rejected"].includes(req.query.status)) filter.status = req.query.status;
  if (monthRx.test(trimmed(req.query.month))) filter.billingMonth = req.query.month;
  if (trimmed(req.query.search)) {
    const search = trimmed(req.query.search).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["customerName", "customerPhone", "vehicleNumber", "transactionId", "orderReference"].map(key => ({ [key]: { $regex: search, $options: "i" } }));
  }
  const [items, total, counts] = await Promise.all([
    MonthlyPayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MonthlyPayment.countDocuments(filter),
    MonthlyPayment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit), counts: Object.fromEntries(counts.map(x => [x._id, x.count])) });
});

export const adminReviewPayment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid payment ID" });
  const status = trimmed(req.body.status);
  const adminNote = trimmed(req.body.adminNote);
  const verifiedAmount = safeAmount(req.body.verifiedAmount);
  if (!["approved", "rejected"].includes(status) || adminNote.length > 1000) return res.status(400).json({ message: "Invalid review status/note" });
  if (status === "approved" && (req.body.statementChecked !== true || !Number.isFinite(verifiedAmount))) return res.status(400).json({ message: "bKash statement এবং Amount যাচাই করে Confirm করুন।" });
  if (status === "rejected" && !adminNote) return res.status(400).json({ message: "Reject করার কারণ লিখুন।" });
  // Atomic transition: only pending requests can change; prevents two admins overwriting each other.
  const doc = await MonthlyPayment.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { $set: { status, adminNote, verifiedAmount: status === "approved" ? verifiedAmount : null, reviewedAt: new Date(), reviewedBy: req.user._id } }, { new: true, runValidators: true });
  if (!doc) return res.status(409).json({ message: "Pending request পাওয়া যায়নি, অথবা আগেই সিদ্ধান্ত দেওয়া হয়েছে।" });
  res.json({ success: true, item: doc });
});
