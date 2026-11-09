import express from "express";

import {
  createLandingPage,
  getAllLandingPages,
  getLandingPageById,
  getLandingPageBySlug,
  updateLandingPage,
  deleteLandingPage,
  updateLandingStatus,
} from "../controller/landingPageController.js";


import {
  protect,
  ensureAdmin,
} from "../middleware/protect.js";


const router = express.Router();



// =====================================
// PUBLIC LANDING PAGE
// Customer view
// /lp/product-slug
// =====================================

router.get(
  "/public/:slug",
  getLandingPageBySlug
);




// =====================================
// ADMIN LANDING PAGE MANAGEMENT
// =====================================


// Create

router.post(
  "/",
  protect,
  ensureAdmin,
  createLandingPage
);



// Get all

router.get(
  "/",
  protect,
  ensureAdmin,
  getAllLandingPages
);




// Get single for edit

router.get(
  "/:id",
  protect,
  ensureAdmin,
  getLandingPageById
);




// Update

router.put(
  "/:id",
  protect,
  ensureAdmin,
  updateLandingPage
);




// Delete

router.delete(
  "/:id",
  protect,
  ensureAdmin,
  deleteLandingPage
);




// Publish / Draft

router.patch(
  "/:id/status",
  protect,
  ensureAdmin,
  updateLandingStatus
);



export default router;