import { Router } from "express";
import { protect, ensureAdmin } from "../middleware/protect.js";
import {
  getPublicDemoSettings, submitDemoRequest, listDemoRequests,
  getDemoRequest, updateDemoRequest, getAdminDemoSettings, updateDemoSettings,
} from "../controller/demoRequest.controller.js";
const router = Router();

// Lightweight per-process throttling. In production with multiple instances use Redis-backed limiting.
const windows = new Map();
const demoLimit = (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (windows.size > 10000) for (const [k, v] of windows) if (v.expires < now) windows.delete(k);
  const state = windows.get(key);
  if (!state || state.expires < now) { windows.set(key, { count: 1, expires: now + 15 * 60 * 1000 }); return next(); }
  if (state.count >= 5) return res.status(429).json({ message: "অনেকবার চেষ্টা করা হয়েছে। পরে আবার চেষ্টা করুন।" });
  state.count += 1;
  next();
};

router.get("/settings", getPublicDemoSettings);
router.post("/requests", demoLimit, submitDemoRequest);
router.use("/admin", protect, ensureAdmin);
router.get("/admin/settings", getAdminDemoSettings);
router.patch("/admin/settings", updateDemoSettings);
router.get("/admin/requests", listDemoRequests);
router.get("/admin/requests/:id", getDemoRequest);
router.patch("/admin/requests/:id", updateDemoRequest);
export default router;
