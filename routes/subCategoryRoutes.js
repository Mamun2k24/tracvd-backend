import express from "express";
import upload from "../middleware/upload.js";
import {
  addSubCategory,
  getAllSubCategories,
  deleteSubCategory,
  updateSubCategory
} from "../controller/subCategoryController.js";

const router = express.Router();

// ✅ image optional → no change in upload middleware
router.post("/", upload.single("image"), addSubCategory);
router.get("/", getAllSubCategories);
router.put("/:id", upload.single("image"), updateSubCategory);
router.delete("/:id", deleteSubCategory);

export default router;
