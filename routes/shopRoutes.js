import express from "express";

import {
  getMyShop,
  updateMyShop,
  getPublicShop,
  getPublicShopProducts,
  getAllShops,
  suspendShop,
  activateShop,
  updateShopCommission,
} from "../controller/shopController.js";
import {
  getSellerDashboard,
} from "../controller/sellerDashboard.controller.js";

import {
  protect,
  ensureSeller,
  ensureAdmin,
} from "../middleware/protect.js";

const router = express.Router();

/* Public */

router.get(
  "/shops/public/:slug/products",
  getPublicShopProducts,
);

router.get(
  "/shops/public/:slug",
  getPublicShop,
);

/* Seller */

router.get(
  "/shops/me",
  protect,
  ensureSeller,
  getMyShop,
);
router.get(
  "/shops/me/dashboard",
  protect,
  ensureSeller,
  getSellerDashboard,
);
router.patch(
  "/shops/me",
  protect,
  ensureSeller,
  updateMyShop,
);

/* Admin */

router.get(
  "/admin/shops",
  protect,
  ensureAdmin,
  getAllShops,
);

router.patch(
  "/admin/shops/:id/suspend",
  protect,
  ensureAdmin,
  suspendShop,
);

router.patch(
  "/admin/shops/:id/activate",
  protect,
  ensureAdmin,
  activateShop,
);

router.patch(
  "/admin/shops/:id/commission",
  protect,
  ensureAdmin,
  updateShopCommission,
);

export default router;