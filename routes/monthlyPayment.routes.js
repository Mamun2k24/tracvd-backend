import { Router } from "express";
import { protect, ensureAdmin } from "../middleware/protect.js";
import {
  publicSettings, submitMonthlyPayment, adminGetSettings,
  adminUpdateSettings, adminListPayments, adminReviewPayment,
} from "../controller/monthlyPayment.controller.js";

const router = Router();
router.get("/settings", publicSettings);
router.post("/requests", submitMonthlyPayment);
router.use("/admin", protect, ensureAdmin);
router.get("/admin/settings", adminGetSettings);
router.patch("/admin/settings", adminUpdateSettings);
router.get("/admin/requests", adminListPayments);
router.patch("/admin/requests/:id/review", adminReviewPayment);
export default router;
