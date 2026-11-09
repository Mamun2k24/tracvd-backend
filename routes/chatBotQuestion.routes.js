import express from "express";
import {
  createChatBotQuestion,
  getChatBotQuestions,
  updateChatBotQuestion,
  deleteChatBotQuestion,
} from "../controller/chatBotQuestion.controller.js";

const router = express.Router();

router.post("/chatbot-questions", createChatBotQuestion);
router.get("/chatbot-questions", getChatBotQuestions);
router.patch("/chatbot-questions/:id", updateChatBotQuestion);
router.delete("/chatbot-questions/:id", deleteChatBotQuestion);

export default router;