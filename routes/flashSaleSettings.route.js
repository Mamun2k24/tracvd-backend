import express from "express";

import {
  getFlashSaleSettings,
  updateFlashSaleSettings,
} from "../controller/flashSaleSettingsController.js";

const router = express.Router();

router.get("/", getFlashSaleSettings);
router.put("/", updateFlashSaleSettings);

export default router;