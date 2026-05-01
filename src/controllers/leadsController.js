const {
  fetchLeads,
  addLead,
  updateLead,
  removeLead,
} = require("../services/leadsServices");

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
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error";
      res.status(statusCode).json({ message });
    }
  },
};

module.exports = leadsController;
