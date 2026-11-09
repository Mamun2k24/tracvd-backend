
import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import Shop from "../model/shop.model.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const token =
      authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid token payload",
      });
    }

    const user = await User.findById(userId).select(
      "_id name email mobile role sellerStatus isActive isVerified",
    );

    if (!user) {
      return res.status(401).json({
        message: "User account not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Your account is inactive",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    const message =
      error.name === "TokenExpiredError"
        ? "Your session has expired"
        : "Invalid authentication token";

    return res.status(401).json({ message });
  }
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  return protect(req, res, next);
};

export const ensureAuth = protect;

export const ensureAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
};

export const ensureSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({
      message: "Superadmin access required",
    });
  }

  next();
};

export const ensureSeller = async (req, res, next) => {
  try {
    if (req.user?.role !== "seller") {
      return res.status(403).json({
        message: "Seller access required",
      });
    }

    if (req.user.sellerStatus !== "approved") {
      return res.status(403).json({
        message: "Your seller account is not approved",
      });
    }

    const shop = await Shop.findOne({
      owner: req.user._id,
      status: "approved",
      isActive: true,
    });

    if (!shop) {
      return res.status(403).json({
        message: "Approved shop not found",
      });
    }

    req.shop = shop;
    next();
  } catch (error) {
    console.error("ensureSeller error:", error);

    return res.status(500).json({
      message: "Failed to verify seller account",
    });
  }
};

export const ensureProductManager = async (
  req,
  res,
  next,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (
      ["admin", "superadmin"].includes(req.user.role)
    ) {
      req.productActor = {
        type: "admin",
        user: req.user,
        shop: null,
      };

      return next();
    }

    if (
      req.user.role !== "seller" ||
      req.user.sellerStatus !== "approved"
    ) {
      return res.status(403).json({
        message:
          "Only approved sellers or admins can manage products",
      });
    }

    const shop = await Shop.findOne({
      owner: req.user._id,
      status: "approved",
      isActive: true,
    });

    if (!shop) {
      return res.status(403).json({
        message: "Approved active shop not found",
      });
    }

    req.shop = shop;

    req.productActor = {
      type: "seller",
      user: req.user,
      shop,
    };

    return next();
  } catch (error) {
    console.error(
      "ensureProductManager error:",
      error,
    );

    return res.status(500).json({
      message: "Failed to verify product permission",
    });
  }
};