import express from "express";
import upload from "../middleware/upload.js";
import {
  addBrand,
  getBrands,
  updateBrand,
  deleteBrand,
} from "../controller/brandController.js";

const router = express.Router();

// ✅ logo upload সহ add
router.post("/", upload.single("logo"), addBrand);

// ✅ সব brand
router.get("/", getBrands);

// ✅ update এও logo optional upload
router.put("/:id", upload.single("logo"), updateBrand);

// ✅ delete
router.delete("/:id", deleteBrand);

export default router;
