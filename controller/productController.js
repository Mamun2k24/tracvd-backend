// controllers/product.controller.js
import mongoose from "mongoose";
import { notifyUser, notifyAdmins } from "../services/notification.service.js";
import { Product, Category, StockHistory, Shop } from "../model/index.model.js";
import FlashSaleSettings from "../model/flashSaleSetting.model.js";
import sanitizeHtml from "sanitize-html";

// ---- helpers ----
const isAdminUser = (user) => ["admin", "superadmin"].includes(user?.role);

const buildProductOwnership = (req) => {
  if (isAdminUser(req.user)) {
    return {
      productSource: "platform",
      seller: null,
      shop: null,
      approvalStatus: "approved",
      rejectionReason: null,
      approvedBy: req.user._id,
      approvedAt: new Date(),
      isPublished: true,
    };
  }

  return {
    productSource: "seller",
    seller: req.user._id,
    shop: req.shop._id,
    approvalStatus: "pending",
    rejectionReason: null,
    approvedBy: null,
    approvedAt: null,
    isPublished: false,
  };
};

const findManageableProduct = async (req, productId) => {
  if (!mongoose.isValidObjectId(productId)) {
    return null;
  }

  if (isAdminUser(req.user)) {
    return Product.findById(productId);
  }

  return Product.findOne({
    _id: productId,
    seller: req.user._id,
    shop: req.shop._id,
  });
};

const PUBLIC_PRODUCT_FILTER = {
  approvalStatus: "approved",
  isPublished: true,
};

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const toNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const isBlank = (v) => v == null || (typeof v === "string" && v.trim() === "");
const ALLOWED_DELIVERY_TYPES = new Set(["cash_on_delivery", "free_delivery"]);
const ALLOWED_FREE_DELIVERY_AREAS = new Set([
  "inside_dhaka",
  "outside_dhaka",
  "all_bangladesh",
]);

// Shared validation for GPS tracker package information.
const parseGpsFields = (source, errors, partial = false) => {
  const result = {};
  if (!partial || Object.prototype.hasOwnProperty.call(source, "monthlyCharge")) {
    const raw = source.monthlyCharge;
    if (raw == null || raw === "") {
      result.monthlyCharge = null;
    } else if (typeof raw === "boolean" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      errors.monthlyCharge = { message: "Monthly charge must be a non-negative number" };
    } else {
      result.monthlyCharge = Number(raw);
    }
  }
  if (!partial || Object.prototype.hasOwnProperty.call(source, "features")) {
    if (source.features == null && !partial) {
      result.features = [];
    } else if (!Array.isArray(source.features) || source.features.length > 50 ||
               !source.features.every((item) => typeof item === "string" && item.length <= 160)) {
      errors.features = { message: "Features must be an array of up to 50 strings (160 characters each)" };
    } else {
      result.features = [...new Set(source.features.map((item) => item.trim()).filter(Boolean))];
    }
  }
  return result;
};

