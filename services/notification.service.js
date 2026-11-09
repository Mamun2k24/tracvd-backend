import Notification from "../model/notification.model.js";
import User from "../model/user.model.js";

export const notifyUser = async ({
  recipient,
  sender = null,
  type = "system",
  title,
  message,
  priority = "normal",
  actionUrl = "",
  orderId = null,
  productId = null,
  shopId = null,
  payoutId = null,
  returnRequestId = null,
  sellerOrderId = null,
  metadata = {},
}) => {
  if (!recipient || !title || !message) {
    return null;
  }

  return Notification.create({
    recipient,
    sender,
    type,
    title,
    message,
    priority,
    actionUrl,
    orderId,
    productId,
    shopId,
    payoutId,
    returnRequestId,
    sellerOrderId,
    metadata,
  });
};

export const notifyMany = async ({
  recipients = [],
  ...notification
}) => {
  const uniqueRecipients = [
    ...new Set(
      recipients
        .filter(Boolean)
        .map(String),
    ),
  ];

  if (
    uniqueRecipients.length === 0 ||
    !notification.title ||
    !notification.message
  ) {
    return [];
  }

  return Notification.insertMany(
    uniqueRecipients.map((recipient) => ({
      recipient,
      ...notification,
    })),
  );
};

export const notifyAdmins = async (
  notification,
) => {
  const admins = await User.find({
    role: {
      $in: ["admin", "superadmin"],
    },
    isActive: true,
  })
    .select("_id")
    .lean();

  return notifyMany({
    recipients: admins.map(
      (admin) => admin._id,
    ),
    ...notification,
  });
};