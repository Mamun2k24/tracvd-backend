// controller/adminStats.controller.js
import { User, Product, Order } from "../model/index.model.js";

export const getAdminStats = async (_req, res) => {
  try {
    // তোমার enum অনুযায়ী "active" মানে pending, processing
    const ACTIVE_STATUSES = ["pending", "processing"];

    const [totalUsers, totalProducts, activeOrders, ordersByStatusAgg] =
      await Promise.all([
        User.countDocuments({}),
        Product.countDocuments({}),
        Order.countDocuments({ orderStatus: { $in: ACTIVE_STATUSES } }),
        Order.aggregate([
          { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
        ])
      ]);

    // nice map (optional)
    const ordersByStatus = ordersByStatusAgg.reduce((acc, x) => {
      acc[x._id] = x.count;
      return acc;
    }, {});

    return res.json({
      totalUsers,
      totalProducts,
      activeOrders,      // <- ড্যাশবোর্ডে যেটা দেখাবে
      ordersByStatus,    // { pending: n, processing: n, completed: n, cancelled: n }
    });
  } catch (e) {
    console.error("getAdminStats error:", e);
    res.status(500).json({ message: "Server error" });
  }
};