export const addProduct = async (req, res) => {
  try {
    const {
      sku,
      productName,
      categoryIds = [],
      color = [],
      productImage = [],
      brand = "",

      // ✅ 3 prices
      buyPrice = 0,
      regularPrice,
      price, // sell price (existing)

      // ✅ delivery
      delivery = {}, // { type, area }

      status = "available",
      stock = 0,
      preBook = {},
      sizeWeight = [],
      chest = [],
      waist = [],
      details,
      longDetails,
    } = req.body;

    const errors = {};
    const gpsFields = parseGpsFields(req.body, errors);
    const cleanLongDetails = sanitizeHtml(String(longDetails || ""), {
      allowedTags: [
        "p",
        "br",
        "b",
        "strong",
        "i",
        "em",
        "u",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "span",
        "div",
      ],
      allowedAttributes: {
        "*": ["style"], // ✅ any tag can keep style
      },
      allowedStyles: {
        "*": {
          color: [/^.*$/],
          background: [/^.*$/],
          textAlign: [/^left$|^right$|^center$|^justify$/],
        },
      },
    });
    if (!isNonEmptyString(sku)) errors.sku = { message: "SKU is required" };
    if (!isNonEmptyString(productName))
      errors.productName = { message: "Product name is required" };


    // categoryIds validate
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      errors.categories = { message: "At least one category is required" };
    } else if (categoryIds.length > 2) {
      errors.categories = {
        message: "Only one category and one subcategory are allowed",
      };
    } else if (!categoryIds.every((id) => mongoose.isValidObjectId(id))) {
      errors.categories = { message: "Invalid category id(s)" };
    }

    if (!Array.isArray(productImage) || productImage.length === 0) {
      errors.productImage = {
        message: "At least one product image is required",
      };
    }

    // ✅ parse prices
    const parsedBuyPrice = Number(buyPrice) || 0;
    if (parsedBuyPrice < 0) {
      errors.buyPrice = { message: "Buying price cannot be negative" };
    }

    const parsedRegularPrice = Number(regularPrice);
    if (!Number.isFinite(parsedRegularPrice) || parsedRegularPrice <= 0) {
      errors.regularPrice = {
        message: "Regular price must be a positive number",
      };
    }

    const parsedSellPrice = Number(price);
    if (!Number.isFinite(parsedSellPrice) || parsedSellPrice <= 0) {
      errors.price = { message: "Sell price must be a positive number" };
    }

    const parsedStock = Number(stock) || 0;
    if (parsedStock < 0) errors.stock = { message: "Stock cannot be negative" };

    if (!isNonEmptyString(details))
      errors.details = { message: "Product info is required" };
    if (!isNonEmptyString(cleanLongDetails))
      errors.longDetails = { message: "Additional info is required" };

    // ✅ delivery validation
    const deliveryType = String(delivery?.type || "cash_on_delivery");
    const deliveryAreaRaw = delivery?.area;

    if (!ALLOWED_DELIVERY_TYPES.has(deliveryType)) {
      errors.delivery = { message: "Invalid delivery type" };
    } else if (deliveryType === "free_delivery") {
      const area = String(deliveryAreaRaw || "");
      if (!ALLOWED_FREE_DELIVERY_AREAS.has(area)) {
        errors.delivery = { message: "Invalid free delivery area" };
      }
    }

    const parsedPreBook = {
  enabled: Boolean(preBook.enabled),

  expectedDeliveryDate:
    preBook.expectedDeliveryDate
      ? new Date(preBook.expectedDeliveryDate)
      : null,

  limit:
    Number(preBook.limit || 0),

  bookedCount:0,

  requireAdvancePayment:
    Boolean(preBook.requireAdvancePayment),

  advancePercentage:
    Number(preBook.advancePercentage || 0),

  closed:false
};
    // ✅ size parsing
    const parsedSizeWeight = (Array.isArray(sizeWeight) ? sizeWeight : [])
      .map((sw) => {
        const size = String(sw?.size ?? "").trim();
        if (!size) return null;
        return { size };
      })
      .filter(Boolean);
    const parsedChest = (Array.isArray(chest) ? chest : [])
      .map((item) => {
        const size = String(item?.size ?? "").trim();
        if (!size) return null;
        return { size };
      })
      .filter(Boolean);

    const parsedWaist = (Array.isArray(waist) ? waist : [])
      .map((item) => {
        const size = String(item?.size ?? "").trim();
        if (!size) return null;
        return { size };
      })
      .filter(Boolean);

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ message: "Validation error", errors });
    }

    // categories check
    const cats = await Category.find({ _id: { $in: categoryIds } }).select(
      "name parent",
    );

    if (cats.length !== categoryIds.length) {
      return res.status(422).json({
        message: "Validation error",
        errors: { categories: { message: "Some categories do not exist" } },
      });
    }

    const parentCats = cats.filter((c) => !c.parent);
    const subCats = cats.filter((c) => c.parent);

    if (parentCats.length > 1 || subCats.length > 1) {
      return res.status(422).json({
        message: "Validation error",
        errors: {
          categories: {
            message: "Only one parent category and one subcategory are allowed",
          },
        },
      });
    }

    if (parentCats.length === 0) {
      return res.status(422).json({
        message: "Validation error",
        errors: {
          categories: {
            message: "A parent category is required",
          },
        },
      });
    }

    if (parentCats.length === 1 && subCats.length === 1) {
      const parentId = String(parentCats[0]._id);
      const subParentId = String(subCats[0].parent);

      if (parentId !== subParentId) {
        return res.status(422).json({
          message: "Validation error",
          errors: {
            categories: {
              message:
                "Selected subcategory does not belong to the selected category",
            },
          },
        });
      }
    }

    const primaryCat = parentCats[0];
    const primaryCategoryName = primaryCat?.name || "";

    const ownership = buildProductOwnership(req);
    const doc = new Product({
      ...ownership,
      sku: String(sku).trim(),
      productName: String(productName).trim(),

      categories: categoryIds,
      categoryName: primaryCategoryName,

      color: Array.isArray(color) ? color : [],
      productImage,
      brand: String(brand || "").trim(),

      // ✅ prices
      buyPrice: parsedBuyPrice,
      regularPrice: parsedRegularPrice,
      price: parsedSellPrice, // sell price

      ...gpsFields,

      // ✅ delivery
      delivery: {
        type: deliveryType,
        area: deliveryType === "free_delivery" ? String(deliveryAreaRaw) : null,
      },

      status,
      stock: parsedStock,
      preBook: parsedPreBook,
      sizeWeight: parsedSizeWeight,
      chest: parsedChest,
      waist: parsedWaist,

      details: String(details).trim(),
      longDetails: cleanLongDetails,
    });

    await doc.save();

    if (doc.productSource === "seller") {
      await notifyAdmins({
        type: "product",
        title: "New Seller Product Submitted",
        message: `${doc.productName} was submitted for approval.`,
        priority: "normal",
        productId: doc._id,
        shopId: doc.shop,
        actionUrl: `/admin/products/${doc._id}`,
        metadata: {
          sellerId: doc.seller,
          approvalStatus: "pending",
        },
      }).catch((error) => {
        console.error("Product submission notification failed:", error);
      });
    }

    return res.status(201).json({
      message:
        ownership.productSource === "seller"
          ? "Product submitted for admin approval"
          : "Product created successfully",
      product: doc,
    });
  } catch (error) {
    if (
      error?.code === 11000 &&
      (error.keyPattern?.sku || error.keyValue?.sku)
    ) {
      return res.status(409).json({
        message: "SKU already exists",
        errors: { sku: { message: "Duplicate SKU" } },
      });
    }
    if (error?.name === "ValidationError" && error?.errors) {
      const errors = {};
      for (const [k, v] of Object.entries(error.errors)) {
        errors[k] = { message: v.message };
      }
      return res.status(422).json({ message: "Validation error", errors });
    }
    console.error("Error adding product:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// -------------------- PUBLIC FEED BY CATEGORY (HOME SECTION) --------------------
const HOME_CATEGORY_MAP = {
  men: "Men Collection",
  women: "Women Collection",
  kids: "Kids Collection",
};

export const getPublicProductsByHomeCategory = async (req, res) => {
  try {
    const { slug } = req.params; // men / women / kids
    const categoryName = HOME_CATEGORY_MAP[slug];

    if (!categoryName) {
      return res.status(400).json({ message: "Invalid category slug" });
    }

    const all = req.query.all === "true";
    const limitParam = parseInt(req.query.limit);
    const limit = all ? 0 : Math.min(limitParam || 12, 100);

    let query = Product.find(
      {
        categoryName,
        ...PUBLIC_PRODUCT_FILTER,
      },
      "productName productImage price discount brand categories shop monthlyCharge features",
    ).sort({ createdAt: -1 });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const products = await query.lean();
    return res.json(products); // শুধু array send করলাম
  } catch (e) {
    console.error("Error fetching home category products:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// -------------------- PUBLIC FEED --------------------
export const getPublicProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 300);
    const products = await Product.find(
      PUBLIC_PRODUCT_FILTER,
      `
    productName
    productImage
    price
    monthlyCharge
    features
    brand
    stock
    status
    regularPrice
    flashSale
    preBook
    shop
    productSource
  `,
      { lean: true },
    )
      .populate("shop", "shopName slug logo ratingAverage ratingCount")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(products);
  } catch (e) {
    console.error("Error fetching public products:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// -------------------- SINGLE --------------------
// export const singleProducts = async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) return res.status(404).send({ message: "Product not found" });
//     res.status(200).send(product);
//   } catch (error) {
//     console.error("Error fetching product:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// };
export const singleProducts = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      ...PUBLIC_PRODUCT_FILTER,
    })
      .populate(
        "shop",
        "shopName slug logo banner description ratingAverage ratingCount",
      )
      .populate("seller", "name profileImage");

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// -------------------- LIST (ADMIN) --------------------
export const getAllProducts = async (req, res) => {
  try {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1,
    );

    const limit = Math.min(
      Math.max(
        Number.parseInt(req.query.limit, 10) || 10,
        1,
      ),
      100,
    );

    const q = String(req.query.q || "").trim();

    const approvalStatus = String(
      req.query.approvalStatus || "",
    )
      .trim()
      .toLowerCase();

    const status = String(req.query.status || "")
      .trim()
      .toLowerCase();

    const stockStatus = String(
      req.query.stockStatus || "",
    )
      .trim()
      .toLowerCase();

    const validApprovalStatuses = [
      "pending",
      "approved",
      "rejected",
    ];

    const validStatuses = [
      "available",
      "out_of_stock",
      "inactive",
    ];

    const filter = {};

    // Seller শুধু নিজের shop-এর products দেখবে
    if (!isAdminUser(req.user)) {
      filter.productSource = "seller";
      filter.seller = req.user._id;
      filter.shop = req.shop._id;
    }

    if (
      approvalStatus &&
      validApprovalStatuses.includes(
        approvalStatus,
      )
    ) {
      filter.approvalStatus = approvalStatus;
    }

    if (
      status &&
      validStatuses.includes(status)
    ) {
      filter.status = status;
    }

    if (stockStatus === "in_stock") {
      filter.stock = { $gt: 0 };
    }

    if (stockStatus === "out_of_stock") {
      filter.stock = { $lte: 0 };
    }

    if (stockStatus === "low_stock") {
      const lowStockLimit = Math.max(
        Number(
          process.env.LOW_STOCK_THRESHOLD || 10,
        ),
        1,
      );

      filter.stock = {
        $gt: 0,
        $lte: lowStockLimit,
      };
    }

    if (q) {
      filter.$text = {
        $search: q,
      };
    }

    const sort = q
      ? {
          score: {
            $meta: "textScore",
          },
        }
      : {
          createdAt: -1,
        };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select(`
          sku
          productName
          categoryName
          price
          regularPrice
          buyPrice
          productImage
          stock
          status
          flashSale
          productSource
          seller
          shop
          approvalStatus
          rejectionReason
          isPublished
          updatedAt
          createdAt
        `)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(
      "getAllProducts error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to load products",
    });
  }
};

export const updateProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const product = await findManageableProduct(req, id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found or access denied",
      });
    }

    const body = req.body || {};
    const update = {};
    const errors = {};
    Object.assign(update, parseGpsFields(body, errors, true));

    /* =========================
       Basic information
    ========================= */

    if ("sku" in body) {
      const sku = String(body.sku || "").trim();

      if (!sku) {
        errors.sku = {
          message: "SKU is required",
        };
      } else {
        update.sku = sku;
      }
    }

    if ("productName" in body) {
      const productName = String(body.productName || "").trim();

      if (!productName) {
        errors.productName = {
          message: "Product name is required",
        };
      } else {
        update.productName = productName;
      }
    }

    if ("brand" in body) {
      update.brand = String(body.brand || "").trim();
    }

    if ("details" in body) {
      const details = String(body.details || "").trim();

      if (!details) {
        errors.details = {
          message: "Product information is required",
        };
      } else {
        update.details = details;
      }
    }

    if ("longDetails" in body) {
      const cleanLongDetails = sanitizeHtml(String(body.longDetails || ""), {
        allowedTags: [
          "p",
          "br",
          "b",
          "strong",
          "i",
          "em",
          "u",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "span",
          "div",
        ],
        allowedAttributes: {
          "*": ["style"],
        },
        allowedStyles: {
          "*": {
            color: [/^.*$/],
            background: [/^.*$/],
            textAlign: [/^left$|^right$|^center$|^justify$/],
          },
        },
      }).trim();

      if (!cleanLongDetails) {
        errors.longDetails = {
          message: "Additional product information is required",
        };
      } else {
        update.longDetails = cleanLongDetails;
      }
    }

    /* =========================
       Price validation
    ========================= */

    if ("buyPrice" in body) {
      const buyPrice = Number(body.buyPrice);

      if (!Number.isFinite(buyPrice) || buyPrice < 0) {
        errors.buyPrice = {
          message: "Buying price cannot be negative",
        };
      } else {
        update.buyPrice = buyPrice;
      }
    }

    if ("regularPrice" in body) {
      const regularPrice = Number(body.regularPrice);

      if (!Number.isFinite(regularPrice) || regularPrice <= 0) {
        errors.regularPrice = {
          message: "Regular price must be greater than 0",
        };
      } else {
        update.regularPrice = regularPrice;
      }
    }

    if ("price" in body) {
      const price = Number(body.price);

      if (!Number.isFinite(price) || price <= 0) {
        errors.price = {
          message: "Selling price must be greater than 0",
        };
      } else {
        update.price = price;
      }
    }

    /* =========================
       Category validation
    ========================= */

    if ("categoryIds" in body) {
      const categoryIds = Array.isArray(body.categoryIds)
        ? body.categoryIds
        : [];

      if (categoryIds.length === 0) {
        errors.categories = {
          message: "At least one category is required",
        };
      } else if (categoryIds.length > 2) {
        errors.categories = {
          message: "Only one category and one subcategory are allowed",
        };
      } else if (
        !categoryIds.every((categoryId) =>
          mongoose.isValidObjectId(categoryId),
        )
      ) {
        errors.categories = {
          message: "Invalid category ID",
        };
      } else {
        const categories = await Category.find({
          _id: {
            $in: categoryIds,
          },
        }).select("name parent");

        if (categories.length !== categoryIds.length) {
          errors.categories = {
            message: "One or more categories do not exist",
          };
        } else {
          const parentCategories = categories.filter(
            (category) => !category.parent,
          );

          const subCategories = categories.filter(
            (category) => category.parent,
          );

          if (parentCategories.length !== 1) {
            errors.categories = {
              message: "One parent category is required",
            };
          } else if (subCategories.length > 1) {
            errors.categories = {
              message: "Only one subcategory is allowed",
            };
          } else if (
            subCategories.length === 1 &&
            String(subCategories[0].parent) !==
              String(parentCategories[0]._id)
          ) {
            errors.categories = {
              message: "Subcategory does not belong to the selected category",
            };
          } else {
            update.categories = [
              parentCategories[0]._id,
              ...subCategories.map((category) => category._id),
            ];

            update.categoryName = parentCategories[0].name;
          }
        }
      }
    }

    /* =========================
       Product images
    ========================= */

    if ("productImage" in body) {
      const productImages = Array.isArray(body.productImage)
        ? body.productImage
            .map((image) => String(image || "").trim())
            .filter(Boolean)
        : [];

      if (productImages.length === 0) {
        errors.productImage = {
          message: "At least one product image is required",
        };
      } else if (productImages.length > 4) {
        errors.productImage = {
          message: "Maximum 4 product images are allowed",
        };
      } else {
        update.productImage = productImages;
      }
    }

    /* =========================
       Delivery
    ========================= */

    if ("delivery" in body) {
      const deliveryType = String(body.delivery?.type || "")
        .trim()
        .toLowerCase();

      const allowedDeliveryTypes = ["cash_on_delivery", "free_delivery"];

      if (!allowedDeliveryTypes.includes(deliveryType)) {
        errors.delivery = {
          message: "Invalid delivery type",
        };
      } else if (deliveryType === "free_delivery") {
        const deliveryArea = String(body.delivery?.area || "")
          .trim()
          .toLowerCase();

        const allowedDeliveryAreas = [
          "inside_dhaka",
          "outside_dhaka",
          "all_bangladesh",
        ];

        if (!allowedDeliveryAreas.includes(deliveryArea)) {
          errors.delivery = {
            message: "Invalid free delivery area",
          };
        } else {
          update.delivery = {
            type: deliveryType,
            area: deliveryArea,
          };
        }
      } else {
        update.delivery = {
          type: "cash_on_delivery",
          area: null,
        };
      }
    }

    /* =========================
       Pre Book
    ========================= */

    if ("preBook" in body) {
      const preBook = body.preBook || {};

      update.preBook = {
        enabled: Boolean(preBook.enabled),

        expectedDeliveryDate: preBook.expectedDeliveryDate
          ? new Date(preBook.expectedDeliveryDate)
          : null,

        limit: Number(preBook.limit || 0),

        // কতজন pre-book করেছে
        bookedCount: Number(preBook.bookedCount || 0),

        // optional advance payment setting
        requireAdvancePayment: Boolean(preBook.requireAdvancePayment),

        advancePercentage: Number(preBook.advancePercentage || 0),

        // pre-book manually বন্ধ করার জন্য
        closed: Boolean(preBook.closed),
      };
    }

    /* =========================
       Product status
    ========================= */

    if ("status" in body) {
      const status = String(body.status || "")
        .trim()
        .toLowerCase();

      const allowedStatuses = ["available", "out_of_stock"];

      if (!allowedStatuses.includes(status)) {
        errors.status = {
          message: "Invalid product status",
        };
      } else {
        update.status = status;
      }
    }

    /* =========================
       Product variations
    ========================= */

    if ("color" in body) {
      update.color = Array.isArray(body.color)
        ? [
            ...new Set(
              body.color
                .map((color) => String(color || "").trim())
                .filter(Boolean),
            ),
          ]
        : [];
    }

    if ("sizeWeight" in body) {
      update.sizeWeight = Array.isArray(body.sizeWeight)
        ? body.sizeWeight
            .map((item) => {
              const size = String(item?.size || "").trim();

              return size ? { size } : null;
            })
            .filter(Boolean)
        : [];
    }

    if ("chest" in body) {
      update.chest = Array.isArray(body.chest)
        ? body.chest
            .map((item) => {
              const size = String(item?.size || "").trim();

              return size ? { size } : null;
            })
            .filter(Boolean)
        : [];
    }

    if ("waist" in body) {
      update.waist = Array.isArray(body.waist)
        ? body.waist
            .map((item) => {
              const size = String(item?.size || "").trim();

              return size ? { size } : null;
            })
            .filter(Boolean)
        : [];
    }

    /* =========================
       Final validation
    ========================= */

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        message: "Validation error",
        errors,
      });
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        message: "Nothing to update",
      });
    }

    /*
      Seller product edit করলে আবার
      admin approval প্রয়োজন হবে।
    */

    if (!isAdminUser(req.user) && product.productSource === "seller") {
      update.approvalStatus = "pending";

      update.rejectionReason = null;
      update.approvedBy = null;
      update.approvedAt = null;
      update.isPublished = false;
    }

    Object.assign(product, update);

    await product.save();

    if (!isAdminUser(req.user) && product.productSource === "seller") {
      await notifyAdmins({
        sender: req.user?._id || req.user?.id,

        type: "product",

        title: "Seller Product Updated",

        message: `${product.productName} was updated and requires approval.`,

        priority: "normal",

        productId: product._id,
        shopId: product.shop,

        actionUrl: `/admin/products/${product._id}`,

        metadata: {
          sellerId: product.seller,
          approvalStatus: "pending",
        },
      }).catch((error) => {
        console.error("Product update notification failed:", error);
      });
    }

    await product.populate([
      {
        path: "shop",
        select: "shopName slug logo status isActive",
      },
      {
        path: "seller",
        select: "name email profileImage sellerStatus",
      },
      {
        path: "approvedBy",
        select: "name email role",
      },
    ]);

    return res.status(200).json({
      message: isAdminUser(req.user)
        ? "Product updated successfully"
        : "Product updated and submitted for admin approval",

      product,
    });
  } catch (error) {
    if (
      error?.code === 11000 &&
      (error.keyPattern?.sku || error.keyValue?.sku)
    ) {
      return res.status(409).json({
        message: "SKU already exists",
        errors: {
          sku: {
            message: "This SKU is already in use",
          },
        },
      });
    }

    if (error?.name === "ValidationError") {
      const errors = {};

      for (const [field, validationError] of Object.entries(
        error.errors || {},
      )) {
        errors[field] = {
          message: validationError.message,
        };
      }

      return res.status(422).json({
        message: "Validation error",
        errors,
      });
    }

    console.error("updateProductById error:", error);

    return res.status(500).json({
      message: "Failed to update product",
    });
  }
};

