import express from "express";
import { getSellerDashboard } from "../controller/sellerDashboard.controller.js";
import {
  protect,
  ensureSeller,
  ensureAdmin,
} from "../middleware/protect.js";

import {
  getMyWallet,
  updatePaymentMethod,
  getMyTransactions,
  requestWithdrawal,
  getMyWithdrawals,
  cancelMyWithdrawal,
  releaseSellerEarning,
  getAllPayoutRequests,
  approvePayout,
  rejectPayout,
  markPayoutPaid,
  getAdminSellerTransactions,
} from "../controller/sellerWallet.controller.js";

const router = express.Router();

/* =========================
   Seller wallet routes
========================= */

router.get(
  "/seller/wallet",
  protect,
  ensureSeller,
  getMyWallet,
);

router.put(
  "/seller/wallet/payment-method",
  protect,
  ensureSeller,
  updatePaymentMethod,
);

router.get(
  "/seller/wallet/transactions",
  protect,
  ensureSeller,
  getMyTransactions,
);

router.post(
  "/seller/withdrawals",
  protect,
  ensureSeller,
  requestWithdrawal,
);

router.get(
  "/seller/withdrawals",
  protect,
  ensureSeller,
  getMyWithdrawals,
);

router.get(
  "/seller/dashboard",
  protect,
  ensureSeller,
  getSellerDashboard,
);

router.patch(
  "/seller/withdrawals/:id/cancel",
  protect,
  ensureSeller,
  cancelMyWithdrawal,
);

/* =========================
   Admin wallet routes
========================= */

router.patch(
  "/admin/seller-earnings/:id/release",
  protect,
  ensureAdmin,
  releaseSellerEarning,
);
router.get(
  "/admin/seller-transactions",
  protect,
  ensureAdmin,
  getAdminSellerTransactions,
);
router.get(
  "/admin/payouts",
  protect,
  ensureAdmin,
  getAllPayoutRequests,
);

router.patch(
  "/admin/payouts/:id/approve",
  protect,
  ensureAdmin,
  approvePayout,
);

router.patch(
  "/admin/payouts/:id/reject",
  protect,
  ensureAdmin,
  rejectPayout,
);

router.patch(
  "/admin/payouts/:id/paid",
  protect,
  ensureAdmin,
  markPayoutPaid,
);

export default router;