const express = require("express");
const multer = require("multer");
const {
  getLeads,
  createLead,
  editLead,
  deleteLead,
  submitLeadImport,
  getImportStatus,
  getImportHistory,
} = require("../controllers/leadsController");
const {
  authenticationMiddleware,
  authorizationMiddleware,
} = require("../middlewares/authMiddleware");

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel and CSV files allowed"));
    }
  },
});

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

// ============================================
// BULK IMPORT ROUTES (NEW)
// ============================================

// POST /leads/bulk-import - Upload Excel and start background job
router.post(
  "/leads/bulk-import",
  authenticationMiddleware,
  authorizationMiddleware(["admin"]), // Only admin can bulk import
  upload.single("excelFile"),
  submitLeadImport,
);

// GET /leads/import-status/:jobId - Check import job status
router.get(
  "/leads/import-status/:jobId",
  authenticationMiddleware,
  getImportStatus,
);

// GET /leads/import-history - View all past imports
router.get(
  "/leads/import-history",
  authenticationMiddleware,
  authorizationMiddleware(["admin"]), // Only admins can view import history
  getImportHistory,
);

module.exports = router;
