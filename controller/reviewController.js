import Review from "../model/review.model.js";
import { Order, Product } from "../model/index.model.js";
import mongoose from "mongoose";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const recalcProductRating = async (productId) => {
  if (!isValidObjectId(productId)) return;

  const pid = toObjectId(productId);

  const stats = await Review.aggregate([
    {
      $match: {
        product: pid,
        isHidden: false,
      },
    },
    {
      $group: {
        _id: "$product",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const ratingAvg = stats.length ? Number(stats[0].avg.toFixed(2)) : 0;
  const ratingCount = stats.length ? stats[0].count : 0;

  await Product.findByIdAndUpdate(productId, { ratingAvg, ratingCount });
};

// =========================
// USER: CREATE REVIEW
// =========================
export const createReview = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { productId, rating, title, comment, orderId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!productId || !rating) {
      return res.status(400).json({ message: "productId and rating are required" });
    }

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    if (!isValidObjectId(userId)) {
      return res.status(401).json({ message: "Unauthorized (invalid user)" });
    }

    if (orderId && !isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid orderId" });
    }

    const pid = toObjectId(productId);
    const uid = toObjectId(userId);

    // product exists?
    const product = await Product.findById(pid).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ Verify purchase: delivered order এ এই product আছে কিনা
    const orderQuery = {
      user: uid,
      orderStatus: "delivered",
      "products.product": pid,
    };

    if (orderId) orderQuery._id = toObjectId(orderId);

    const deliveredOrder = await Order.findOne(orderQuery).lean();

    if (!deliveredOrder) {
      return res.status(403).json({
        message: "You can review only after purchasing & delivery of this product.",
      });
    }

    // ✅ multer uploaded images -> urls
    const uploadedImages = Array.isArray(req.files)
      ? req.files.map((f) => `/uploads/${f.filename}`)
      : [];

    const review = await Review.create({
      product: pid,
      user: uid,
      order: deliveredOrder._id,
      rating: Number(rating),
      title: title || "",
      comment: comment || "",
      images: uploadedImages,
      isVerifiedPurchase: true,
    });

    await recalcProductRating(productId);

    return res.status(201).json({ message: "Review submitted", review });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "You already reviewed this product." });
    }
    return res.status(500).json({ message: "Error creating review", error: err.message });
  }
};

// =========================
// PUBLIC: GET PRODUCT REVIEWS
// =========================
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    const reviews = await Review.find({ product: productId, isHidden: false })
      .populate({ path: "user", select: "name profileImage" })
      .sort({ createdAt: -1 });

    const summary = await Product.findById(productId)
      .select("ratingAvg ratingCount")
      .lean();

    return res.status(200).json({
      summary: summary || { ratingAvg: 0, ratingCount: 0 },
      reviews,
    });
  } catch (err) {
    return res.status(500).json({ message: "Error fetching reviews", error: err.message });
  }
};

// =========================
// USER: UPDATE MY REVIEW
// (JSON images OR multer uploaded images)
// =========================
export const updateMyReview = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { reviewId } = req.params;
    const { rating, title, comment, images } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" });
    }

    const review = await Review.findOne({ _id: reviewId, user: userId });
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (rating !== undefined) review.rating = Number(rating);
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;

    // ✅ If multer files uploaded, use them. Otherwise use body.images (array).
    const uploadedImages = Array.isArray(req.files)
      ? req.files.map((f) => `/uploads/${f.filename}`)
      : null;

    if (uploadedImages) {
      review.images = uploadedImages;
    } else if (images !== undefined) {
      review.images = Array.isArray(images) ? images : [];
    }

    await review.save();
    await recalcProductRating(review.product);

    return res.status(200).json({ message: "Review updated", review });
  } catch (err) {
    return res.status(500).json({ message: "Error updating review", error: err.message });
  }
};

// =========================
// USER: DELETE MY REVIEW
// =========================
export const deleteMyReview = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { reviewId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" });
    }

    const review = await Review.findOneAndDelete({ _id: reviewId, user: userId });
    if (!review) return res.status(404).json({ message: "Review not found" });

    await recalcProductRating(review.product);

    return res.status(200).json({ message: "Review deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Error deleting review", error: err.message });
  }
};

// =========================
// ADMIN: HIDE / UNHIDE REVIEW
// =========================
export const adminHideReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { isHidden } = req.body;

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" });
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isHidden: !!isHidden },
      { new: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found" });

    await recalcProductRating(review.product);

    return res.status(200).json({ message: "Review visibility updated", review });
  } catch (err) {
    return res.status(500).json({ message: "Error updating review", error: err.message });
  }
};

// =========================
// ADMIN: REPLY REVIEW
// =========================
export const adminReplyReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { text } = req.body;

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" });
    }

    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    review.reply = {
      text: text || "",
      repliedAt: new Date(),
      repliedBy: req.user?._id,
    };

    await review.save();

    return res.status(200).json({ message: "Reply added", review });
  } catch (err) {
    return res.status(500).json({ message: "Error replying to review", error: err.message });
  }
};

// =========================
// ADMIN: GET ALL REVIEWS (for admin panel)
// =========================
export const adminGetAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find({})
      .populate({ path: "user", select: "name profileImage" })
      .populate({ path: "product", select: "name title" })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ reviews });
  } catch (err) {
    return res.status(500).json({ message: "Error fetching reviews", error: err.message });
  }
};

// =========================
// ADMIN: DELETE REVIEW (for admin panel delete button)
// =========================
export const adminDeleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" });
    }

    const review = await Review.findByIdAndDelete(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    await recalcProductRating(review.product);

    return res.status(200).json({ message: "Review deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Error deleting review", error: err.message });
  }
};
