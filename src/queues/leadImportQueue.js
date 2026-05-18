/**
 * QUEUE SETUP ONLY
 * File: src/queues/leadImportQueue.js
 * Purpose: Create and export Bull queue (Redis connection)
 * Does NOT process jobs - just creates the queue
 */

const Queue = require("bull");

const leadImportQueue = new Queue("lead-import", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// ============================================
// QUEUE EVENT LISTENERS (logging only)
// ============================================

leadImportQueue.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
  console.log(`   Imported ${job.returnvalue.importedCount} leads`);
});

leadImportQueue.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed: ${err.message}`);
  console.error(`   Attempt ${job.attemptsMade} of ${job.opts.attempts}`);
});

leadImportQueue.on("progress", (job, progress) => {
  console.log(`⏳ Job ${job.id} progress: ${progress}%`);
});

module.exports = leadImportQueue;
