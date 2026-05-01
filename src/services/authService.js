const bcrypt = require("bcrypt");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "43434343oojfodjfdo4343";

const authService = {
  signupUser: async (name, email, password, role = "user") => {
    let connection;
    try {
      connection = await pool.getConnection();

      const [user] = await connection.query(
        "select * from users where email = ?",
        [email],
      );

      if (user.length > 0) {
        throw { statusCode: 400, message: "User already exists" };
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        "insert into users (name, email, password, role) values (?, ?, ?, ?)",
        [name, email, hashedPassword, role],
      );

      return { message: "User registered successfully" };
    } finally {
      if (connection) connection.release();
    }
  },

  loginUser: async (email, password) => {
    let connection;
    try {
      connection = await pool.getConnection();

      const [user] = await connection.query(
        "select * from users where email = ?",
        [email],
      );

      if (user.length === 0) {
        throw { statusCode: 400, message: "Invalid email or password" };
      }

      const isPasswordValid = await bcrypt.compare(password, user[0].password);

      if (!isPasswordValid) {
        throw { statusCode: 400, message: "Invalid email or password" };
      }

      const accessToken = jwt.sign(
        {
          id: user[0].id,
          email: user[0].email,
          role: user[0].role,
        },
        JWT_SECRET,
        { expiresIn: "1h" },
      );

      const refreshToken = jwt.sign(
        {
          id: user[0].id,
          email: user[0].email,
          role: user[0].role,
        },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await connection.query(
        "insert into refresh_tokens (user_id, token, expires_at) values (?, ?, ?)",
        [user[0].id, refreshToken, expiresAt],
      );

      return {
        accessToken,
        refreshToken,
        message: "Login successful",
        user: {
          id: user[0].id,
          name: user[0].name,
          role: user[0].role,
        },
      };
    } finally {
      if (connection) connection.release();
    }
  },
};

module.exports = authService;
