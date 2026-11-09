import User from "../model/user.model.js";

// ✅ Admin + Super Admin
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id).select("role isActive");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({
        message: "Access denied. Admins only.",
      });
    }

    next();
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Only Super Admin
export const isSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id).select("role isActive");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    if (user.role !== "superadmin") {
      return res.status(403).json({
        message: "Access denied. Super Admin only.",
      });
    }

    next();
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Seller Only
export const isSeller = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id).select("role isActive sellerStatus");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    if (user.role !== "seller") {
      return res.status(403).json({
        message: "Access denied. Sellers only.",
      });
    }

    if (user.sellerStatus !== "approved") {
      return res.status(403).json({
        message: "Seller account is not approved yet.",
      });
    }

    next();
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Seller + Admin + Super Admin
export const isSellerOrAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id).select("role isActive sellerStatus");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    if (!["seller", "admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    if (user.role === "seller" && user.sellerStatus !== "approved") {
      return res.status(403).json({
        message: "Seller account is not approved yet.",
      });
    }

    next();
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ Flexible role middleware - future proof
export const allowRoles = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await User.findById(req.user.id).select("role isActive sellerStatus");

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      if (user.isActive === false) {
        return res.status(403).json({ message: "Account is inactive" });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({
          message: "Access denied. You do not have permission.",
        });
      }

      if (user.role === "seller" && user.sellerStatus !== "approved") {
        return res.status(403).json({
          message: "Seller account is not approved yet.",
        });
      }

      next();
    } catch (e) {
      return res.status(500).json({ message: "Server error" });
    }
  };
};