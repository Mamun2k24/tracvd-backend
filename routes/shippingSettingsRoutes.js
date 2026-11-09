import express from "express";
import {
  getPublicShippingSettings,
  upsertShippingSettings,
} from "../controller/shippingSettings.controller.js";
import { protect } from "../middleware/protect.js";
import { isAdmin } from "../middleware/isAdmin.js";

const router = express.Router();

// ✅ Buynow/Checkout এর জন্য GET public থাকবে, কিন্তু "/public" থাকবে না
router.get("/", getPublicShippingSettings);

// ✅ শুধুমাত্র update admin
router.put("/", protect, isAdmin, upsertShippingSettings);

export default router;
