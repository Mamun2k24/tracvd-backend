import express from "express";
import upload from "../middleware/upload.js"; 
import { protect } from "../middleware/protect.js";
import { isAdmin } from "../middleware/isAdmin.js";
import {
  getGeneralSettings,
  updateGeneralSettings,
  upsertLogo,
  deleteLogo,
} from "../controller/generalSettingsController.js";

const router = express.Router();

// Public route
router.get("/settings/general", getGeneralSettings);

// Admin Only routes
router.put("/admin/settings/general", protect, isAdmin, updateGeneralSettings);
router.post("/admin/settings/general/logo", protect, isAdmin, upload.single("logo"), upsertLogo);
router.delete("/admin/settings/general/logo", protect, isAdmin, deleteLogo);

export default router;