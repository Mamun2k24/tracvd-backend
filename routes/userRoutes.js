// routes/userRoutes.js
import express from "express";
import {
  getAllUsers,
  deleteUserById,
  getUserProfile,
  updateUserProfile,
  changePassword,
  updateUserRole,
  createAdmin,
  updateUserStatus,
} from "../controller/userController.js";

import { ensureAuth } from "../middleware/protect.js";
import { allowRoles } from "../middleware/roles.js";

const router = express.Router();

router.get(
  "/",
  ensureAuth,
  allowRoles("admin", "superadmin"),
  getAllUsers
);

router.post(
  "/create-admin",
  ensureAuth,
  allowRoles("superadmin"),
  createAdmin
);

router.get("/profile", ensureAuth, getUserProfile);

router.put("/profile", ensureAuth, updateUserProfile);

router.put("/change-password", ensureAuth, changePassword);

router.patch(
  "/:id/role",
  ensureAuth,
  allowRoles("superadmin"),
  updateUserRole
);

router.patch(
  "/:id/status",
  ensureAuth,
  allowRoles("admin", "superadmin"),
  updateUserStatus
);

router.delete(
  "/:id",
  ensureAuth,
  allowRoles("admin", "superadmin"),
  deleteUserById
);

export default router;