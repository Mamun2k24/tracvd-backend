import express from "express";
import {
  addToCart,
  getCarts,
  removeFromCart,
  updateCartQuantity,
} from "../controller/cartController.js";

const router = express.Router();

router.post("/", addToCart);
router.get("/", getCarts);
router.delete("/:itemId", removeFromCart);
router.patch("/:itemId", updateCartQuantity);

export default router;