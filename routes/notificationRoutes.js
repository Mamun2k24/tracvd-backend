import express from "express";

import {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteMyNotification,
} from "../controller/notificationController.js";

import {
  protect,
} from "../middleware/protect.js";

const router = express.Router();

// Admin, seller এবং customer সবাই নিজের notification দেখবে
router.get(
  "/",
  protect,
  getMyNotifications,
);

router.get(
  "/unread-count",
  protect,
  getUnreadNotificationCount,
);

router.patch(
  "/mark-all-read",
  protect,
  markAllNotificationsAsRead,
);

router.patch(
  "/:id/read",
  protect,
  markNotificationAsRead,
);

router.delete(
  "/:id",
  protect,
  deleteMyNotification,
);

export default router;