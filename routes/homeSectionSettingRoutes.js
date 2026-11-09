import express from "express";
import {
  getAllHomeSectionSettings,
  getHomeSectionSettingByKey,
  upsertHomeSectionSettingByKey,
} from "../controller/homeSectionSettingController.js";

const router = express.Router();

// list (auto-seed if missing)
router.get("/", getAllHomeSectionSettings);

// single
router.get("/:key", getHomeSectionSettingByKey);

// update/create by key
router.put("/:key", upsertHomeSectionSettingByKey);

export default router;
