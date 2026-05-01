const {
  fetchAllUsers,
  editUser,
  deleteUserUserId,
} = require("../services/usersServices");

const usersControllers = {
  getAllUsers: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const sort = req.query.sort || "createdAt";
      const order = req.query.order === "desc" ? "DESC" : "ASC";

      const serach = req.query.search || null;
      const role = req.query.role || null;

      const users = await fetchAllUsers(page, limit, sort, order, serach, role);

      res.status(200).json({
        success: true,
        data: users.users,
        pagination: users.pagination,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  updateUser: async (req, res) => {
    try {
      const userId = req.params.id;
      const { name, email, role } = req.body;
      const result = await editUser(userId, name, email, role);

      res.status(200).json({ message: result.message });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const userId = req.params.id;

      const result = await deleteUserUserId(userId);
      res.status(200).json({ message: result.message });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },
};

module.exports = usersControllers;
