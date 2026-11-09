// routes/adminStatsRoutes.js
import express from "express";
import { getAdminStats } from "../controller/adminStats.controller.js";
import { protect, ensureAdmin } from "../middleware/protect.js";

const router = express.Router();

// GET /api/admin/stats
router.get("/admin/stats", protect, ensureAdmin, getAdminStats);

export default router;
