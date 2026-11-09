import mongoose from "mongoose";
import Shop from "../model/shop.model.js";
import Product from "../model/product.model.js";
import User from "../model/user.model.js";

/* =====================================================
   Helpers
===================================================== */

const isValidEmail = (email) =>
  !email || /.+@.+\..+/.test(email);

const cleanString = (value) =>
  String(value ?? "").trim();

const safeShopFields = `
  owner
  shopName
  slug
  logo
  banner
  description
  contactEmail
  contactPhone
  businessAddress
  shippingSettings
  commissionRate
  ratingAverage
  ratingCount
  status
  isActive
  createdAt
  updatedAt
`;

const validatePaymentMethod = (paymentMethod) => {
  if (!paymentMethod) {
    return null;
  }

  const allowedMethods = [
    "bank",
    "bkash",
    "nagad",
    "rocket",
  ];

  const method = cleanString(
    paymentMethod.method,
  ).toLowerCase();

  if (!allowedMethods.includes(method)) {
    return "Invalid payment method";
  }

  const accountName = cleanString(
    paymentMethod.accountName,
  );

  const accountNumber = cleanString(
    paymentMethod.accountNumber,
  );

  if (!accountName) {
    return "Payment account name is required";
  }

  if (!accountNumber) {
    return "Payment account number is required";
  }

  if (
    method === "bank" &&
    !cleanString(paymentMethod.bankName)
  ) {
    return "Bank name is required";
  }

  return null;
};

/* =====================================================
   Seller: Get own shop
===================================================== */

export const getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({
      owner: req.user._id,
    })
      .select("+paymentMethod")
      .populate(
        "owner",
        "name email mobile profileImage role sellerStatus",
      )
      .populate(
        "verification",
        "businessName status documents adminNote",
      );

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    return res.status(200).json(shop);
  } catch (error) {
    console.error("getMyShop error:", error);

    return res.status(500).json({
      message: "Failed to load shop",
    });
  }
};

/* =====================================================
   Seller: Update own shop
===================================================== */

export const updateMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({
      owner: req.user._id,
      status: "approved",
      isActive: true,
    }).select("+paymentMethod");

    if (!shop) {
      return res.status(404).json({
        message: "Approved active shop not found",
      });
    }

    const {
      shopName,
      logo,
      banner,
      description,
      contactEmail,
      contactPhone,
      businessAddress,
      shippingSettings,
      paymentMethod,
    } = req.body;

    if (
      shopName !== undefined &&
      !cleanString(shopName)
    ) {
      return res.status(422).json({
        message: "Shop name cannot be empty",
      });
    }

    if (
      contactEmail !== undefined &&
      !isValidEmail(cleanString(contactEmail))
    ) {
      return res.status(422).json({
        message: "Invalid contact email",
      });
    }

    if (paymentMethod !== undefined) {
      const paymentError =
        validatePaymentMethod(paymentMethod);

      if (paymentError) {
        return res.status(422).json({
          message: paymentError,
        });
      }

      shop.paymentMethod = {
        method: cleanString(
          paymentMethod.method,
        ).toLowerCase(),

        accountName: cleanString(
          paymentMethod.accountName,
        ),

        accountNumber: cleanString(
          paymentMethod.accountNumber,
        ),

        bankName: cleanString(
          paymentMethod.bankName,
        ),

        branchName: cleanString(
          paymentMethod.branchName,
        ),

        routingNumber: cleanString(
          paymentMethod.routingNumber,
        ),
      };
    }

    if (shopName !== undefined) {
      shop.shopName = cleanString(shopName);
    }

    if (logo !== undefined) {
      shop.logo = cleanString(logo);
    }

    if (banner !== undefined) {
      shop.banner = cleanString(banner);
    }

    if (description !== undefined) {
      shop.description = cleanString(description);
    }

    if (contactEmail !== undefined) {
      shop.contactEmail = cleanString(
        contactEmail,
      ).toLowerCase();
    }

    if (contactPhone !== undefined) {
      shop.contactPhone =
        cleanString(contactPhone);
    }

    if (businessAddress !== undefined) {
      shop.businessAddress = cleanString(
        businessAddress,
      );
    }

    if (shippingSettings !== undefined) {
      const insideDhaka = Number(
        shippingSettings.insideDhaka,
      );

      const outsideDhaka = Number(
        shippingSettings.outsideDhaka,
      );

      const freeDeliveryMinimum = Number(
        shippingSettings.freeDeliveryMinimum || 0,
      );

      if (
        !Number.isFinite(insideDhaka) ||
        insideDhaka < 0
      ) {
        return res.status(422).json({
          message:
            "Inside Dhaka delivery charge is invalid",
        });
      }

      if (
        !Number.isFinite(outsideDhaka) ||
        outsideDhaka < 0
      ) {
        return res.status(422).json({
          message:
            "Outside Dhaka delivery charge is invalid",
        });
      }

      if (
        !Number.isFinite(freeDeliveryMinimum) ||
        freeDeliveryMinimum < 0
      ) {
        return res.status(422).json({
          message:
            "Free delivery minimum is invalid",
        });
      }

      shop.shippingSettings = {
        insideDhaka,
        outsideDhaka,

        freeDeliveryEnabled: Boolean(
          shippingSettings.freeDeliveryEnabled,
        ),

        freeDeliveryMinimum,
      };
    }

    await shop.save();

    return res.status(200).json({
      message: "Shop updated successfully",
      shop,
    });
  } catch (error) {
    console.error("updateMyShop error:", error);

    if (error?.name === "ValidationError") {
      return res.status(422).json({
        message: "Shop validation failed",
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update shop",
    });
  }
};

