// routes/couponAdmin.routes.js
import express from "express";
import {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminSetStatus,
} from "../controller/couponAdmin.controller.js";
import { protect, ensureAdmin } from "../middleware/protect.js";

const router = express.Router();

// Admin-only coupon CRUD
router.get("/admin/coupons", protect, ensureAdmin, adminListCoupons);
router.post("/admin/coupons", protect, ensureAdmin, adminCreateCoupon);
router.patch("/admin/coupons/:id", protect, ensureAdmin, adminUpdateCoupon);
router.patch("/admin/coupons/:id/status", protect, ensureAdmin, adminSetStatus);
router.delete("/admin/coupons/:id", protect, ensureAdmin, adminDeleteCoupon);

export default router;
