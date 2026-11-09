
import express from 'express';
import {
  addCategory,
  addSubCategory,
  getAllCategories,
  getAllSubCategories,
  getProductsByCategory,
  getProductsBySubCategory,
  deleteCategory,
  updateCategory,
} from '../controller/categoryController.js';

const router = express.Router();

// add
router.post('/', addCategory); // main category
router.post('/subcategory', addSubCategory); // subcategory

// list
router.get('/', getAllCategories); // only parent categories with nested subcategories
router.get('/subcategory/all', getAllSubCategories); // optional

// update/delete
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

// product routes
router.get('/:name/:subSlug', getProductsBySubCategory);
router.get('/:name', getProductsByCategory);

export default router;



