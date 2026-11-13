import mongoose from "mongoose";
import SiteReview from "../model/siteReview.model.js";

const clean = (value) => String(value ?? "").trim();
const allowedSources = new Set(["website", "google", "other"]);

function safeUrl(value) {
  const url = clean(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function parseReview(body, partial = false) {
  const errors = {};
  const update = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (!partial || has("name")) {
    const v = clean(body.name);
    if (v.length < 2 || v.length > 100)
      errors.name = "Name must contain 2–100 characters";
    else update.name = v;
  }
  if (!partial || has("comment")) {
    const v = clean(body.comment);
    if (!v || v.length > 2000)
      errors.comment = "Comment must contain 1–2000 characters";
    else update.comment = v;
  }
  if (!partial || has("rating")) {
    const v = Number(body.rating);
    if (!Number.isInteger(v) || v < 1 || v > 5)
      errors.rating = "Rating must be an integer from 1 to 5";
    else update.rating = v;
  }
  if (!partial || has("source")) {
    const v = clean(body.source) || "website";
    if (!allowedSources.has(v)) errors.source = "Invalid source";
    else update.source = v;
  }
  if (!partial || has("avatar")) {
    const url = safeUrl(body.avatar);
    if (url === null) errors.avatar = "Avatar must be a valid HTTP(S) URL";
    else update.avatar = url;
  }
  if (!partial || has("sourceUrl")) {
    const url = safeUrl(body.sourceUrl);
    if (url === null)
      errors.sourceUrl = "Source URL must be a valid HTTP(S) URL";
    else update.sourceUrl = url;
  }
  if (!partial || has("reviewDate")) {
    const d = body.reviewDate ? new Date(body.reviewDate) : new Date();
    if (Number.isNaN(d.getTime())) errors.reviewDate = "Invalid review date";
    else update.reviewDate = d;
  }
  for (const key of ["published", "verified"]) {
    if (has(key)) {
      if (typeof body[key] !== "boolean")
        errors[key] = `${key} must be boolean`;
      else update[key] = body[key];
    }
  }
  if (has("sortOrder")) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n) || n < -100000 || n > 100000)
      errors.sortOrder = "Invalid sort order";
    else update.sortOrder = n;
  }
  return { update, errors };
}

export const getPublicSiteReviews = async (_req, res) => {
  try {
    const items = await SiteReview.find({ published: true })
      .select("name comment rating avatar reviewDate source sourceUrl verified")
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ items, count: items.length });
  } catch (error) {
    console.error("getPublicSiteReviews:", error);
    return res.status(500).json({ message: "Unable to load reviews" });
  }
};

export const getAdminSiteReviews = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const search = clean(req.query.search).slice(0, 100);
    const filter = search
      ? {
          name: {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        }
      : {};
    const [items, total] = await Promise.all([
      SiteReview.find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SiteReview.countDocuments(filter),
    ]);
    return res.json({ items, total, page, limit });
  } catch (error) {
    console.error("getAdminSiteReviews:", error);
    return res.status(500).json({ message: "Unable to load reviews" });
  }
};

export const createSiteReview = async (req, res) => {
  try {
    const { update, errors } = parseReview(req.body || {});
    if (Object.keys(errors).length)
      return res.status(422).json({ message: "Invalid review", errors });
    const item = await SiteReview.create(update);
    return res.status(201).json({ message: "Review created", item });
  } catch (error) {
    console.error("createSiteReview:", error);
    return res.status(500).json({ message: "Unable to create review" });
  }
};

export const updateSiteReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid review ID" });
    const { update, errors } = parseReview(req.body || {}, true);
    if (Object.keys(errors).length)
      return res.status(422).json({ message: "Invalid review", errors });
    if (!Object.keys(update).length)
      return res.status(400).json({ message: "No changes provided" });
    const item = await SiteReview.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!item) return res.status(404).json({ message: "Review not found" });
    return res.json({ message: "Review updated", item });
  } catch (error) {
    console.error("updateSiteReview:", error);
    return res.status(500).json({ message: "Unable to update review" });
  }
};

export const deleteSiteReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid review ID" });
    const item = await SiteReview.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Review not found" });
    return res.json({ message: "Review deleted" });
  } catch (error) {
    console.error("deleteSiteReview:", error);
    return res.status(500).json({ message: "Unable to delete review" });
  }
};
