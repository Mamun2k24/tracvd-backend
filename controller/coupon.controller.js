import Coupon from "../model/coupon.model.js";
import Product from "../model/product.model.js";
import { buildProductsMap, priceCart } from "../utils/pricing.js";

export const applyCoupon = async (req, res) => {
  try {
    const { code, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart items required" });
    }

    let coupon = null;
    if (code) {
      const c = await Coupon.findOne({ code: String(code).toUpperCase().trim() }).lean();
      if (!c) return res.status(404).json({ message: "Invalid coupon code" });
      if (c.status === "expired" || c.status === "paused") {
        return res.status(400).json({ message: "Coupon is not active" });
      }
      coupon = c;
    }

    // fetch products present in cart
    const ids = items.map((x) => x.productId);
    const products = await Product.find({ _id: { $in: ids } }).lean();
    const map = buildProductsMap(products);

    const priced = priceCart({ items, productsById: map, coupon });

    return res.json({
      ...priced,
      applied: coupon
        ? {
            code: coupon.code,
            type: coupon.type,
            amount: coupon.amount,
            minSpend: coupon.minSpend || 0,
          }
        : null,
    });
  } catch (e) {
    console.error("applyCoupon error:", e);
    res.status(500).json({ message: "Server error" });
  }
};
