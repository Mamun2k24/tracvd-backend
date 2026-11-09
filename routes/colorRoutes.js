// colorRoutes.js

import express from 'express';
import { addColor, getColors, updateColor, deleteColor } from '../controller/colorController.js'; 
import { protect } from '../middleware/protect.js';
import { isAdmin } from '../middleware/isAdmin.js';

const router = express.Router();

// Route to add a new color
router.post('/',  addColor); // Assuming the base route is '/colors'

// Route to get all colors
router.get('/',  getColors); // Assuming the base route is '/colors'

router.put("/:id", updateColor);   // ✅ edit
router.delete("/:id", deleteColor);
export default router;
