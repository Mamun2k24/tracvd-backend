import express from "express";

import {
  addProduct,
  getAllProducts,
  singleProducts,
  deleteProductById,
  searchQuery,
  typeaheadSuggestions,
  getRelatedProducts,
  updateProductById,
  getPublicProducts,
  listStockTable,
  getPublicProductsByHomeCategory,
  getFlashSaleProducts,
  updateProductStock,
  getProductStockHistory,
  getManageableProductById,
getPendingSellerProducts,
approveSellerProduct,
rejectSellerProduct,
 getAdminSellerProducts,
  updateSellerProductPublication,
  updateProductFlashSale,
} from "../controller/productController.js";

import {
    protect,
  ensureAdmin,
  ensureProductManager,
} from "../middleware/protect.js";

const router = express.Router();

/* =========================
   Public routes
========================= */

router.get(
  "/public/home/:slug",
  getPublicProductsByHomeCategory,
);

router.get(
  "/public/flash-sale",
  getFlashSaleProducts,
);

router.get("/public", getPublicProducts);
router.get("/search", searchQuery);
router.get("/suggest", typeaheadSuggestions);

router.get(
  "/related/:category",
  getRelatedProducts,
);

/* =========================
   Admin/Seller routes
========================= */

router.get(
  "/manage/list",
  protect,
  ensureProductManager,
  getAllProducts,
);

router.get(
  "/admin/stock-table",
  protect,
  ensureProductManager,
  listStockTable,
);
router.get(
  "/admin/seller-products",
  protect,
  ensureAdmin,
  getAdminSellerProducts,
);
router.patch(
  "/:id/flash-sale",
  protect,
  ensureAdmin,
  updateProductFlashSale,
);

router.put(
  "/:id",
  protect,
  ensureProductManager,
  updateProductById,
);

router.delete(
  "/:id",
  protect,
  ensureProductManager,
  deleteProductById,
);
router.patch(
  "/admin/:id/publication",
  protect,
  ensureAdmin,
  updateSellerProductPublication,
);
router.patch(
  "/:id/stock",
  protect,
  ensureProductManager,
  updateProductStock,
);

router.get(
  "/:id/stock-history",
  protect,
  ensureProductManager,
  getProductStockHistory,
);

router.post(
  "/",
  protect,
  ensureProductManager,
  addProduct,
);

router.put(
  "/:id",
  protect,
  ensureProductManager,
  updateProductById,
);

router.delete(
  "/:id",
  protect,
  ensureProductManager,
  deleteProductById,
);

/* Dynamic public route সবশেষে থাকবে */

/* =========================
   Admin product approval
========================= */

router.get(
  "/admin/pending",
  protect,
  ensureAdmin,
  getPendingSellerProducts,
);

router.patch(
  "/admin/:id/approve",
  protect,
  ensureAdmin,
  approveSellerProduct,
);

router.patch(
  "/admin/:id/reject",
  protect,
  ensureAdmin,
  rejectSellerProduct,
);

/* =========================
   Admin/Seller product detail
========================= */

router.get(
  "/manage/:id",
  protect,
  ensureProductManager,
  getManageableProductById,
);

router.get("/:id", singleProducts);

export default router;