// controller/verification.controller.js
import SellerVerification from "../model/sellerVerification.model.js";
import { User } from "../model/index.model.js";

const toUrl = (file) => file?.path?.replace(/\\/g, "/"); // local; S3 হলে file.location

export const submitVerification = async (req, res) => {
  const userId = req.user._id;
  const { businessName, contactEmail, contactPhone, docsMeta } = req.body;
  // docsMeta = JSON.stringify([{kind:"nid_front", note:""}, ...])
  const meta = Array.isArray(docsMeta) ? docsMeta : JSON.parse(docsMeta || "[]");
  const files = req.files || [];

  if (!businessName || files.length === 0) {
    return res.status(400).json({ message: "Business name & at least one document required" });
  }

  const documents = meta.map((m, i) => ({
    kind: m.kind || "other",
    note: m.note || "",
    url: toUrl(files[i] || files[files.length - 1]), // map 1:1; fallback last
  }));

  const payload = {
    userId,
    businessName,
    contactEmail,
    contactPhone,
    documents,
    status: "pending",
    adminNote: "",
    decidedBy: undefined,
    decidedAt: undefined,
  };

  const doc = await SellerVerification.findOneAndUpdate(
    { userId },
    payload,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(userId, {
    verificationStatus: "pending",
    isSellerVerified: false,
  });

  res.status(201).json({ message: "Submitted for review", verification: doc });
};

export const getMyVerification = async (req, res) => {
  const doc = await SellerVerification.findOne({ userId: req.user._id });
  if (!doc) return res.json({ status: "none" });
  res.json(doc);
};

export const listPending = async (_req, res) => {
  const items = await SellerVerification.find({ status: "pending" })
    .sort({ createdAt: -1 })
    .select("-__v");
  res.json(items);
};

export const approve = async (req, res) => {
  const id = req.params.id;
  const doc = await SellerVerification.findByIdAndUpdate(
    id,
    { status: "approved", decidedBy: req.user._id, decidedAt: new Date() },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found" });

  await User.findByIdAndUpdate(doc.userId, {
    isSellerVerified: true,
    verificationStatus: "approved",
  });

  res.json({ message: "Approved", verification: doc });
};

export const reject = async (req, res) => {
  const id = req.params.id;
  const { reason = "" } = req.body;
  const doc = await SellerVerification.findByIdAndUpdate(
    id,
    { status: "rejected", adminNote: reason, decidedBy: req.user._id, decidedAt: new Date() },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found" });

  await User.findByIdAndUpdate(doc.userId, {
    isSellerVerified: false,
    verificationStatus: "rejected",
  });

  res.json({ message: "Rejected", verification: doc });
};
