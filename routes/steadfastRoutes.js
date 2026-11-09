import express from "express";
import {
  bookSteadfastParcel,
  trackSteadfastParcel,
  cancelSteadfastParcel,
} from "../controller/steadfastController.js";

const router = express.Router();

router.post("/orders/:orderId/steadfast/book", bookSteadfastParcel);
router.get("/orders/:orderId/steadfast/track", trackSteadfastParcel);
router.post("/orders/:orderId/steadfast/cancel", cancelSteadfastParcel);

export default router;