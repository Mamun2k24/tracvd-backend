import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, "Invalid email address"],
      default: undefined,
    },

    mobile: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: undefined,
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    profileImage: {
      type: String,
      default: "default-profile.png",
    },

    bio: {
      type: String,
      trim: true,
    },

    role: {
      type: String,
      enum: ["user", "seller", "admin", "superadmin"],
      default: "user",
    },

    sellerStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected", "suspended"],
      default: "none",
    },

    sellerRejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    verificationOtp: {
      type: String,
      select: false,
    },

    otpExpiresAt: {
      type: Date,
      select: false,
    },

    password: {
      type: String,
      select: false,
    },

    resetOtp: {
      type: String,
      select: false,
    },

    resetOtpExpiresAt: {
      type: Date,
      select: false,
    },

    resetOtpVerified: {
      type: Boolean,
      default: false,
    },

    wholesaleApproved: {
      type: Boolean,
      default: false,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: undefined,
    },

    dateOfBirth: {
      type: Date,
      default: undefined,
    },

    address: {
      type: String,
      trim: true,
      default: undefined,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

userSchema.index({ sellerStatus: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;