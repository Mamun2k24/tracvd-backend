import express from "express";
import { sendOtp, verifyOtp, userLogout, adminLogin,  userPasswordLogin, requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,  } from "../controller/authController.js"; 

import dotenv from "dotenv";
import passport from "passport";

dotenv.config();
const router = express.Router();
// Google login route
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
// 🔹 Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dashboard"); // Redirect user to dashboard after successful login
  }
);

// ✅ OTP Routes
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/logout", userLogout);
router.post("/forgot-password/send-otp", requestPasswordReset);
router.post("/forgot-password/verify-otp", verifyPasswordResetOtp);
router.post("/forgot-password/reset", resetPassword);
// 🔹 User password login
router.post("/login", userPasswordLogin);

// 🔹 Admin routes
// router.post("/admin/register", adminRegister);
router.post("/admin/login", adminLogin);

export default router;

