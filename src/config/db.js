const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: "lead_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the connection
pool
  .getConnection()
  .then((connection) => {
    console.log("✅ MySQL Database connected successfully!");
    connection.release();
  })
  .catch((error) => {
    console.error("❌ MySQL connection failed:", error);
  });

module.exports = pool;
