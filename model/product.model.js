// product.model.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    productName: { type: String, required: true, trim: true },

    // 🔥 NEW: multiple category id
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
      },
    ],

    // (optional: keep for backward support)
    categoryName: { type: String, trim: true },

    // ✅ 3 prices
    // Buy/Purchase/Buying price
    buyPrice: { type: Number, default: 0, min: 0 },

    // Regular price
    regularPrice: { type: Number, required: true, min: 0 },

    // Sell price (your existing field name stays price)
    price: { type: Number, required: true, min: 0 },
    flashSale: {
  enabled: {
    type: Boolean,
    default: false,
  },

  discountPercent: {
    type: Number,
    default: 0,
  },

  discountAmount: {
    type: Number,
    default: 0,
  },

  salePrice: {
    type: Number,
    default: 0,
  },

},


    // GPS tracker package: recurring service charge and visible feature list.
    monthlyCharge: { type: Number, default: null, min: 0 },
    features: { type: [String], default: [] },

    // ✅ Delivery system
    delivery: {
      type: {
        type: String,
        enum: ["cash_on_delivery", "free_delivery"],
        default: "cash_on_delivery",
      },
      area: {
        type: String,
        enum: ["inside_dhaka", "outside_dhaka", "all_bangladesh", null],
        default: null,
      },
    },

    brand: { type: String, trim: true },

    sizeWeight: [
      {
        size: { type: String, trim: true },
      },
    ],
        // ✅ NEW optional measurement fields
    chest: [
      {
        size: { type: String, trim: true },
      },
    ],

    waist: [
      {
        size: { type: String, trim: true },
      },
    ],

    color: [String],
    details: { type: String, required: true, trim: true },
    longDetails: { type: String, required: true, trim: true },
    status: { type: String, default: "available" },
    stock: { type: Number, default: 0, min: 0 },
    preBook: {
  enabled: {
    type: Boolean,
    default: false,
  },

  // কতদিন/কোন তারিখে product available হবে
  expectedDeliveryDate: {
    type: Date,
    default: null,
  },

  // pre-book এর জন্য কয়টা quantity নেওয়া যাবে
  limit: {
    type: Number,
    default: 0,
  },

  // কতজন already pre-book করেছে
  bookedCount: {
    type: Number,
    default: 0,
  },

  // pre-book এর জন্য advance payment লাগবে কিনা
  requireAdvancePayment: {
    type: Boolean,
    default: false,
  },

  // advance percentage
  advancePercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },

  // pre-book বন্ধ হয়ে গেলে
  closed: {
    type: Boolean,
    default: false,
  },
},
    ratings: { type: Number, default: 0, min: 0, max: 5 },
    productImage: { type: [String], required: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    productSource: {
  type: String,
  enum: ["platform", "seller"],
  default: "platform",
  index: true,
},

seller: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
  index: true,
},

shop: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Shop",
  default: null,
  index: true,
},

approvalStatus: {
  type: String,
  enum: ["pending", "approved", "rejected"],
  default: "approved",
  index: true,
},

rejectionReason: {
  type: String,
  trim: true,
  default: null,
},

approvedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

approvedAt: {
  type: Date,
  default: null,
},

isPublished: {
  type: Boolean,
  default: true,
  index: true,
},
  },
  

  { timestamps: true },
);

productSchema.index({
  productName: "text",
  sku: "text",
  brand: "text",
  categoryName: "text",
});

productSchema.index({
  seller: 1,
  approvalStatus: 1,
  createdAt: -1,
});

productSchema.index({
  shop: 1,
  isPublished: 1,
  approvalStatus: 1,
});
productSchema.index({ createdAt: -1 });

const Product = mongoose.model("Product", productSchema);
export default Product;
