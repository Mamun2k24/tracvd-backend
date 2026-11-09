import express from "express";

import {
  protect,
  ensureAdmin,
} from "../middleware/protect.js";

import {
  getMarketplaceDashboard,
  getSellerPerformance,
} from "../controller/adminMarketplace.controller.js";

const router = express.Router();

router.get(
  "/dashboard",
  protect,
  ensureAdmin,
  getMarketplaceDashboard,
);

router.get(
  "/sellers",
  protect,
  ensureAdmin,
  getSellerPerformance,
);

export default router;