export const getFlashSaleProducts = async (req, res) => {
  try {
    const settings = await FlashSaleSettings.findOne();

    if (!settings) {
      return res.status(200).json([]);
    }

    const now = new Date();

    const isCampaignActive =
      settings.status === "active" &&
      now >= new Date(settings.startDate) &&
      now <= new Date(settings.endDate);

    if (!isCampaignActive) {
      return res.status(200).json([]);
    }

    const products = await Product.find({
      ...PUBLIC_PRODUCT_FILTER,
      "flashSale.enabled": true,
      stock: { $gt: 0 },
    })
      .select(
        `
        productName
        productImage
        price
        brand
        stock
        flashSale
      `,
      )
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json(products);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to load flash sale products",
    });
  }
};
// -------------------- DELETE --------------------
// export const deleteProductById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await Product.findByIdAndDelete(id);
//     if (!product) return res.status(404).send({ message: "Product not found" });
//     res.status(200).send({ message: "Product deleted successfully", product });
//   } catch (error) {
//     console.error("Error deleting product:", error);
//     res.status(500).send({ message: "Internal Server Error" });
//   }
// };
export const deleteProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await findManageableProduct(req, id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found or access denied",
      });
    }

    await product.deleteOne();

    return res.status(200).json({
      message: "Product deleted successfully",
      product,
    });
  } catch (error) {
    console.error("Error deleting product:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
// -------------------- SEARCH (typeahead) --------------------

export const searchQuery = async (req, res) => {
  try {
    // frontend থেকে ?q=mouse বা ?query=mouse — দুটোই চলবে
    const qRaw = (req.query.q ?? req.query.query ?? "").toString().trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    if (!qRaw) return res.status(400).json({ message: "Search query missing" });

    // বেস ফিল্টার (প্রয়োজনে status/useActive রাখো)
    const baseFilter = {
      ...PUBLIC_PRODUCT_FILTER,
    };

    let filter;
    let sort;

    // সহজ হিউরিস্টিক: text search ব্যবহার করতে চাইলে কোট/স্পেস থাকলেও ঠিক কাজ দেয়
    const useText = true; // চাইলে env/config দিয়ে কন্ট্রোল করো

    if (useText) {
      filter = {
        ...baseFilter,
        $text: { $search: qRaw },
      };
      sort = { score: { $meta: "textScore" } };
    } else {
      const rx = new RegExp(qRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter = {
        ...baseFilter,
        $or: [
          { productName: rx },
          { brand: rx },
          { categoryName: rx },
          { details: rx },
          { longDetails: rx },
        ],
      };
      sort = { createdAt: -1 };
    }

    const docs = await Product.find(filter)
      .sort(sort)
      .limit(limit)
      .select("_id productName productImage price brand categoryName") // ফ্রন্টএন্ড সাজেশনের দরকারি ফিল্ড
      .lean();

    return res.status(200).json(Array.isArray(docs) ? docs : []);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ message: "Error searching products" });
  }
};

// typeahead (title suggestions) — lightweight, 8 ta max
export const typeaheadSuggestions = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  try {
    // 2) regex fallback (case-insensitive)
    const docs = await Product.find(
      {
        ...PUBLIC_PRODUCT_FILTER,
        productName: {
          $regex: q,
          $options: "i",
        },
      },
      { productName: 1, _id: 0 },
    )
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    res.json(docs.map((d) => d.productName));
  } catch (e) {
    console.error("Typeahead error:", e);
    res.status(500).json({ message: "Error generating suggestions" });
  }
};

