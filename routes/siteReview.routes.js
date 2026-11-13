import { Router } from "express";
import { protect, ensureAdmin } from "../middleware/protect.js";
import {
  getPublicSiteReviews, getAdminSiteReviews, createSiteReview,
  updateSiteReview, deleteSiteReview,
} from "../controller/siteReview.controller.js";

const router = Router();
router.get("/", getPublicSiteReviews);
router.get("/admin", protect, ensureAdmin, getAdminSiteReviews);
router.post("/admin", protect, ensureAdmin, createSiteReview);
router.patch("/admin/:id", protect, ensureAdmin, updateSiteReview);
router.delete("/admin/:id", protect, ensureAdmin, deleteSiteReview);
export default router;
