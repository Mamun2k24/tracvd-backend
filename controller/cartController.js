import mongoose from 'mongoose';
import { Product, AddToCart} from '../model/index.model.js'


export const addToCart = async (req, res) => {
  const {
    productId,
    userId,
    guestId,
    quantity = 1,
    selectedSize,
    selectedWeight,
    selectedColor,
    selectedChest,
    selectedWaist,
  } = req.body;

  try {
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    if (!userId && !guestId) {
      return res.status(400).json({ message: "UserId or GuestId required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const itemPrice = Number(product.price || 0);

    const query = {
      productId,
      ...(userId ? { userId } : { guestId }),
      ...(selectedSize ? { selectedSize } : {}),
      ...(selectedWeight ? { selectedWeight } : {}),
      ...(selectedColor ? { selectedColor } : {}),
      ...(selectedChest ? { selectedChest } : {}),
      ...(selectedWaist ? { selectedWaist } : {}),
    };

    const existingCartItem = await AddToCart.findOne(query);

    if (existingCartItem) {
      existingCartItem.quantity += Number(quantity) || 1;
      await existingCartItem.save();

      return res.status(200).json({
        message: "Cart updated successfully",
        cartItem: existingCartItem,
      });
    }

    const newCartItem = new AddToCart({
      productId,
      userId: userId || null,
      guestId: userId ? null : guestId,
      quantity: Number(quantity) || 1,
      selectedSize: selectedSize || null,
      selectedWeight: selectedWeight || null,
      selectedColor: selectedColor || null,
      selectedChest: selectedChest || null,
      selectedWaist: selectedWaist || null,
      itemPrice,
    });

    await newCartItem.save();

    return res.status(201).json({
      message: "Product added to cart",
      cartItem: newCartItem,
    });
  } catch (error) {
    console.error("Error adding product to cart:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getCarts = async (req, res) => {
  const { userId, guestId } = req.query;

  if (!userId && !guestId) {
    return res.status(400).json({ message: "UserId or GuestId required" });
  }

  try {
    const query = userId ? { userId } : { guestId };

    const cartItems = await AddToCart.find(query).populate(
      "productId",
      "productName productImage sizeWeight color chest waist price discount flashSale"
    );

    return res.status(200).json({ cartItems: cartItems || [] });
  } catch (error) {
    console.error("Error fetching carts:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const removeFromCart = async (req, res) => {
  const { itemId } = req.params;
  const { userId, guestId } = req.query;

  if (!itemId) {
    return res.status(400).json({ message: "Item ID is required" });
  }

  if (!userId && !guestId) {
    return res.status(400).json({ message: "UserId or GuestId required" });
  }

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ message: "Invalid item ID" });
  }

  try {
    const query = {
      _id: itemId,
      ...(userId ? { userId } : { guestId }),
    };

    const result = await AddToCart.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    return res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error removing product from cart:", error);
    return res.status(500).json({
      message: "Failed to delete item",
      error: error.message,
    });
  }
};

export const updateCartQuantity = async (req, res) => {
  const { itemId } = req.params;
  const { userId, guestId } = req.query;
  const { quantity } = req.body;

  if (!userId && !guestId) {
    return res.status(400).json({ message: "UserId or GuestId required" });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({
      message: "Quantity must be a positive integer",
    });
  }

  try {
    const query = {
      _id: itemId,
      ...(userId ? { userId } : { guestId }),
    };

    const updatedCartItem = await AddToCart.findOneAndUpdate(
      query,
      { $set: { quantity } },
      { new: true }
    );

    if (!updatedCartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    return res.status(200).json({
      message: "Cart quantity updated successfully",
      cartItem: updatedCartItem,
    });
  } catch (error) {
    console.error(`[CartController] Error updating cart item: ${error.message}`);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
