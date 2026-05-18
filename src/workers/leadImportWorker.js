/**
 * BACKGROUND WORKER - PROCESSES JOBS
 * File: src/workers/leadImportWorker.js
 * Purpose: Consumer - takes jobs from queue and processes Excel files
 * Does NOT create queue - just processes jobs
 */

const XLSX = require("xlsx");
const pool = require("../config/db");
const leadImportQueue = require("../queues/leadImportQueue");

// ============================================
// WORKER: Process Excel file
// ============================================

leadImportQueue.process(async (job) => {
  const { fileBase64, fileName, uploadedBy, jobId } = job.data;

  // Convert base64 back to Buffer
  const fileBuffer = Buffer.from(fileBase64, "base64");

  let connection;
  try {
    console.log(`🔄 Processing job ${job.id}: ${fileName}`);

    connection = await pool.getConnection();

    // -------- STEP 1: Parse Excel file --------
    console.log("Step 1: Parsing Excel file...");
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const excelData = XLSX.utils.sheet_to_json(worksheet);

    job.progress(10);
    await connection.query(
      `UPDATE import_jobs SET status = 'processing', progress = 10 WHERE job_id = ?`,
      [jobId],
    );

    if (excelData.length === 0) {
      throw new Error("Excel file is empty");
    }

    console.log(`Parsed ${excelData.length} rows from Excel`);

    // -------- STEP 2: Validate data --------
    console.log("Step 2: Validating lead data...");
    const validatedLeads = [];
    const errors = [];

    excelData.forEach((row, index) => {
      try {
        if (!row.name || !row.name.trim()) {
          errors.push({ row: index + 1, error: "Name is required" });
          return;
        }

        if (!row.email || !row.email.trim()) {
          errors.push({ row: index + 1, error: "Email is required" });
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(row.email.trim())) {
          errors.push({ row: index + 1, error: "Invalid email format" });
          return;
        }

        validatedLeads.push({
          name: row.name.trim(),
          email: row.email.trim().toLowerCase(),
          phone: row.phone ? row.phone.trim() : null,
          status: "new",
          userId: uploadedBy,
        });
      } catch (err) {
        errors.push({ row: index + 1, error: err.message });
      }
    });

    job.progress(30);
    await connection.query(
      `UPDATE import_jobs SET status = 'processing', progress = 30 WHERE job_id = ?`,
      [jobId],
    );

    console.log(
      `Validated ${validatedLeads.length} leads, ${errors.length} errors`,
    );

    // -------- STEP 3: Check for duplicates --------
    console.log("Step 3: Checking for duplicates...");
    const leadEmails = validatedLeads.map((l) => l.email);

    const [existingLeads] = await connection.query(
      "SELECT email FROM leads WHERE email IN (?)",
      [leadEmails],
    );

    const existingEmails = new Set(existingLeads.map((l) => l.email));
    const newLeads = validatedLeads.filter((l) => !existingEmails.has(l.email));

    job.progress(50);
    await connection.query(
      `UPDATE import_jobs SET status = 'processing', progress = 50 WHERE job_id = ?`,
      [jobId],
    );

    console.log(
      `${newLeads.length} new leads (${validatedLeads.length - newLeads.length} duplicates)`,
    );

    // -------- STEP 4: Batch insert into DB --------
    console.log("Step 4: Inserting leads into database...");

    if (newLeads.length > 0) {
      const values = newLeads.map((lead) => [
        lead.name,
        lead.email,
        lead.phone,
        lead.status,
        lead.userId,
      ]);

      const [insertResult] = await connection.query(
        `INSERT INTO leads (name, email, phone, status, userId) VALUES ?`,
        [values],
      );

      console.log(`✅ Inserted ${insertResult.affectedRows} leads`);
    }

    job.progress(80);
    await connection.query(
      `UPDATE import_jobs SET status = 'processing', progress = 80 WHERE job_id = ?`,
      [jobId],
    );

    // -------- STEP 5: Update import job status (if using import_jobs table) --------
    console.log("Step 5: Updating import job status...");

    const failedCount = errors.length;
    const importedCount = newLeads.length;

    // Only update if
    // jobs table exists
    try {
      await connection.query(
        `UPDATE import_jobs SET status = ?, progress = 100, processed_records = ?, failed_records = ?, errors = ?, completed_at = NOW() WHERE job_id = ?`,
        [
          "completed",
          importedCount,
          failedCount,
          JSON.stringify(errors.slice(0, 100)),
          jobId,
        ],
      );
    } catch (err) {
      console.log(
        "Note: import_jobs table update skipped (table may not exist)",
      );
    }

    job.progress(100);

    console.log(`✅ Job ${job.id} completed successfully`);

    return {
      success: true,
      importedCount,
      failedCount,
      duplicateCount: validatedLeads.length - newLeads.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    console.error(`❌ Job ${job.id} error:`, err.message);

    if (connection) {
      try {
        await connection.query(
          `UPDATE import_jobs SET status = ?, error_message = ?, completed_at = NOW() WHERE job_id = ?`,
          ["failed", err.message, jobId],
        );
      } catch (updateErr) {
        console.error("Failed to update import job status:", updateErr);
      }
    }

    throw err;
  } finally {
    if (connection) connection.release();
  }
});

module.exports = leadImportQueue;