// -------------------- RELATED --------------------
export const getRelatedProducts = async (req, res) => {
  const { category } = req.params;
  const { excludeId } = req.query;

  try {
    const filter = {
      categoryName: category,
      ...PUBLIC_PRODUCT_FILTER,
    };
    if (excludeId && excludeId.match(/^[0-9a-fA-F]{24}$/)) {
      filter._id = { $ne: excludeId };
    }
    const relatedProducts = await Product.find(filter).limit(4);
    res.status(200).json(relatedProducts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching related products", error });
  }
};

// -------------------- STOCK MANAGEMENT LIST --------------------
// export const listStockTable = async (req, res) => {
//   try {
//     const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);

//     const lowThreshold = Math.max(
//       Number(process.env.LOW_STOCK_THRESHOLD || 10),
//       1,
//     );

//     const docs = await Product.find(
//   productFilter,
//       `
//         productName
//         sku
//         buyPrice
//         regularPrice
//         price
//         stock
//         status
//         categoryName
//         supplier
//         productImage
//         createdAt
//         updatedAt
//       `,
//       { lean: true },
//     )
//       .sort({ stock: 1, updatedAt: -1 })
//       .limit(limit)
//       .lean();

//     const items = docs.map((product) => {
//       const stock = Number(product.stock || 0);

//       let stockStatus = "In Stock";

//       if (stock <= 0) {
//         stockStatus = "Out of Stock";
//       } else if (stock <= lowThreshold) {
//         stockStatus = "Low Stock";
//       }

//       return {
//         id: product._id,
//         _id: product._id,

//         name: product.productName,
//         productName: product.productName,

//         sku: product.sku || "—",

//         buyPrice: Number(product.buyPrice || 0),
//         regularPrice: Number(product.regularPrice || 0),
//         price: Number(product.price || 0),

//         qty: stock,
//         stock,

//         status: product.status,
//         stockStatus,

//         categoryName: product.categoryName || "Uncategorized",
//         supplier: product.supplier || "local",

//         productImage: Array.isArray(product.productImage)
//           ? product.productImage
//           : [],

//         createdAt: product.createdAt,
//         updatedAt: product.updatedAt,
//       };
//     });

//     const stats = items.reduce(
//       (result, item) => {
//         result.totalProducts += 1;
//         result.totalUnits += item.stock;
//         result.inventoryValue += item.stock * item.buyPrice;
//         result.retailValue += item.stock * item.price;

//         if (item.stock <= 0) {
//           result.outOfStock += 1;
//         } else if (item.stock <= lowThreshold) {
//           result.lowStock += 1;
//         } else {
//           result.inStock += 1;
//         }

//         return result;
//       },
//       {
//         totalProducts: 0,
//         totalUnits: 0,
//         inventoryValue: 0,
//         retailValue: 0,
//         inStock: 0,
//         lowStock: 0,
//         outOfStock: 0,
//       },
//     );

//     return res.status(200).json({
//       items,
//       stats,
//       thresholds: {
//         low: lowThreshold,
//         out: 0,
//       },
//     });
//   } catch (error) {
//     console.error("listStockTable error:", error);

//     return res.status(500).json({
//       message: "Failed to load stock management data",
//     });
//   }
// };
// -------------------- STOCK MANAGEMENT LIST --------------------
export const listStockTable = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);

    const lowThreshold = Math.max(
      Number(process.env.LOW_STOCK_THRESHOLD || 10),
      1,
    );

    // Admin হলে সব product, seller হলে শুধু নিজের shop-এর product
    const productFilter = isAdminUser(req.user)
      ? {}
      : {
          seller: req.user._id,
          shop: req.shop._id,
        };

    const docs = await Product.find(
      productFilter,
      `
        productName
        sku
        buyPrice
        regularPrice
        price
        stock
        status
        categoryName
        supplier
        productImage
        createdAt
        updatedAt
      `,
    )
      .sort({ stock: 1, updatedAt: -1 })
      .limit(limit)
      .lean();

    const items = docs.map((product) => {
      const stock = Number(product.stock || 0);

      let stockStatus = "In Stock";

      if (stock <= 0) {
        stockStatus = "Out of Stock";
      } else if (stock <= lowThreshold) {
        stockStatus = "Low Stock";
      }

      return {
        id: product._id,
        _id: product._id,

        name: product.productName,
        productName: product.productName,

        sku: product.sku || "—",

        buyPrice: Number(product.buyPrice || 0),
        regularPrice: Number(product.regularPrice || 0),
        price: Number(product.price || 0),

        qty: stock,
        stock,

        status: product.status,
        stockStatus,

        categoryName: product.categoryName || "Uncategorized",
        supplier: product.supplier || "local",

        productImage: Array.isArray(product.productImage)
          ? product.productImage
          : [],

        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });

    const stats = items.reduce(
      (result, item) => {
        result.totalProducts += 1;
        result.totalUnits += item.stock;
        result.inventoryValue += item.stock * item.buyPrice;
        result.retailValue += item.stock * item.price;

        if (item.stock <= 0) {
          result.outOfStock += 1;
        } else if (item.stock <= lowThreshold) {
          result.lowStock += 1;
        } else {
          result.inStock += 1;
        }

        return result;
      },
      {
        totalProducts: 0,
        totalUnits: 0,
        inventoryValue: 0,
        retailValue: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
      },
    );

    return res.status(200).json({
      items,
      stats,
      thresholds: {
        low: lowThreshold,
        out: 0,
      },
    });
  } catch (error) {
    console.error("listStockTable error:", error);

    return res.status(500).json({
      message: "Failed to load stock management data",
    });
  }
};

