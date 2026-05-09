const pool = require("../config/db");
const cacheUtil = require("../utils/cacheUtil");

const leadsServices = {
  fetchLeads: async (
    page,
    limit,
    sort,
    order,
    search,
    status,
    role,
    userid,
  ) => {
    // 🔴 CREATE CACHE KEY
    const cacheKey = cacheUtil.generateKey(
      "leads",
      page,
      limit,
      sort,
      order,
      search,
      status,
      role,
      userid,
    );

    // 🟢 CHECK CACHE FIRST
    const cached = await cacheUtil.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    let connection;

    try {
      connection = await pool.getConnection();

      const allowedSortFields = ["id", "name", "email", "createdAt"];
      const allowedOrder = ["ASC", "DESC"];

      const safeSort = allowedSortFields.includes(sort) ? sort : "createdAt";
      const safeOrder = allowedOrder.includes(order.toUpperCase())
        ? order.toUpperCase()
        : "ASC";

      const offset = (page - 1) * limit;

      let conditions = [];
      let params = [];

      if (role === "user") {
        conditions.push("l.userId = ?");
        params.push(userid);
      }

      if (search) {
        conditions.push("(l.name LIKE ? OR l.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      if (status) {
        conditions.push("l.status = ?");
        params.push(status);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const query = `select l.*, u.name as assigned_to 
                   from leads as l
                   left join users as u
                   on l.userId = u.id
                   ${whereClause} order by l.${safeSort} ${safeOrder} 
                   limit ? offset ?  
    `;
      const [rows] = await connection.query(query, [...params, limit, offset]);

      const countQuery = `select count(*) as count from leads as l
        left join users as u
        on l.userId = u.id
         ${whereClause}`;

      const totalResult = await connection.query(countQuery, params);
      const total = totalResult[0][0].count;

      const result = {
        leads: rows,
        pagination: {
          page,
          limit,
          total: total,
          totalPages: Math.ceil(total / limit),
        },
        fromCache: false,
      };

      // 💾 STORE IN CACHE (5 minutes = 300 seconds)
      await cacheUtil.set(cacheKey, result, 300);

      return result;
    } catch (error) {
      console.error("Error fetching leads:", error.message);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  },

  addLead: async (name, email, status, userId) => {
    let connection;

    try {
      connection = await pool.getConnection();

      const [lead] = await connection.query(
        `select * from leads where email = ?`,
        [email],
      );

      if (lead.length > 0) {
        throw {
          statusCode: 400,
          message: "Lead with this email already exists",
        };
      }
      await connection.query(
        `insert into leads (name, email, status, userId) values (?, ?, ?, ?)`,
        [name, email, status || "new", userId],
      );
      return { message: "Lead created successfully" };
    } finally {
      if (connection) connection.release();
    }
  },

  updateLead: async (leadId, name, email, status, role, roleId) => {
    let connection;
    try {
      connection = await pool.getConnection();

      const [existingLead] = await connection.query(
        "SELECT * FROM leads WHERE id = ?",
        [leadId],
      );

      if (!existingLead || existingLead.length === 0) {
        throw { statusCode: 404, message: "Lead not found" };
      }

      if (email) {
        const [existingEmails] = await connection.query(
          `SELECT id FROM leads WHERE email = ? AND id != ?`,
          [email, leadId],
        );
        if (existingEmails.length > 0) {
          throw { statusCode: 400, message: "Email already exists" };
        }
      }

      const existingStatus = existingLead[0].status;
      const existingPhone = existingLead[0].phone;
      const existingEmail = existingLead[0].email;
      const existingName = existingLead[0].name;
      let conditions = [];
      let params = [];

      if (name) {
        conditions.push("name = ?");
        params.push(name);
      }

      if (email) {
        conditions.push("email = ?");
        params.push(email);
      }

      if (status) {
        conditions.push("status = ?");
        params.push(status);
      }

      if (conditions.length === 0) {
        throw { statusCode: 400, message: "No fields to update" };
      }

      const setClause = conditions.join(", ");

      const whereClause = role === "admin" ? "id = ?" : "userId = ? AND id = ?";
      const whereParams = role === "admin" ? [leadId] : [roleId, leadId];

      const query = `UPDATE leads SET ${setClause} WHERE ${whereClause}`;
      const [result] = await connection.query(query, [
        ...params,
        ...whereParams,
      ]);

      if (result.affectedRows === 0) {
        throw { statusCode: 404, message: "Lead not found or unauthorized" };
      }

      if (status === "converted" && existingStatus !== "converted") {
        const customerEmail = email || existingEmail;
        const query = `select * from customers where email = ?`;
        const [customer] = await connection.query(query, [customerEmail]);

        if (customer.length === 0) {
          try {
            await connection.query(
              `insert into customers (name, email, phone, leadId, userId) values (?, ?, ?, ?, ?)`,
              [
                name || existingName,
                customerEmail,
                existingPhone,
                leadId,
                existingLead[0].userId,
              ],
            );
          } catch (error) {
            throw { statusCode: 500, message: "Failed to create customer" };
          }
        }
      }

      return { message: "Lead updated successfully" };
    } finally {
      if (connection) connection.release();
    }
  },

  removeLead: async (leadId, role, userId) => {
    let connection;

    try {
      connection = await pool.getConnection();

      let conditions = [];
      let params = [];

      conditions.push("id = ?");
      params.push(leadId);

      if (role === "user") {
        conditions.push("userId = ?");
        params.push(userId);
      }

      const whereClause = conditions.join(" AND ");

      const query = `DELETE FROM leads WHERE ${whereClause}`;
      const [result] = await connection.query(query, params);

      if (result.affectedRows === 0) {
        throw { statusCode: 404, message: "Lead not found or unauthorized" };
      }
      return { message: "Lead deleted successfully" };
    } finally {
      if (connection) connection.release();
    }
  },
};

module.exports = leadsServices;
