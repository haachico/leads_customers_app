require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const cookieParser = require("cookie-parser");

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

const db = require("./config/db"); // adjust path if needed

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