// -------------------- STOCK MANAGEMENT --------------------
export const updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;

    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();

    const quantity = Number(req.body?.quantity);

    const reason = String(req.body?.reason || "").trim();
    const note = String(req.body?.note || "").trim();

    // তোমার auth middleware user data যেভাবে দেয়,
    // সে অনুযায়ী req.user?._id / req.user?.id ব্যবহার হবে
    const updatedBy = req.user?._id || req.user?.id || null;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    if (!["add", "remove", "set"].includes(action)) {
      return res.status(422).json({
        message: "Validation error",
        errors: {
          action: {
            message: "Action must be add, remove or set",
          },
        },
      });
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(422).json({
        message: "Validation error",
        errors: {
          quantity: {
            message: "Quantity must be a valid non-negative number",
          },
        },
      });
    }

    if (["add", "remove"].includes(action) && quantity <= 0) {
      return res.status(422).json({
        message: "Validation error",
        errors: {
          quantity: {
            message: "Quantity must be greater than 0",
          },
        },
      });
    }

    const product = await findManageableProduct(req, id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const previousStock = Number(product.stock || 0);

    let newStock = previousStock;

    if (action === "add") {
      newStock = previousStock + quantity;
    }

    if (action === "remove") {
      newStock = previousStock - quantity;

      if (newStock < 0) {
        return res.status(422).json({
          message: "Insufficient stock",
          errors: {
            quantity: {
              message: `Only ${previousStock} item(s) are currently available`,
            },
          },
        });
      }
    }

    if (action === "set") {
      newStock = quantity;
    }

    product.stock = newStock;

    // Stock অনুযায়ী product status automatically update
    if (newStock <= 0) {
      product.status = "out_of_stock";
    } else if (product.status === "out_of_stock") {
      product.status = "available";
    }

    await product.save();

    const history = await StockHistory.create({
      product: product._id,
      action,
      quantity,
      previousStock,
      newStock,
      reason,
      note,
      updatedBy,
    });

    return res.status(200).json({
      success: true,
      message: "Product stock updated successfully",
      product: {
        _id: product._id,
        sku: product.sku,
        productName: product.productName,
        stock: product.stock,
        status: product.status,
        updatedAt: product.updatedAt,
      },
      history,
    });
  } catch (error) {
    console.error("updateProductStock error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update product stock",
    });
  }
};

