import ChatBotQuestion from "../model/chatBotQuestion.model.js";

const makeKey = (text = "") =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const createChatBotQuestion = async (req, res) => {
  try {
    const {
      question,
      answer,
      key,
      icon,
      showAsQuickReply,
      sortOrder,
      isActive,
    } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: "Question and answer are required",
      });
    }

    const finalKey = key ? makeKey(key) : makeKey(question);

    const exists = await ChatBotQuestion.findOne({ key: finalKey });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "This question key already exists",
      });
    }

    const item = await ChatBotQuestion.create({
      question,
      answer,
      key: finalKey,
      icon: icon || "MessageCircle",
      showAsQuickReply:
        typeof showAsQuickReply === "boolean" ? showAsQuickReply : true,
      sortOrder: Number(sortOrder) || 0,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("createChatBotQuestion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create chatbot question",
    });
  }
};

export const getChatBotQuestions = async (req, res) => {
  try {
    const { activeOnly } = req.query;

    const filter = {};
    if (activeOnly === "true") filter.isActive = true;

    const items = await ChatBotQuestion.find(filter).sort({
      sortOrder: 1,
      createdAt: -1,
    });

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("getChatBotQuestions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get chatbot questions",
    });
  }
};

export const updateChatBotQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    const updateData = { ...req.body };

    if (updateData.key) {
      updateData.key = makeKey(updateData.key);
    }

    if (updateData.sortOrder !== undefined) {
      updateData.sortOrder = Number(updateData.sortOrder) || 0;
    }

    const item = await ChatBotQuestion.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    return res.status(200).json({ success: true, item });
  } catch (error) {
    console.error("updateChatBotQuestion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update chatbot question",
    });
  }
};

export const deleteChatBotQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await ChatBotQuestion.findByIdAndDelete(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Question deleted successfully",
    });
  } catch (error) {
    console.error("deleteChatBotQuestion error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete chatbot question",
    });
  }
};