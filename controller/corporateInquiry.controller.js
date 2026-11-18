import mongoose from "mongoose";
import CorporateInquiry from "../model/corporateInquiry.model.js";

const clean = (value) => String(value ?? "").trim();

export async function createCorporateInquiry(req, res) {
  try {
    // Hidden bot field: silently discard automated submissions.
    if (clean(req.body.website)) return res.status(200).json({ success: true });
    const name = clean(req.body.name);
    const phone = clean(req.body.phone).replace(/[\s-]/g, "");
    const vehicle = Number(req.body.vehicle);
    if (
      !name ||
      name.length > 100 ||
      !/^01[3-9]\d{8}$/.test(phone) ||
      !Number.isSafeInteger(vehicle) ||
      vehicle < 1 ||
      vehicle > 100000
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "সঠিক নাম, ১১ সংখ্যার মোবাইল নম্বর ও গাড়ির সংখ্যা দিন।",
        });
    }

    // Avoid accidental repeated clicks/rapid duplicates; protect the public endpoint further with server rate limiting in production.
    const recent = await CorporateInquiry.findOne({
      phone,
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) },
    }).select("_id");
    if (recent)
      return res
        .status(429)
        .json({
          success: false,
          message:
            "এই নম্বর থেকে সম্প্রতি অনুরোধ পাঠানো হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
        });

    const inquiry = await CorporateInquiry.create({ name, phone, vehicle });
    return res
      .status(201)
      .json({
        success: true,
        message: "আপনার অনুরোধ জমা হয়েছে।",
        inquiryId: inquiry._id,
      });
  } catch (err) {
    console.error("Corporate inquiry create:", err);
    return res
      .status(500)
      .json({ success: false, message: "অনুরোধ জমা দেওয়া যায়নি।" });
  }
}

export async function listCorporateInquiries(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 15),
    );
    const status = clean(req.query.status);
    const search = clean(req.query.search).slice(0, 80);
    const filter = {};
    if (["new", "contacted", "closed"].includes(status)) filter.status = status;
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { phone: { $regex: safe, $options: "i" } },
      ];
    }
    const [items, total] = await Promise.all([
      CorporateInquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CorporateInquiry.countDocuments(filter),
    ]);
    return res.json({
      success: true,
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error("Corporate inquiry list:", err);
    return res
      .status(500)
      .json({ success: false, message: "অনুরোধের তালিকা লোড হয়নি।" });
  }
}

export async function updateCorporateInquiry(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid inquiry ID" });
    const status = clean(req.body.status);
    if (!["new", "contacted", "closed"].includes(status))
      return res.status(400).json({ message: "Invalid status" });
    const note = clean(req.body.note);
    if (note.length > 1000)
      return res.status(400).json({ message: "Note too long" });
    const item = await CorporateInquiry.findByIdAndUpdate(
      req.params.id,
      { status, note },
      { new: true, runValidators: true },
    );
    if (!item) return res.status(404).json({ message: "Inquiry not found" });
    return res.json({ success: true, item });
  } catch (err) {
    console.error("Corporate inquiry update:", err);
    return res.status(500).json({ message: "Status update failed" });
  }
}