export const getProductStockHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Math.max(Number(req.query.page || 1), 1);

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const productExists = await findManageableProduct(req, id);

    if (!productExists) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const [items, total] = await Promise.all([
      StockHistory.find({
        product: id,
      })
        .populate("updatedBy", "name email")
        .sort({
          createdAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      StockHistory.countDocuments({
        product: id,
      }),
    ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getProductStockHistory error:", error);

    return res.status(500).json({
      message: "Failed to load stock history",
    });
  }
};

export const getManageableProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const product = await findManageableProduct(req, id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found or access denied",
      });
    }

    await product.populate([
      {
        path: "shop",
        select: "shopName slug logo status isActive commissionRate",
      },
      {
        path: "seller",
        select: "name email mobile profileImage role sellerStatus",
      },
      {
        path: "approvedBy",
        select: "name email role",
      },
    ]);

    return res.status(200).json(product);
  } catch (error) {
    console.error("getManageableProductById error:", error);

    return res.status(500).json({
      message: "Failed to load product",
    });
  }
};

export const getPendingSellerProducts = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    const search = String(req.query.search || "").trim();

    const filter = {
      productSource: "seller",
      approvalStatus: "pending",
    };

    if (search) {
      filter.$text = {
        $search: search,
      };
    }

    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate({
          path: "seller",
          select: "name email mobile profileImage sellerStatus isActive",
        })
        .populate({
          path: "shop",
          select: "shopName slug logo status isActive commissionRate",
        })
        .sort(
          search
            ? {
                score: {
                  $meta: "textScore",
                },
              }
            : { createdAt: -1 },
        )
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getPendingSellerProducts error:", error);

    return res.status(500).json({
      message: "Failed to load pending products",
    });
  }
};