/* =====================================================
   Public: Get shop profile
===================================================== */

export const getPublicShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({
      slug: req.params.slug.toLowerCase(),
      status: "approved",
      isActive: true,
    })
      .select(safeShopFields)
      .populate(
        "owner",
        "name profileImage",
      )
      .lean();

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    return res.status(200).json(shop);
  } catch (error) {
    console.error("getPublicShop error:", error);

    return res.status(500).json({
      message: "Failed to load shop",
    });
  }
};

/* =====================================================
   Public: Get shop products
===================================================== */

export const getPublicShopProducts = async (
  req,
  res,
) => {
  try {
    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100,
    );

    const shop = await Shop.findOne({
      slug: req.params.slug.toLowerCase(),
      status: "approved",
      isActive: true,
    }).select("_id shopName slug logo");

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    const filter = {
      shop: shop._id,
      productSource: "seller",
      approvalStatus: "approved",
      isPublished: true,
    };

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select(
          `
            productName
            productImage
            price
            regularPrice
            flashSale
            brand
            stock
            status
            ratings
            ratingAvg
            ratingCount
            shop
          `,
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      shop,
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(
      "getPublicShopProducts error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to load shop products",
    });
  }
};

/* =====================================================
   Admin: List shops
===================================================== */

export const getAllShops = async (req, res) => {
  try {
    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100,
    );

    const status = cleanString(req.query.status);
    const search = cleanString(req.query.search);

    const filter = {};

    if (
      [
        "pending",
        "approved",
        "rejected",
        "suspended",
      ].includes(status)
    ) {
      filter.status = status;
    }

    if (search) {
      filter.$text = {
        $search: search,
      };
    }

    const [items, total] = await Promise.all([
      Shop.find(filter)
        .select(safeShopFields)
        .populate(
          "owner",
          "name email mobile profileImage role sellerStatus isActive",
        )
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

      Shop.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("getAllShops error:", error);

    return res.status(500).json({
      message: "Failed to load shops",
    });
  }
};

/* =====================================================
   Admin: Suspend shop
===================================================== */

export const suspendShop = async (req, res) => {
  try {
    const { id } = req.params;

    const reason = cleanString(req.body?.reason);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid shop ID",
      });
    }

    if (!reason) {
      return res.status(422).json({
        message: "Suspension reason is required",
      });
    }

    const shop = await Shop.findById(id);

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    shop.status = "suspended";
    shop.isActive = false;

    await shop.save();

    await User.findByIdAndUpdate(shop.owner, {
      $set: {
        sellerStatus: "suspended",
        sellerRejectionReason: reason,
      },
    });

    await Product.updateMany(
      {
        shop: shop._id,
        productSource: "seller",
      },
      {
        $set: {
          isPublished: false,
        },
      },
    );

    return res.status(200).json({
      message: "Shop suspended successfully",
      reason,
      shop,
    });
  } catch (error) {
    console.error("suspendShop error:", error);

    return res.status(500).json({
      message: "Failed to suspend shop",
    });
  }
};

/* =====================================================
   Admin: Activate shop
===================================================== */

export const activateShop = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid shop ID",
      });
    }

    const shop = await Shop.findById(id);

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    shop.status = "approved";
    shop.isActive = true;

    await shop.save();

    await User.findByIdAndUpdate(shop.owner, {
      $set: {
        role: "seller",
        sellerStatus: "approved",
        sellerRejectionReason: null,
      },
    });

    await Product.updateMany(
      {
        shop: shop._id,
        productSource: "seller",
        approvalStatus: "approved",
      },
      {
        $set: {
          isPublished: true,
        },
      },
    );

    return res.status(200).json({
      message: "Shop activated successfully",
      shop,
    });
  } catch (error) {
    console.error("activateShop error:", error);

    return res.status(500).json({
      message: "Failed to activate shop",
    });
  }
};

/* =====================================================
   Admin: Update commission
===================================================== */

export const updateShopCommission = async (
  req,
  res,
) => {
  try {
    const { id } = req.params;
    const commissionRate = Number(
      req.body?.commissionRate,
    );

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid shop ID",
      });
    }

    if (
      !Number.isFinite(commissionRate) ||
      commissionRate < 0 ||
      commissionRate > 100
    ) {
      return res.status(422).json({
        message:
          "Commission rate must be between 0 and 100",
      });
    }

    const shop = await Shop.findByIdAndUpdate(
      id,
      {
        $set: {
          commissionRate,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!shop) {
      return res.status(404).json({
        message: "Shop not found",
      });
    }

    return res.status(200).json({
      message: "Commission updated successfully",
      shop,
    });
  } catch (error) {
    console.error(
      "updateShopCommission error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to update commission",
    });
  }
};