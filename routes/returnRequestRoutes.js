import express from "express";

import {
  protect,
  ensureSeller,
  ensureAdmin,

} from "../middleware/protect.js";

import {
  requestMyReturn,
  requestGuestReturn,
  getMyReturns,
  getGuestReturns,
  getSellerReturns,
  getAdminReturns,
  decideReturnRequest,
  markReturnReturning,
markReturnReceived,
finalizeRefund,
} from "../controller/returnRequest.controller.js";

const router = express.Router();

router.post(
  "/my/:orderId/:sellerOrderId",
  protect,
  requestMyReturn,
);

router.get(
  "/my",
  protect,
  getMyReturns,
);

router.post(
  "/guest/:orderId/:sellerOrderId",
  requestGuestReturn,
);
router.get(
  "/guest/:orderId",
  getGuestReturns,
);
router.get(
  "/seller",
  protect,
  ensureSeller,
  getSellerReturns,
);

router.get(
  "/admin",
  protect,
  ensureAdmin,
  getAdminReturns,
);

router.patch(
  "/admin/:id/decision",
  protect,
  ensureAdmin,
  decideReturnRequest,
);
router.patch(
  "/seller/:id/returning",
  protect,
  ensureSeller,
  markReturnReturning,
);

router.patch(
  "/admin/:id/received",
  protect,
  ensureAdmin,
  markReturnReceived,
);

router.patch(
  "/admin/:id/refund",
  protect,
  ensureAdmin,
  finalizeRefund,
);

export default router;