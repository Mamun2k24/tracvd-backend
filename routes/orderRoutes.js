import express from "express";

import {
  protect,
  optionalAuth,
  ensureSeller,
  ensureAdmin,
} from "../middleware/protect.js";

import {
  placeOrder,

  // Customer
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  getShippedOrders,

  // Guest
  getGuestOrders,
  getGuestOrderById,
  cancelGuestOrder,

  // Seller
  getSellerOrders,
  getSellerOrderById,
  updateSellerOrderStatus,

  // Admin orders
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getAllOrders,
  getPreBookOrders,
  getPendingOrders,
  getConfirmedOrders,
  getCancelledOrders,
  getDeliveredOrders,

  // Admin dashboard and reports
  getSalesReport,
  getDashboardSummary,
  getDashboardStats,
  reconcileSellerEarnings,

  // Admin seller orders
  getAdminSellerOrders,
  getAdminSellerOrderById,
  updateAdminSellerOrderStatus,
} from "../controller/orderController.js";
import { sendOrderToSteadfast } from "../controller/steadfast.controller.js";
import { permanentlyDeleteOrder } from "../controller/permanentDeleteOrder.controller.js";

const router = express.Router();

/* =====================================================
   Checkout: Logged-in customer অথবা guest
===================================================== */

router.post(
  "/order",
  optionalAuth,
  placeOrder,
);

/* =====================================================
   Logged-in customer orders
===================================================== */

router.get(
  "/my/orders",
  protect,
  getMyOrders,
);

router.get(
  "/my/orders/:orderId",
  protect,
  getMyOrderById,
);

router.patch(
  "/my/orders/:orderId/cancel",
  protect,
  cancelMyOrder,
);

/* =====================================================
   Guest customer orders
===================================================== */

router.get(
  "/guest/orders",
  getGuestOrders,
);

router.get(
  "/guest/orders/:orderId",
  getGuestOrderById,
);

router.patch(
  "/guest/orders/:orderId/cancel",
  cancelGuestOrder,
);


router.post(
  "/order/:orderId/steadfast",
  protect,
  ensureAdmin,
  sendOrderToSteadfast,
);

/* =====================================================
   Seller orders
===================================================== */

router.get(
  "/seller/orders",
  protect,
  ensureSeller,
  getSellerOrders,
);

router.get(
  "/seller/orders/:orderId/:sellerOrderId",
  protect,
  ensureSeller,
  getSellerOrderById,
);

router.patch(
  "/seller/orders/:orderId/:sellerOrderId/status",
  protect,
  ensureSeller,
  updateSellerOrderStatus,
);

/* =====================================================
   Admin order lists
===================================================== */

router.get(
  "/orders",
  protect,
  ensureAdmin,
  getAllOrders,
);

router.get(
  "/orders/pre-book",
  protect,
  ensureAdmin,
  getPreBookOrders,
);

router.get(
  "/orders/pending",
  protect,
  ensureAdmin,
  getPendingOrders,
);

router.get(
  "/orders/confirmed",
  protect,
  ensureAdmin,
  getConfirmedOrders,
);
router.get(
  "/orders/shipped",
  protect,
  ensureAdmin,
  getShippedOrders,
);

router.get(
  "/orders/cancelled",
  protect,
  ensureAdmin,
  getCancelledOrders,
);

router.get(
  "/orders/delivered",
  protect,
  ensureAdmin,
  getDeliveredOrders,
);

/* =====================================================
   Admin order management
===================================================== */

router.get(
  "/order/:orderId",
  protect,
  ensureAdmin,
  getOrderById,
);

router.put(
  "/order/:orderId",
  protect,
  ensureAdmin,
  updateOrderStatus,
);


/* =====================================================
   Permanent Delete Order — Admin Only
===================================================== */

router.delete(
  "/order/:orderId/permanent",
  protect,
  ensureAdmin,
  permanentlyDeleteOrder
);


router.delete(
  "/order/:orderId",
  protect,
  ensureAdmin,
  cancelOrder,
);

/* =====================================================
   Admin seller-order management
===================================================== */

router.get(
  "/admin/seller-orders",
  protect,
  ensureAdmin,
  getAdminSellerOrders,
);

router.get(
  "/admin/seller-orders/:orderId/:sellerOrderId",
  protect,
  ensureAdmin,
  getAdminSellerOrderById,
);

router.patch(
  "/admin/seller-orders/:orderId/:sellerOrderId/status",
  protect,
  ensureAdmin,
  updateAdminSellerOrderStatus,
);

/* =====================================================
   Admin dashboard and reports
===================================================== */

router.get(
  "/admin/dashboard/summary",
  protect,
  ensureAdmin,
  getDashboardSummary,
);

router.get(
  "/admin/dashboard/stats",
  protect,
  ensureAdmin,
  getDashboardStats,
);

router.get(
  "/reports/sales",
  protect,
  ensureAdmin,
  getSalesReport,
);

router.post(
  "/admin/orders/reconcile-earnings",
  protect,
  ensureAdmin,
  reconcileSellerEarnings,
);

export default router;