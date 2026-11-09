import ChatConversation from "../model/chatConversation.model.js";
import ChatMessage from "../model/chatMessage.model.js";
import Order from "../model/order.model.js";
import { uploadToImgbb } from "../utils/uploadToImgbb.js";

const quickReplies = {
  track_order:
    "আপনার Order ID দিন। আমি আপনার অর্ডারের বর্তমান status দেখিয়ে দিচ্ছি।",
  return_product:
    "প্রোডাক্ট return করতে হলে delivery পাওয়ার ২৪ ঘণ্টার মধ্যে আমাদের support team-এর সাথে যোগাযোগ করুন।",
  refund_status:
    "Refund সাধারণত ৩-৭ working days এর মধ্যে সম্পন্ন হয়। আপনার order/payment details দিলে আমরা check করে জানাতে পারবো।",
  talk_support:
    "আপনাকে live support এ connect করা হচ্ছে। একজন admin soon reply করবেন।",
};

export const createOrGetConversation = async (req, res) => {
  try {
    const { userId, guestId, customerName, customerEmail, customerMobile } =
      req.body;

    if (!userId && !guestId) {
      return res.status(400).json({
        success: false,
        message: "userId or guestId is required",
      });
    }

    const query = userId ? { user: userId } : { guestId };

    let conversation = await ChatConversation.findOne({
      ...query,
      status: { $ne: "closed" },
    });

    if (!conversation) {
      conversation = await ChatConversation.create({
        user: userId || null,
        guestId: guestId || null,
        customerName: customerName || "Guest User",
        customerEmail: customerEmail || null,
        customerMobile: customerMobile || null,
      });

      await ChatMessage.create({
        conversation: conversation._id,
        sender: "bot",
        message:
          "Hello! 👋 আমি Nova Assistant। কিভাবে আপনাকে সাহায্য করতে পারি?",
        messageType: "system",
      });
    }

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("createOrGetConversation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create conversation",
    });
  }
};

export const uploadChatImage = async (req, res) => {
  try {
    const { conversationId, sender = "user", userId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "conversationId is required" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Image is required" });
    }

    const uploaded = await uploadToImgbb(
      req.file.buffer,
      req.file.originalname,
      process.env.IMGBB_API_KEY
    );

    const imageMessage = await ChatMessage.create({
      conversation: conversationId,
      sender,
      senderUser: userId || null,
      message: uploaded.url,
      messageType: "image",
      attachment: {
        url: uploaded.url,
        thumbUrl: uploaded.thumb?.url || uploaded.url,
        deleteUrl: uploaded.delete_url || null,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
      },
    });

    await ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessage: "📷 Image",
      lastMessageAt: new Date(),
      $inc: sender === "admin" ? { unreadForUser: 1 } : { unreadForAdmin: 1 },
    });

    const io = req.app.get("io");
    io?.to(String(conversationId)).emit("receiveMessage", imageMessage);
    io?.to("admin-chat-room").emit("adminNewMessage", imageMessage);

    return res.status(201).json({
      success: true,
      message: imageMessage,
    });
  } catch (error) {
    console.error("uploadChatImage error:", error);
    return res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await ChatMessage.find({
      conversation: conversationId,
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("getMessages error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get messages",
    });
  }
};

export const sendUserMessage = async (req, res) => {
  try {
    const { conversationId, message, quickKey, userId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    const text = message || quickKey || "";

    if (!text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const userMessage = await ChatMessage.create({
      conversation: conversationId,
      sender: "user",
      senderUser: userId || null,
      message: quickKey ? text.replaceAll("_", " ") : text,
      messageType: quickKey ? "quick_reply" : "text",
    });

    await ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessage: userMessage.message,
      lastMessageAt: new Date(),
      $inc: { unreadForAdmin: 1 },
    });

    const io = req.app.get("io");
    io?.to(String(conversationId)).emit("receiveMessage", userMessage);
    io?.to("admin-chat-room").emit("adminNewMessage", userMessage);

    let botMessage = null;

    if (quickKey && quickReplies[quickKey]) {
      const updateData = {
        lastMessage: quickReplies[quickKey],
        lastMessageAt: new Date(),
      };

      if (quickKey === "talk_support") {
        updateData.mode = "live";
        updateData.status = "pending";
      }

      botMessage = await ChatMessage.create({
        conversation: conversationId,
        sender: "bot",
        message: quickReplies[quickKey],
        messageType: "quick_reply",
      });

      await ChatConversation.findByIdAndUpdate(conversationId, updateData);

      io?.to(String(conversationId)).emit("receiveMessage", botMessage);
    }

    return res.status(201).json({
      success: true,
      message: userMessage,
      botMessage,
    });
  } catch (error) {
    console.error("sendUserMessage error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

export const sendAdminMessage = async (req, res) => {
  try {
    const { conversationId, message, adminId } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        message: "conversationId and message are required",
      });
    }

    const adminMessage = await ChatMessage.create({
      conversation: conversationId,
      sender: "admin",
      senderUser: adminId || null,
      message,
      messageType: "text",
    });

    await ChatConversation.findByIdAndUpdate(conversationId, {
      mode: "live",
      status: "open",
      lastMessage: message,
      lastMessageAt: new Date(),
      $inc: { unreadForUser: 1 },
    });

    const io = req.app.get("io");
    io?.to(String(conversationId)).emit("receiveMessage", adminMessage);

    return res.status(201).json({
      success: true,
      message: adminMessage,
    });
  } catch (error) {
    console.error("sendAdminMessage error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send admin message",
    });
  }
};

export const getAdminConversations = async (_req, res) => {
  try {
    const conversations = await ChatConversation.find()
      .populate("user", "name email mobile profileImage")
      .populate("assignedAdmin", "name email")
      .sort({ lastMessageAt: -1 });

    return res.status(200).json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("getAdminConversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get conversations",
    });
  }
};

export const markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { reader } = req.body;

    const update =
      reader === "admin"
        ? { unreadForAdmin: 0 }
        : { unreadForUser: 0 };

    await ChatConversation.findByIdAndUpdate(conversationId, update);

    return res.status(200).json({
      success: true,
      message: "Conversation marked as read",
    });
  } catch (error) {
    console.error("markConversationRead error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark read",
    });
  }
};

export const closeConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await ChatConversation.findByIdAndUpdate(
      conversationId,
      {
        status: "closed",
        mode: "bot",
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("closeConversation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close conversation",
    });
  }
};

export const trackOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).select(
      "orderStatus paymentStatus totalPrice shippingCost customer createdAt"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "এই Order ID দিয়ে কোনো order পাওয়া যায়নি।",
      });
    }

    return res.status(200).json({
      success: true,
      order,
      message: `আপনার order status: ${order.orderStatus}. Payment status: ${order.paymentStatus}.`,
    });
  } catch (error) {
    console.error("trackOrderById error:", error);
    return res.status(500).json({
      success: false,
      message: "Order check করতে সমস্যা হয়েছে।",
    });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    await ChatMessage.deleteMany({ conversation: conversationId });
    const conversation = await ChatConversation.findByIdAndDelete(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    console.error("deleteConversation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete conversation",
    });
  }
};