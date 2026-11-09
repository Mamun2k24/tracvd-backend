// routes/analyticsRoutes.js
import express from "express";
import { ensureAdmin, protect } from "../middleware/protect.js";
import { monthlySales } from "../controller/analytics.controller.js";

const r = express.Router();
r.get("/admin/analytics/monthly-sales", protect, ensureAdmin, monthlySales);
export default r;
