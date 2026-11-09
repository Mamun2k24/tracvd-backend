// controllers/couponAdmin.controller.js
import Coupon from "../model/coupon.model.js";

const normalizeCode = (s="") => String(s).trim().toUpperCase();

export const adminListCoupons = async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await Coupon.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
};

export const adminCreateCoupon = async (req, res) => {
  try {
    let {
      code, type, amount,
      minSpend = 0,
      appliesTo = { kind: "all", productIds: [], categoryNames: [] },
      excludeSaleItems = false,
      maxDiscount,
      startAt,
      endAt,
      usageLimit,
      perCustomerLimit,
      status = "active",
      combinable = false,
    } = req.body || {};

    if (!code || !type || amount == null) {
      return res.status(400).json({ message: "code, type, amount required" });
    }

    const doc = await Coupon.create({
      code: normalizeCode(code),
      type,                          // "percent" | "fixed"
      amount: Number(amount),
      minSpend: Number(minSpend) || 0,
      appliesTo: appliesTo?.kind ? appliesTo : { kind: "all" },
      excludeSaleItems: !!excludeSaleItems,
      maxDiscount: maxDiscount != null ? Number(maxDiscount) : undefined,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      usageLimit: usageLimit != null ? Number(usageLimit) : undefined,
      perCustomerLimit: perCustomerLimit != null ? Number(perCustomerLimit) : undefined,
      status,                        // "active" | "paused" | "expired"
      combinable: !!combinable,
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error("adminCreateCoupon:", e);
    if (e.code === 11000) {
      return res.status(409).json({ message: "Coupon code already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

export const adminUpdateCoupon = async (req, res) => {
  try {
    const id = req.params.id;
    const patch = { ...req.body };

    if (patch.code) patch.code = normalizeCode(patch.code);
    if (patch.amount != null) patch.amount = Number(patch.amount);
    if (patch.minSpend != null) patch.minSpend = Number(patch.minSpend);
    if (patch.maxDiscount != null) patch.maxDiscount = Number(patch.maxDiscount);
    if (patch.usageLimit != null) patch.usageLimit = Number(patch.usageLimit);
    if (patch.perCustomerLimit != null) patch.perCustomerLimit = Number(patch.perCustomerLimit);

    const doc = await Coupon.findByIdAndUpdate(id, patch, { new: true });
    if (!doc) return res.status(404).json({ message: "Coupon not found" });
    res.json(doc);
  } catch (e) {
    console.error("adminUpdateCoupon:", e);
    res.status(500).json({ message: "Server error" });
  }
};

export const adminDeleteCoupon = async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Coupon.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Coupon not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("adminDeleteCoupon:", e);
    res.status(500).json({ message: "Server error" });
  }
};

export const adminSetStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; // "active" | "paused" | "expired"
    const doc = await Coupon.findByIdAndUpdate(id, { status }, { new: true });
    if (!doc) return res.status(404).json({ message: "Coupon not found" });
    res.json(doc);
  } catch (e) {
    console.error("adminSetStatus:", e);
    res.status(500).json({ message: "Server error" });
  }
};
