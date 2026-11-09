import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["bank", "bkash", "nagad", "rocket"],
    },
    accountName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    routingNumber: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const shopSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    verification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerVerification",
      default: null,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    logo: {
      type: String,
      default: "",
    },

    banner: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },

    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },

    businessAddress: {
      type: String,
      trim: true,
      default: "",
    },

    shippingSettings: {
  insideDhaka: {
    type: Number,
    min: 0,
    default: 60,
  },

  outsideDhaka: {
    type: Number,
    min: 0,
    default: 120,
  },

  freeDeliveryEnabled: {
    type: Boolean,
    default: false,
  },

  freeDeliveryMinimum: {
    type: Number,
    min: 0,
    default: 0,
  },
},

    commissionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 10,
    },

    pendingBalance: {
      type: Number,
      min: 0,
      default: 0,
    },

    availableBalance: {
      type: Number,
      min: 0,
      default: 0,
    },

    totalEarned: {
      type: Number,
      min: 0,
      default: 0,
    },

    paymentMethod: {
      type: paymentMethodSchema,
      default: null,
      select: false,
    },

    ratingAverage: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },

    ratingCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
      index: true,
    },
    sellerDebt: {
  type: Number,
  min: 0,
  default: 0,
},

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

shopSchema.index({ shopName: "text" });

const Shop =
  mongoose.models.Shop ||
  mongoose.model("Shop", shopSchema);

export default Shop;