import express from "express";
import Video from "../model/video.model.js";

const router = express.Router();

// guards (আপনার existing middleware থাকলে সেটা use করবেন)
const requireAuth = (req, res, next) =>
  req.isAuthenticated?.() ? next() : res.status(401).json({ message: "Unauthorized" });

const requireAdmin = (req, res, next) =>
  req.user && (req.user.role === "admin" || req.user.role === "superadmin")
    ? next()
    : res.status(403).json({ message: "Forbidden" });

// ✅ Public: only active videos
router.get("/", async (_req, res) => {
  const items = await Video.find({ isActive: true }).sort({ createdAt: -1 });
  res.json({ items });
});

// ✅ Admin: all videos
router.get("/admin", async (_req, res) => {
  const items = await Video.find({}).sort({ createdAt: -1 });
  res.json({ items });
});

// ✅ Admin: create
router.post("/admin", async (req, res) => {
  const { title, description, youtubeUrl } = req.body || {};
  if (!title || !youtubeUrl) return res.status(400).json({ message: "Title and YouTube URL are required" });

  const created = await Video.create({ title, description, youtubeUrl, isActive: true });
  res.json(created);
});

// ✅ Admin: update (toggle, edit)
router.patch("/admin/:id", async (req, res) => {
  const updated = await Video.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!updated) return res.status(404).json({ message: "Not found" });
  res.json(updated);
});

// ✅ Admin: delete
router.delete("/admin/:id", async (req, res) => {
  const deleted = await Video.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

export default router;