export const approveSellerProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    const product = await Product.findOne({
      _id: id,
      productSource: "seller",
    });

    if (!product) {
      return res.status(404).json({
        message: "Seller product not found",
      });
    }

    if (product.approvalStatus === "approved") {
      return res.status(409).json({
        message: "Product is already approved",
      });
    }

    const shop = await Shop.findOne({
      _id: product.shop,
      owner: product.seller,
      status: "approved",
      isActive: true,
    });

    if (!shop) {
      return res.status(403).json({
        message: "Seller shop is not active or approved",
      });
    }

    product.approvalStatus = "approved";
    product.rejectionReason = null;
    product.approvedBy = req.user._id;
    product.approvedAt = new Date();
    product.isPublished = true;

    await product.save();
    if (
  product.productSource === "seller" &&
  product.seller
) {
  await notifyUser({
    recipient: product.seller,
    sender: req.user?._id || req.user?.id,
    type: "product",
    title: "Product Approved",
    message: `${product.productName} has been approved and published.`,
    priority: "normal",
    productId: product._id,
    shopId: product.shop,
    actionUrl: `/seller/products/${product._id}`,
    metadata: {
      approvalStatus: "approved",
      isPublished: true,
    },
  }).catch((error) => {
    console.error(
      "Product approval notification failed:",
      error,
    );
  });
}

    await product.populate([
      {
        path: "seller",
        select: "name email mobile",
      },
      {
        path: "shop",
        select: "shopName slug logo",
      },
      {
        path: "approvedBy",
        select: "name email role",
      },
    ]);

    return res.status(200).json({
      message: "Product approved successfully",
      product,
    });
  } catch (error) {
    console.error("approveSellerProduct error:", error);

    return res.status(500).json({
      message: "Failed to approve product",
    });
  }
};
export const rejectSellerProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    if (!reason) {
      return res.status(422).json({
        message: "Rejection reason is required",
      });
    }

    const product = await Product.findOne({
      _id: id,
      productSource: "seller",
    });

    if (!product) {
      return res.status(404).json({
        message: "Seller product not found",
      });
    }

    product.approvalStatus = "rejected";
    product.rejectionReason = reason;
    product.approvedBy = null;
    product.approvedAt = null;
    product.isPublished = false;

    await product.save();

    if (
  product.productSource === "seller" &&
  product.seller
) {
  await notifyUser({
    recipient: product.seller,
    sender: req.user?._id || req.user?.id,
    type: "product",
    title: "Product Rejected",
    message: `${product.productName} was rejected. Reason: ${reason}`,
    priority: "high",
    productId: product._id,
    shopId: product.shop,
    actionUrl: `/seller/products/${product._id}/edit`,
    metadata: {
      approvalStatus: "rejected",
      reason,
    },
  }).catch((error) => {
    console.error(
      "Product rejection notification failed:",
      error,
    );
  });
}

    await product.populate([
      {
        path: "seller",
        select: "name email mobile",
      },
      {
        path: "shop",
        select: "shopName slug logo",
      },
    ]);

    return res.status(200).json({
      message: "Product rejected successfully",
      product,
    });
  } catch (error) {
    console.error("rejectSellerProduct error:", error);

    return res.status(500).json({
      message: "Failed to reject product",
    });
  }
};
export const getAdminSellerProducts = async (
  req,
  res,
) => {
  try {
    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit || 20),
        1,
      ),
      100,
    );

    const approvalStatus = String(
      req.query.approvalStatus || "",
    )
      .trim()
      .toLowerCase();

    const search = String(
      req.query.search || "",
    ).trim();

    const validStatuses = [
      "pending",
      "approved",
      "rejected",
    ];

    if (
      approvalStatus &&
      !validStatuses.includes(
        approvalStatus,
      )
    ) {
      return res.status(422).json({
        message:
          "Invalid product approval status",
      });
    }

    const filter = {
      productSource: "seller",

      ...(approvalStatus
        ? { approvalStatus }
        : {}),

      ...(search
        ? {
            $or: [
              {
                productName: {
                  $regex: search,
                  $options: "i",
                },
              },
              {
                sku: {
                  $regex: search,
                  $options: "i",
                },
              },
              {
                brand: {
                  $regex: search,
                  $options: "i",
                },
              },
              {
                categoryName: {
                  $regex: search,
                  $options: "i",
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] =
      await Promise.all([
        Product.find(filter)
          .populate(
            "seller",
            "name email mobile profileImage sellerStatus isActive",
          )
          .populate(
            "shop",
            "shopName slug logo status isActive commissionRate",
          )
          .populate(
            "approvedBy",
            "name email role",
          )
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        Product.countDocuments(filter),
      ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(
        total / limit,
      ),
    });
  } catch (error) {
    console.error(
      "getAdminSellerProducts error:",
      error,
    );

    return res.status(500).json({
      message:
        "Failed to load seller products",
      error: error.message,
    });
  }
};
export const updateSellerProductPublication =
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isPublished } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid product ID",
        });
      }

      if (
        typeof isPublished !== "boolean"
      ) {
        return res.status(422).json({
          message:
            "isPublished must be true or false",
        });
      }

      const product =
        await Product.findOne({
          _id: id,
          productSource: "seller",
        })
          .populate(
            "seller",
            "name email sellerStatus isActive",
          )
          .populate(
            "shop",
            "shopName slug status isActive",
          );

      if (!product) {
        return res.status(404).json({
          message:
            "Seller product not found",
        });
      }

      if (
        isPublished &&
        product.approvalStatus !==
          "approved"
      ) {
        return res.status(409).json({
          message:
            "Only approved products can be published",
        });
      }

      if (
        isPublished &&
        (!product.shop ||
          product.shop.status !==
            "approved" ||
          product.shop.isActive !== true)
      ) {
        return res.status(409).json({
          message:
            "Product shop is not active and approved",
        });
      }

      if (
        isPublished &&
        (!product.seller ||
          product.seller.sellerStatus !==
            "approved" ||
          product.seller.isActive === false)
      ) {
        return res.status(409).json({
          message:
            "Product seller is not active and approved",
        });
      }

      product.isPublished = isPublished;

      await product.save();

      return res.status(200).json({
        message: isPublished
          ? "Product published successfully"
          : "Product unpublished successfully",

        product,
      });
    } catch (error) {
      console.error(
        "updateSellerProductPublication error:",
        error,
      );

      return res.status(500).json({
        message:
          "Failed to update product publication",
        error: error.message,
      });
    }
  };
