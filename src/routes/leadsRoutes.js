const express = require("express");
const {
  getLeads,
  createLead,
  editLead,
  deleteLead,
} = require("../controllers/leadsController");
const {
  authenticationMiddleware,
  authorizationMiddleware,
} = require("../middlewares/authMiddleware");

const router = express.Router();

router.get(
  "/leads",
  authenticationMiddleware,
  authorizationMiddleware(["admin", "user"]),
  getLeads,
);

router.post(
  "/leads",
  authenticationMiddleware,
  authorizationMiddleware(["admin", "user"]),
  createLead,
);

router.patch(
  "/leads/:id",
  authenticationMiddleware,
  authorizationMiddleware(["admin", "user"]),
  editLead,
);

router.delete(
  "/leads/:id",
  authenticationMiddleware,
  authorizationMiddleware(["admin", "user"]),
  deleteLead,
);

module.exports = router;
