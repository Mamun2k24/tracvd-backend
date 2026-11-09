// routes/headerSettingRoutes.js
import { Router } from "express";
import {
  getPublicHeader, updateHeader
} from "../controller/headerSettingController.js";

const router = Router();


router.get("/", getPublicHeader);

// (iccha korle /public alias rakha jay, old code jodi thake)
// router.get("/public", getPublicHeader);

// admin header-section page theke update
router.put("/", updateHeader);

export default router;
