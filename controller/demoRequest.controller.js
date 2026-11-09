import mongoose from "mongoose";
import DemoRequest, {
  DEMO_STATUSES,
  VEHICLE_TYPES,
} from "../model/demoRequest.model.js";
import DemoSettings from "../model/demoSettings.model.js";

const phonePattern = /^01[3-9]\d{8}$/;
const clean = (value, max) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const isImageUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const fail = (res, error) => {
  console.error("Demo Request API:", error);
  return res.status(500).json({ message: "Internal Server Error" });
};

// Public endpoint: never returns customer details or other leads.
export const getPublicDemoSettings = async (_req, res) => {
  try {
    const saved = await DemoSettings.findOne({ key: "main" }).lean();
    const settings = saved || new DemoSettings().toObject();
    const {
      enabled,
      title,
      successMessage,
      trialImage,
      creativeImage,
      vehicleTypes,
    } = settings;
    return res.json({
      enabled,
      title,
      successMessage,
      trialImage,
      creativeImage,
      vehicleTypes,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const submitDemoRequest = async (req, res) => {
  try {
    // Honeypot: bots filling invisible field are rejected without storing personal info.
    if (req.body?.website)
      return res.status(400).json({ message: "Invalid request" });
    const name = clean(req.body?.name, 100);
    const phone = clean(req.body?.phone, 20).replace(/\s/g, "");
    const vehicle = clean(req.body?.vehicle, 80);
    if (name.length < 2 || !phonePattern.test(phone))
      return res
        .status(422)
        .json({ message: "সঠিক নাম ও ১১ সংখ্যার মোবাইল নম্বর দিন।" });
    const saved = await DemoSettings.findOne({ key: "main" }).lean();
    if (saved?.enabled === false)
      return res.status(403).json({ message: "ডেমো রিকোয়েস্ট এখন বন্ধ আছে।" });
    const validVehicles = saved?.vehicleTypes?.length
      ? saved.vehicleTypes
      : VEHICLE_TYPES;
    if (!validVehicles.includes(vehicle))
      return res.status(422).json({ message: "সঠিক গাড়ির ধরন নির্বাচন করুন।" });
    const doc = await DemoRequest.create({ name, phone, vehicle });
    return res
      .status(201)
      .json({
        success: true,
        id: doc._id,
        message:
          saved?.successMessage ||
          "আপনার ডেমো রিকোয়েস্ট গ্রহণ করা হয়েছে। আমরা যোগাযোগ করব।",
      });
  } catch (error) {
    return fail(res, error);
  }
};

export const listDemoRequests = async (req, res) => {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(req.query.limit) || 15)),
    );
    const status = clean(req.query.status, 30);
    const q = clean(req.query.q, 100);
    if (status && !DEMO_STATUSES.includes(status))
      return res.status(422).json({ message: "Invalid status filter" });
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped } },
        { vehicle: { $regex: escaped, $options: "i" } },
      ];
    }
    const [items, total, counts] = await Promise.all([
      DemoRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DemoRequest.countDocuments(filter),
      DemoRequest.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const summary = Object.fromEntries(DEMO_STATUSES.map((s) => [s, 0]));
    for (const item of counts) summary[item._id] = item.count;
    return res.json({
      items,
      total,
      page,
      limit,
      summary,
      grandTotal: Object.values(summary).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const getDemoRequest = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid ID" });
    const item = await DemoRequest.findById(req.params.id)
      .populate("assignedTo", "name email")
      .lean();
    return item
      ? res.json(item)
      : res.status(404).json({ message: "Not found" });
  } catch (error) {
    return fail(res, error);
  }
};

export const updateDemoRequest = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid ID" });
    const item = await DemoRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      if (!DEMO_STATUSES.includes(body.status))
        return res.status(422).json({ message: "Invalid status" });
      if (item.status !== body.status) {
        item.status = body.status;
        item.statusHistory.push({
          status: body.status,
          changedBy: req.user._id,
          changedAt: new Date(),
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      if (typeof body.notes !== "string" || body.notes.length > 3000)
        return res
          .status(422)
          .json({ message: "Notes must be under 3000 characters" });
      item.notes = body.notes.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, "demoAt")) {
      const date = body.demoAt ? new Date(body.demoAt) : null;
      if (date && Number.isNaN(date.getTime()))
        return res.status(422).json({ message: "Invalid demo date" });
      item.demoAt = date;
    }
    await item.save();
    return res.json({ message: "Demo request updated", item });
  } catch (error) {
    return fail(res, error);
  }
};

export const getAdminDemoSettings = async (_req, res) => {
  try {
    const settings = await DemoSettings.findOne({ key: "main" }).lean();
    return res.json(settings || new DemoSettings().toObject());
  } catch (error) {
    return fail(res, error);
  }
};
export const updateDemoSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean")
        return res.status(422).json({ message: "Invalid enabled flag" });
      updates.enabled = body.enabled;
    }
    for (const key of ["title", "successMessage"]) {
      if (key in body) {
        if (
          typeof body[key] !== "string" ||
          body[key].trim().length < 2 ||
          body[key].length > 250
        )
          return res.status(422).json({ message: `Invalid ${key}` });
        updates[key] = body[key].trim();
      }
    }
    for (const key of ["trialImage", "creativeImage"]) {
      if (key in body) {
        if (typeof body[key] !== "string" || !isImageUrl(body[key]))
          return res.status(422).json({ message: `Invalid ${key} URL` });
        updates[key] = body[key].trim();
      }
    }
    if ("vehicleTypes" in body) {
      if (
        !Array.isArray(body.vehicleTypes) ||
        !body.vehicleTypes.length ||
        body.vehicleTypes.length > 30 ||
        body.vehicleTypes.some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 80,
        )
      )
        return res.status(422).json({ message: "Invalid vehicle types" });
      updates.vehicleTypes = [
        ...new Set(body.vehicleTypes.map((v) => v.trim())),
      ];
    }
    const settings = await DemoSettings.findOneAndUpdate(
      { key: "main" },
      { $set: updates },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
    return res.json({ message: "Demo settings saved", settings });
  } catch (error) {
    return fail(res, error);
  }
};
