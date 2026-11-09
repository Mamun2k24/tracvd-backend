import mongoose from "mongoose";

const productUserIdSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },

    guestId: {
      type: String,
      required: false,
      default: null,
      index: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    itemPrice: {
      type: Number,
      default: 1,
    },

    selectedSize: {
      type: String,
      default: null,
    },

    selectedWeight: {
      type: String,
      default: null,
    },

    selectedColor: {
      type: String,
      default: null,
    },

    selectedChest: {
      type: String,
      default: null,
    },

    selectedWaist: {
      type: String,
      default: null,
    },
  },
  {
    collection: "carts",
    timestamps: true,
  }
);

const AddToCart = mongoose.model("AddToCart", productUserIdSchema);
export default AddToCart;