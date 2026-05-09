const pool = require("../src/config/db");

// Generate 100 sample leads
function generateSampleLeads(count = 100) {
  const statuses = ["new", "in-progress", "converted"];
  const userIds = [3, 4, 5];
  const leads = [];

  for (let i = 1; i <= count; i++) {
    leads.push({
      name: `Lead ${i}`,
      email: `lead${i}@example.com`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      userId: userIds[Math.floor(Math.random() * userIds.length)],
    });
  }

  return leads;
}

async function bulkInsertLeads(batchSize = 50) {
  try {
    const leads = generateSampleLeads(100);
    let totalInserted = 0;
    let batchNumber = 0;

    // Insert in batches
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);

      const placeholders = batch.map(() => "(?, ?, ?, ?)").join(",");
      const values = batch.flatMap((lead) => [
        lead.name,
        lead.email,
        lead.status,
        lead.userId,
      ]);

      const sql = `INSERT INTO leads (name, email, status, userId) VALUES ${placeholders}`;

      try {
        await pool.execute(sql, values);
        totalInserted += batch.length;
        batchNumber++;
        console.log(
          `✅ Batch ${batchNumber}: Inserted ${batch.length} leads | Total: ${totalInserted}`,
        );
      } catch (err) {
        console.error(`❌ Error inserting batch ${batchNumber}:`, err.message);
      }
    }

    console.log(
      `\n✨ Bulk insert completed! Total: ${totalInserted} leads inserted`,
    );
  } catch (err) {
    console.error("Fatal error:", err.message);
  }
}

// Run the script
bulkInsertLeads(50);
