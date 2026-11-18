import { Router } from "express";
import { protect, ensureAdmin } from "../middleware/protect.js";
import {
  createCorporateInquiry,
  listCorporateInquiries,
  updateCorporateInquiry,
} from "../controller/corporateInquiry.controller.js";

const router = Router();
router.post("/", createCorporateInquiry); // Public form
router.get("/", protect, ensureAdmin, listCorporateInquiries); // Admin only
router.patch("/:id", protect, ensureAdmin, updateCorporateInquiry); // Admin only
export default router;
