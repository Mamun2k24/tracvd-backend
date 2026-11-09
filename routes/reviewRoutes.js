import express from "express";
import { protect } from "../middleware/protect.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  createReview,
  getProductReviews,
  updateMyReview,
  deleteMyReview,
  adminHideReview,
  adminReplyReview,
  adminGetAllReviews,
  adminDeleteReview
} from "../controller/reviewController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// public
router.get("/reviews/product/:productId", getProductReviews);

// user
router.post("/reviews", protect, upload.array("images", 6), createReview);

router.put("/reviews/:reviewId", protect, updateMyReview);
router.delete("/reviews/:reviewId", protect, deleteMyReview);

// admin/vendor
router.put("/admin/reviews/:reviewId/hide", protect, isAdmin, adminHideReview);
router.put("/admin/reviews/:reviewId/reply", protect, isAdmin, adminReplyReview);
// admin list
router.get("/admin/reviews", protect, isAdmin, adminGetAllReviews);

// admin delete
router.delete("/admin/reviews/:reviewId", protect, isAdmin, adminDeleteReview);

export default router;
