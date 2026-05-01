const express = require("express");
const {
  getAllUsers,
  updateUser,
  deleteUser,
} = require("../controllers/usersController");
const {
  authenticationMiddleware,
  authorizationMiddleware,
} = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/users",
  authenticationMiddleware,
  authorizationMiddleware(["admin"]),
  getAllUsers,
);

router.patch(
  "/users/:id",
  authenticationMiddleware,
  authorizationMiddleware(["admin"]),
  updateUser,
);

router.delete(
  "/users/:id",
  authenticationMiddleware,
  authorizationMiddleware(["admin"]),
  deleteUser,
);
module.exports = router;
