const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { getChats, deleteChat } = chatController;

router.get("/chats", getChats);
router.delete("/chats/:messageId", deleteChat);

module.exports = router;
