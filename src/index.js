require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const cookieParser = require("cookie-parser");
const socketIo = require("socket.io");

const { saveChatMessage, getMessages } = require("./services/chatServices");
const { getChats, deleteChat } = require("./controllers/chatController");
const JWT_SECRET = process.env.JWT_SECRET || "43434343oojfodjfdo4343";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: "http://localhost:5173", // Your frontend URL
    credentials: true, // Allow cookies/auth headers
  }),
);

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

const usersRoutes = require("./routes/usersRoutes");
app.use("/api", usersRoutes);

const leadsRoutes = require("./routes/leadsRoutes");
app.use("/api", leadsRoutes);

const chatRoutes = require("./routes/chatRoutes");
app.use("/api", chatRoutes);

// ============================================
// START BACKGROUND WORKERS
// ============================================
require("./workers/leadImportWorker"); // Starts Bull queue consumer

const db = require("./config/db"); // adjust path if needed

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

const PORT = process.env.PORT || 4000;

// Create HTTP server with Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// Socket.io connection handler with authentication
io.on("connection", async (socket) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.log("❌ No token provided");
      socket.disconnect();
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    console.log("🔍 Token decoded:", decoded);

    socket.userId = decoded.id;
    socket.userName = decoded.name;
    socket.userEmail = decoded.email;

    const messages = await getMessages(50);

    socket.emit("load-messages", messages);

    console.log(`✅ User connected: ${socket.userName} (${socket.userId})`);

    socket.on("send-message", async (data) => {
      try {
        const result = await saveChatMessage(
          socket.userId,
          socket.userName,
          data.message,
        );

        io.emit("receive-message", {
          id: result[0].insertId,
          message: data.message,
          username: socket.userName,
          userId: socket.userId,
          socketId: socket.id,
          timestamp: new Date().toLocaleTimeString(),
        });
      } catch (error) {
        console.log("❌ Message save error:", error.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(
        `❌ User disconnected: ${socket.userName} (${socket.userId})`,
      );
    });
  } catch (error) {
    console.log("❌ Invalid token:", error.message);
    socket.disconnect();
  }
});

// Make io accessible to routes
app.io = io;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
