const pool = require("../src/config/db");
const fs = require("fs");
const readline = require("readline");
const path = require("path");

async function bulkInsertFromFile(filePath = "leads.json", batchSize = 50) {
  try {
    const fullPath = path.join(__dirname, filePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      console.log("💡 Run this first: node scripts/generateLeads.js");
      process.exit(1);
    }

    console.log(`📖 Reading from: ${fullPath}`);
    console.log(`📦 Batch size: ${batchSize}\n`);

    const fileStream = fs.createReadStream(fullPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let batch = [];
    let totalInserted = 0;
    let batchNumber = 0;
    let lineNumber = 0;

    // Read line by line from file (streaming)
    for await (const line of rl) {
      lineNumber++;

      try {
        if (!line.trim()) continue; // Skip empty lines

        const lead = JSON.parse(line);

        // Add to batch
        batch.push([lead.name, lead.email, lead.status, lead.userId]);

        // When batch reaches size, insert
        if (batch.length >= batchSize) {
          await insertBatch(batch, batchNumber + 1);
          totalInserted += batch.length;
          batchNumber++;
          batch = []; // Clear batch
        }
      } catch (err) {
        console.error(`⚠️  Error parsing line ${lineNumber}: ${err.message}`);
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      await insertBatch(batch, batchNumber + 1);
      totalInserted += batch.length;
    }

    console.log(`\n✨ Bulk insert from file completed!`);
    console.log(`   Total lines read: ${lineNumber}`);
    console.log(`   Total inserted: ${totalInserted}`);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
}

async function insertBatch(batch, batchNumber) {
  try {
    const placeholders = batch.map(() => "(?, ?, ?, ?)").join(",");
    const values = batch.flat();

    const sql = `INSERT INTO leads (name, email, status, userId) VALUES ${placeholders}`;

    await pool.execute(sql, values);

    console.log(`✅ Batch ${batchNumber}: Inserted ${batch.length} leads`);
  } catch (err) {
    console.error(`❌ Error inserting batch ${batchNumber}:`, err.message);
    throw err;
  }
}

// Run the bulk insert
const filePath = process.argv[2] || "leads.json";
bulkInsertFromFile(filePath, 50);
