import express from 'express';
import upload from '../middleware/upload.js';
import { addBanner, getBanners, deleteBanner } from '../controller/bannerController.js';

const router = express.Router();

router.post('/', upload.single('image'), addBanner); // ⬅️ Image field name

router.get('/', getBanners);
router.delete('/:id', deleteBanner);

export default router;
