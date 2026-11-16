
import express from "express";

import bannerUpload from "../middleware/bannerUpload.js";

import { protect } from "../middleware/protect.js";
import { isAdmin as ensureAdmin } from "../middleware/isAdmin.js";

import {
  addBanner,
  getBanners,
  deleteBanner,
} from "../controller/bannerController.js";

const router = express.Router();

// Public: Get banners
router.get("/", getBanners);

// Admin: Add banner
router.post(
  "/",
  protect,
  ensureAdmin,
  bannerUpload.single("image"),
  addBanner
);

// Admin: Delete banner
router.delete(
  "/:id",
  protect,
  ensureAdmin,
  deleteBanner
);

export default router;
