import express from "express";
import { applyCoupon } from "../controller/coupon.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// User: apply coupon to a cart (server-side validation)
router.post("/cart/apply-coupon", applyCoupon);

export default router;
