const { signupUser, loginUser } = require("../services/authService");

const authController = {
  signUp: async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ message: "Name, email, and password are required" });
      }

      const result = await signupUser(name, email, password, role);

      return res.status(201).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required" });
      }

      const result = await loginUser(email, password);

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: true, // set to true in production (requires HTTPS)
        sameSite: "strict", // or 'lax' depending on your setup
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.status(200).json({
        token: result.accessToken,
        message: result.message,
        user: result.user,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },
};

module.exports = authController;
