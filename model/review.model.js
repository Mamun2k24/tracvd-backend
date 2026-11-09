import mongoose from "mongoose";
const { Schema } = mongoose;

const ReviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // optional: কোন delivered order থেকে review দিলো (strong validation)
    order: { type: Schema.Types.ObjectId, ref: "Order" },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, trim: true, maxlength: 2000 },

    images: [{ type: String }], // optional: review images

    isVerifiedPurchase: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false }, // admin hide

    // vendor/admin reply (optional)
    reply: {
      text: { type: String, trim: true, maxlength: 2000 },
      repliedAt: { type: Date },
      repliedBy: { type: Schema.Types.ObjectId, ref: "User" }, // admin/vendor
    },
  },
  { timestamps: true, collection: "review" }
);

// one user can review a product once (simple rule)
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });

const Review = mongoose.model("Review", ReviewSchema);
export default Review;
