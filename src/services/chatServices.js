const db = require("../config/db");

const saveChatMessage = async (userId, userName, message) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.query(
      `insert into messages (userId, username, message) values (?, ?, ?)`,
      [userId, userName, message],
    );

    return result;
  } finally {
    if (connection) connection.release();
  }
};

const getMessages = async (limit = 50) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [messages] = await connection.query(
      `select id, userId, username, message, createdAt from messages order by createdAt desc limit ?`,
      [limit],
    );

    const formattedMessages = messages.reverse().map((msg) => ({
      ...msg,
      timestamp: new Date(msg.createdAt).toLocaleTimeString(),
    }));

    return formattedMessages;
  } finally {
    if (connection) connection.release();
  }
};

const deleteMessage = async (messageId) => {
  let connection;
  try {
    connection = await db.getConnection();

    await connection.query(`delete from messages where id = ?`, [messageId]);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  saveChatMessage,
  getMessages,
  deleteMessage,
};
