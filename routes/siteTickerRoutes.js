// routes/siteTickerRoutes.js
import express from "express";
import {
  getSiteTicker,
  upsertSiteTicker,
} from "../controller/siteTicker.controller.js";

const router = express.Router();

// public (frontend consume)
router.get("/site/ticker", getSiteTicker);

// admin (you can add auth/admin middleware later)
router.put("/site/ticker", upsertSiteTicker);

export default router;
