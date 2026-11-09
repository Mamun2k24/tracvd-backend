// controller/analytics.controller.js
import Order from "../model/order.model.js";

export const monthlySales = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const rows = await Order.aggregate([
      { $match: {
          createdAt: { $gte: start, $lt: end },
          // বিকল্প: কেবল paid/completed ধরতে চাইলে
          // paymentStatus: "paid",
          // orderStatus: { $in: ["processing", "completed"] }
        }
      },
      { $group: {
          _id: { $month: "$createdAt" },
          sales: { $sum: "$totalPrice" }
        }
      }
    ]);

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const map = Object.fromEntries(rows.map(r => [r._id, r.sales]));

    const series = monthNames.map((name, i) => ({
      name,
      sales: Math.round(map[i+1] || 0)
    }));

    res.json({ currency: "৳", series });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to build stats" });
  }
};
