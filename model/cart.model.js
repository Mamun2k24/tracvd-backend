import mongoose from "mongoose";

// Cart schema
const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User model
    required: true,
  },
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product", // Reference to the Product model
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1, // Quantity cannot be less than 1
        default: 1,
      },
      price: {
        type: Number,
        required: true, // Capture product price at the time of adding to cart
      },
      discount: {
        type: Number,
        default: 0, // Optional discount for the product
      },
      size: {
        type: String,
        required: false, // Optional size field
      },
      weight: {
        type: Number,
        required: false, // Optional weight field
      },
    },
  ],
  totalPrice: {
    type: Number,
    required: true,
    default: 0, // Automatically calculated field for the cart's total price
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the creation date
  },
  updatedAt: {
    type: Date,
    default: Date.now, // Automatically set the last updated date
  },
});

// Calculate and update total price before saving the cart
cartSchema.pre("save", function (next) {
  this.totalPrice = this.products.reduce((acc, product) => {
    const productTotal = product.price * product.quantity;
    const discountedPrice = productTotal - product.discount;
    return acc + discountedPrice;
  }, 0);
  next();
});

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