export const updateProductFlashSale = async (
  req,
  res,
) => {
  try {
    const { id } = req.params;
    const flashSale = req.body?.flashSale;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid product ID",
      });
    }

    if (
      !flashSale ||
      typeof flashSale !== "object"
    ) {
      return res.status(422).json({
        message: "Flash sale information is required",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const enabled = Boolean(flashSale.enabled);

    const discountPercent = Math.min(
      100,
      Math.max(
        0,
        Number(flashSale.discountPercent || 0),
      ),
    );

    const discountAmount = Math.min(
      Number(product.price || 0),
      Math.max(
        0,
        Number(flashSale.discountAmount || 0),
      ),
    );

    if (
      enabled &&
      discountPercent <= 0 &&
      discountAmount <= 0
    ) {
      return res.status(422).json({
        message:
          "Discount percent or discount amount is required",
      });
    }

    const calculatedAmount =
      discountAmount > 0
        ? discountAmount
        : Math.round(
            Number(product.price || 0) *
              (discountPercent / 100),
          );

    const calculatedPercent =
      discountPercent > 0
        ? discountPercent
        : Number(product.price || 0) > 0
          ? Math.round(
              (calculatedAmount /
                Number(product.price)) *
                100,
            )
          : 0;

    product.flashSale = enabled
      ? {
          enabled: true,
          discountPercent: calculatedPercent,
          discountAmount: calculatedAmount,
          salePrice: Math.max(
            0,
            Number(product.price || 0) -
              calculatedAmount,
          ),
        }
      : {
          enabled: false,
          discountPercent: 0,
          discountAmount: 0,
          salePrice: 0,
        };

    await product.save();

    return res.status(200).json({
      message: enabled
        ? "Product added to flash sale"
        : "Product removed from flash sale",
      product,
    });
  } catch (error) {
    console.error(
      "updateProductFlashSale error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to update flash sale",
      error: error.message,
    });
  }
};