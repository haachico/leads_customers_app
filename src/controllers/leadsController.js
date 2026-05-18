const {
  fetchLeads,
  addLead,
  updateLead,
  removeLead,
  submitBulkImport,
  checkImportStatus,
  getImportJobHistory,
} = require("../services/leadsServices");
const cacheUtil = require("../utils/cacheUtil");

const leadsController = {
  getLeads: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const sort = req.query.sort || "createdAt";
      const order = req.query.order === "desc" ? "DESC" : "ASC";
      const search = req.query.search || null;
      const status = req.query.status || null;
      const role = req.user.role || null;
      const userId = req.user.id;

      // ✅ SERVICE HANDLES ALL CACHING INTERNALLY
      const result = await fetchLeads(
        page,
        limit,
        sort,
        order,
        search,
        status,
        role,
        userId,
      );

      res.status(200).json({
        success: true,
        data: result.leads,
        pagination: result.pagination,
        fromCache: result.fromCache, // From service
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  createLead: async (req, res) => {
    try {
      const { name, email, status } = req.body;
      const userId = req.user.id;
      if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      const result = await addLead(name, email, status, userId);

      // 🗑️  INVALIDATE ALL LEADS CACHE
      await cacheUtil.deletePattern("leads:*");

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  editLead: async (req, res) => {
    try {
      const { name, email, status } = req.body;
      const leadId = req.params.id;
      const role = req.user.role;
      const roleId = req.user.id;
      const result = await updateLead(
        leadId,
        name,
        email,
        status,
        role,
        roleId,
      );

      // 🗑️  INVALIDATE ALL LEADS CACHE
      await cacheUtil.deletePattern("leads:*");

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  deleteLead: async (req, res) => {
    try {
      const leadId = req.params.id;
      const role = req.user.role;
      const userId = req.user.id;

      const result = await removeLead(leadId, role, userId);

      // 🗑️  INVALIDATE ALL LEADS CACHE
      await cacheUtil.deletePattern("leads:*");

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },

  // ============================================
  // BULK IMPORT METHODS
  // ============================================

  submitLeadImport: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
          error: { code: "NO_FILE" },
        });
      }

      const userId = req.user.id;
      const result = await submitBulkImport(req.file, userId);

      // 🗑️  INVALIDATE ALL LEADS CACHE
      await cacheUtil.deletePattern("leads:*");

      res.status(202).json({
        success: true,
        message: "Lead import started in background",
        statusCode: 202,
        data: result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Error starting import";
      res.status(statusCode).json({
        success: false,
        message,
        error: { code: error.code || "IMPORT_ERROR" },
      });
    }
  },

  getImportStatus: async (req, res) => {
    try {
      const { jobId } = req.params;
      const result = await checkImportStatus(jobId);

      res.status(200).json({
        success: true,
        data: result,
        statusCode: 200,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Error fetching import status";
      res.status(statusCode).json({
        success: false,
        message,
        error: { code: error.code || "STATUS_ERROR" },
      });
    }
  },

  getImportHistory: async (req, res) => {
    try {
      const result = await getImportJobHistory();

      res.status(200).json({
        success: true,
        data: result,
        statusCode: 200,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Error fetching import history";
      res.status(statusCode).json({
        success: false,
        message,
        error: { code: error.code || "HISTORY_ERROR" },
      });
    }
  },
};

module.exports = leadsController;
