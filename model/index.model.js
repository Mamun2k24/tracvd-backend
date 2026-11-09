// models/index.js
import Product from "./product.model.js";
import Shop from "./shop.model.js";
import SellerVerification from "./sellerVerification.model.js";
import Category from "./category.model.js";
import Cart from "./cart.model.js";
import User from "./user.model.js";
import AddToCart from "./productuserid.model.js";
import Color from "./color.model.js";
import Order from "./order.model.js";
import Banner from "./banner.model.js";
import SubCategory from "./subCategory.model.js";
import Brand from "./brand.model.js";
import HomeSectionSetting from "./HomeSectionSetting.js";
import SiteTicker from "./siteTicker.model.js";
import HeaderSetting from "./HeaderSetting.model.js";
import ShippingSettings from "./shippingSettings.model.js";

// ✅ NEW
import StockHistory from "./stockHistory.model.js";

export {
  Product,
  Category,
  Cart,
  User,
  AddToCart,
  Color,
  Order,
  Banner,
  SubCategory,
  HomeSectionSetting,
  Brand,
  SiteTicker,
  HeaderSetting,
  ShippingSettings,
  Shop,
  SellerVerification,

  // ✅ NEW
  StockHistory,
};