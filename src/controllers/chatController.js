const chatServices = require("../services/chatServices");

// Get all messages (load chat history)
const getChats = async (req, res) => {
  try {
    // Fetch last 50 messages from database
    const messages = await chatServices.getMessages(50);

    res.status(200).json({
      success: true,
      data: messages,
      count: messages.length,
      message: "Messages fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete a message
const deleteChat = async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate messageId
    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Message ID is required",
      });
    }

    // Delete message from database
    await chatServices.deleteMessage(messageId);

    // Emit Socket.io event to all clients
    const io = req.app.io;
    io.emit("message-deleted", { messageId });

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getChats,
  deleteChat,
};
