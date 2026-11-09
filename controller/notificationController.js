import mongoose from "mongoose";
import Notification from "../model/notification.model.js";

const getUserId = (req) =>
  req.user?._id || req.user?.id;

export const getMyNotifications = async (
  req,
  res,
) => {
  try {
    const userId = getUserId(req);

    const page = Math.max(
      Number(req.query.page || 1),
      1,
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100,
    );

    const type = String(
      req.query.type || "",
    ).trim();

    const unreadOnly =
      String(req.query.unread || "") ===
      "true";

    const query = {
      recipient: userId,
      ...(type ? { type } : {}),
      ...(unreadOnly
        ? { isRead: false }
        : {}),
    };

    const [notifications, total, unreadCount] =
      await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate("sender", "name email")
          .lean(),

        Notification.countDocuments(query),

        Notification.countDocuments({
          recipient: userId,
          isRead: false,
        }),
      ]);

    return res.json({
      success: true,
      notifications,
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(
      "getMyNotifications error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Error fetching notifications",
    });
  }
};

export const getUnreadNotificationCount =
  async (req, res) => {
    try {
      const count =
        await Notification.countDocuments({
          recipient: getUserId(req),
          isRead: false,
        });

      return res.json({
        success: true,
        count,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Error fetching unread count",
      });
    }
  };

export const markNotificationAsRead =
  async (req, res) => {
    try {
      if (
        !mongoose.isValidObjectId(
          req.params.id,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid notification ID",
        });
      }

      const notification =
        await Notification.findOneAndUpdate(
          {
            _id: req.params.id,
            recipient: getUserId(req),
          },
          {
            $set: {
              isRead: true,
              readAt: new Date(),
            },
          },
          {
            new: true,
          },
        );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message:
            "Notification not found",
        });
      }

      return res.json({
        success: true,
        message:
          "Notification marked as read",
        notification,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Error updating notification",
      });
    }
  };

export const markAllNotificationsAsRead =
  async (req, res) => {
    try {
      const result =
        await Notification.updateMany(
          {
            recipient: getUserId(req),
            isRead: false,
          },
          {
            $set: {
              isRead: true,
              readAt: new Date(),
            },
          },
        );

      return res.json({
        success: true,
        message:
          "All notifications marked as read",
        modifiedCount:
          result.modifiedCount,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          "Error marking notifications as read",
      });
    }
  };

export const deleteMyNotification = async (
  req,
  res,
) => {
  try {
    if (
      !mongoose.isValidObjectId(
        req.params.id,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid notification ID",
      });
    }

    const notification =
      await Notification.findOneAndDelete({
        _id: req.params.id,
        recipient: getUserId(req),
      });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found",
      });
    }

    return res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Error deleting notification",
    });
  }
};