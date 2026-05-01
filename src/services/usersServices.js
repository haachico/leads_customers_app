const pool = require("../config/db");

const usersService = {
  fetchAllUsers: async (page, limit, sort, order, search, role) => {
    let connection;
    try {
      const offset = (page - 1) * limit;
      connection = await pool.getConnection();

      const allowedSortFields = ["id", "name", "email", "createdAt"];
      const allowedOrder = ["ASC", "DESC"];

      const safeSort = allowedSortFields.includes(sort) ? sort : "createdAt";
      const safeOrder = allowedOrder.includes(order.toUpperCase())
        ? order.toUpperCase()
        : "ASC";

      const conditions = [];
      const params = [];

      if (search) {
        conditions.push("(name LIKE ? OR email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }
      if (role) {
        conditions.push("role = ?");
        params.push(role);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const [rows] = await connection.query(
        `SELECT id, name, email FROM users ${whereClause} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      const totalResult = await connection.query(
        `SELECT COUNT(*) as count FROM users ${whereClause}`,
        params,
      );

      const total = totalResult[0][0].count;

      return {
        users: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } finally {
      if (connection) connection.release();
    }
  },

  editUser: async (userId, name, email, role) => {
    let connection;

    try {
      connection = await pool.getConnection();

      const [user] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userId],
      );

      if (user.length === 0) {
        throw { statusCode: 404, message: "User not found" };
      }

      let conditons = [];
      const params = [];

      if (name) {
        conditons.push("name = ?");
        params.push(name);
      }

      if (email) {
        conditons.push("email = ?");
        params.push(email);
      }

      if (role) {
        conditons.push("role = ?");
        params.push(role);
      }

      if (conditons.length === 0) {
        throw { statusCode: 400, message: "No fields to update" };
      }

      const setClause = conditons.join(", ");
      await connection.query(`UPDATE users SET ${setClause} WHERE id = ?`, [
        ...params,
        userId,
      ]);

      return { message: "User updated successfully" };
    } finally {
      if (connection) connection.release();
    }
  },

  deleteUserUserId: async (userId) => {
    let connection;

    try {
      connection = await pool.getConnection();

      const [user] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userId],
      );

      if (user.length === 0) {
        throw { statusCode: 404, message: "User not found" };
      }

      await connection.query("DELETE FROM refresh_tokens WHERE user_id = ?", [
        userId,
      ]);

      await connection.query("DELETE FROM users WHERE id = ?", [userId]);
      return { message: "User deleted successfully" };
    } finally {
      if (connection) connection.release();
    }
  },
};

module.exports = usersService;
