import express from "express";
import { protect } from "../middleware/protect.js";
import { isAdmin } from "../middleware/isAdmin.js";
import { getTodayOrders, getAdminOverview, getSalesReport } from "../controller/reportController.js";

const router = express.Router();
router.get("/reports/admin-overview", protect, isAdmin, getAdminOverview);
router.get("/reports/today-orders", protect, isAdmin, getTodayOrders);
router.get("/reports/sales", protect, isAdmin, getSalesReport);
export default router;
