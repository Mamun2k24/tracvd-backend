import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percent", "fixed"], required: true }, // percent=10 => 10%
    amount: { type: Number, required: true, min: 0 },
    minSpend: { type: Number, default: 0, min: 0 }, // ৳ ন্যূনতম ক্রয় মূল্য
    appliesTo: {
      kind: { type: String, enum: ["all", "products", "categories"], default: "all" },
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      categoryNames: [{ type: String }], // তোমার product.categoryName string
    },
    excludeSaleItems: { type: Boolean, default: false }, // sale/markdown আইটেমে না লাগাতে চাইলে
    maxDiscount: { type: Number }, // cap (optional)
    startAt: { type: Date },
    endAt: { type: Date },
    usageLimit: { type: Number }, // total
    usedCount: { type: Number, default: 0 },
    perCustomerLimit: { type: Number }, // per user (optional)
    status: { type: String, enum: ["active", "paused", "expired"], default: "active" },
    combinable: { type: Boolean, default: false }, // অন্য কুপনের সাথে (ভবিষ্যতের জন্য)
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 });

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;
