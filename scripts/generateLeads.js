const fs = require("fs");
const path = require("path");

// Generate 100 sample leads and write to file
function generateAndWriteLeads(filePath = "leads.json", count = 100) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    const statuses = ["new", "in-progress", "converted"];

    console.log(`📝 Generating ${count} leads and writing to ${filePath}...`);

    const userIds = [3, 4, 5];

    for (let i = 1; i <= count; i++) {
      const lead = {
        name: `Lead ${i}`,
        email: `lead${i}@example.com`,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        userId: userIds[Math.floor(Math.random() * userIds.length)],
      };

      // Write one JSON object per line
      stream.write(JSON.stringify(lead) + "\n");

      // Progress indicator
      if (i % 20 === 0) {
        console.log(`  ✓ Generated ${i}/${count} leads`);
      }
    }

    stream.end();

    stream.on("finish", () => {
      const stats = fs.statSync(filePath);
      console.log(`✅ Successfully written to ${filePath}`);
      console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
      resolve(filePath);
    });

    stream.on("error", reject);
  });
}

// Run the generator
const filePath = path.join(__dirname, "leads.json");
generateAndWriteLeads(filePath, 100)
  .then(() => {
    console.log(
      "\n🎉 Generation complete! Now run: node scripts/bulkInsertFromFile.js",
    );
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
