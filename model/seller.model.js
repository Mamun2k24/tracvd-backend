import mongoose from "mongoose";

const sellerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    shopSlug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    shopLogo: {
      type: String,
      default: "",
    },

    shopBanner: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      trim: true,
    },

    businessAddress: {
      type: String,
      required: true,
      trim: true,
    },

    businessPhone: {
      type: String,
      required: true,
      trim: true,
    },

    nidNumber: {
      type: String,
      trim: true,
      select: false,
    },

    nidFrontImage: {
      type: String,
      select: false,
    },

    nidBackImage: {
      type: String,
      select: false,
    },

    tradeLicenseNumber: {
      type: String,
      trim: true,
      default: "",
    },

    tradeLicenseImage: {
      type: String,
      default: "",
      select: false,
    },

    paymentMethod: {
      type: {
        type: String,
        enum: ["bank", "bkash", "nagad", "rocket"],
      },
      accountName: String,
      accountNumber: String,
      bankName: String,
      branchName: String,
      routingNumber: String,
    },

    commissionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 10,
    },

    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },

    rating: {
      average: {
        type: Number,
        default: 0,
      },
      totalReviews: {
        type: Number,
        default: 0,
      },
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },

    rejectionReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

sellerSchema.index({ status: 1 });
sellerSchema.index({ shopName: "text" });

const Seller = mongoose.model("Seller", sellerSchema);

export default Seller;