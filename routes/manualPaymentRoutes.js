import express from "express";
import {
  getPendingManualPayments,
  decideManualPayment,
} from "../controller/manualPayment.controller.js";
import {
  protect,
  ensureAdmin,
} from "../middleware/protect.js";

const router = express.Router();

router.get(
  "/admin/manual-payments/pending",
  protect,
  ensureAdmin,
  getPendingManualPayments,
);

router.patch(
  "/admin/manual-payments/:orderId/decision",
  protect,
  ensureAdmin,
  decideManualPayment,
);

export default router;