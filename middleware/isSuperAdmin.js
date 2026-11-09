export const isSuperAdmin = (req, res, next) => {
  if (req.user?.role === "superadmin") return next();
  return res.status(403).json({ message: "Super Admin only." });
};
