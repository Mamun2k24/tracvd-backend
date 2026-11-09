
export const adminAuth = (req, res, next) => {
    if (req.user && req.user.role === "isAdmin") {
      next();
    } else {
      res.status(403).json({ message: "Access denied. Admins only." });
    }
  };
  