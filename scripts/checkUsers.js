const pool = require("../src/config/db");

async function checkUsers() {
  try {
    const [users] = await pool.query(
      "SELECT id, username, email FROM users LIMIT 10",
    );
    console.log("\n📋 Users in database:");
    console.table(users);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

checkUsers();
