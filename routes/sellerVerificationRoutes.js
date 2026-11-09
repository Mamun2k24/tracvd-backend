import express from "express";
import {
  ensureAuth,
  ensureAdmin,
} from "../middleware/protect.js";
import { upload } from "../middleware/uploadVerification.js";
import * as ctrl from "../controller/sellerVerification.controller.js";

const router = express.Router();

router.post(
  "/seller/verification",
  ensureAuth,
  upload.array("files", 6),
  ctrl.submitVerification,
);

router.get(
  "/seller/verification/me",
  ensureAuth,
  ctrl.getMyVerification,
);

router.get(
  "/seller/verification/pending",
  ensureAuth,
  ensureAdmin,
  ctrl.listPending,
);

router.get(
  "/seller/verification/rejected",
  ensureAuth,
  ensureAdmin,
  ctrl.listRejected,
);
router.get(
  "/seller/verification/approved",
  ensureAuth,
  ensureAdmin,
  ctrl.listApproved,
);

router.patch(
  "/seller/verification/:id/approve",
  ensureAuth,
  ensureAdmin,
  ctrl.approve,
);

router.patch(
  "/seller/verification/:id/reject",
  ensureAuth,
  ensureAdmin,
  ctrl.reject,
);

export default router;