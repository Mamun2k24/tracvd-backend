import express from "express";
import {
  createOrGetConversation,
  getMessages,
  sendUserMessage,
  sendAdminMessage,
  getAdminConversations,
  markConversationRead,
  closeConversation,
  trackOrderById,
  uploadChatImage,
  deleteConversation,
} from "../controller/chatController.js";

import uploadMemory from "../middleware/uploadMemory.js";

const router = express.Router();

router.post("/chat/conversation", createOrGetConversation);
router.get("/chat/messages/:conversationId", getMessages);
router.post("/chat/message/user", sendUserMessage);
router.post("/chat/message/admin", sendAdminMessage);

router.get("/admin/chat/conversations", getAdminConversations);
router.patch("/chat/read/:conversationId", markConversationRead);
router.patch("/chat/close/:conversationId", closeConversation);

router.post(
  "/chat/upload-image",
  uploadMemory.single("image"),
  uploadChatImage
);

router.get("/chat/order/:orderId", trackOrderById);
router.delete("/chat/conversation/:conversationId", deleteConversation);

export default router;