/\*\*

- BULK LEAD IMPORT - SETUP GUIDE
- File: lead_backend/SETUP_BULK_IMPORT.md
-
- Step-by-step guide to implement bulk lead import with Redis + Bull
  \*/

# Bulk Lead Import Implementation Guide

## Overview

Admin uploads Excel file → Background worker processes → Leads inserted to DB with progress tracking

---

## STEP 1: Install Dependencies

```bash
cd lead_backend

# Install Bull (job queue)
npm install bull

# Install XLSX parser
npm install xlsx

# Multer is likely already installed, but just in case:
npm install multer

# Verify installations
npm list bull xlsx multer
```

**What these packages do:**

- `bull`: Job queue that stores jobs in Redis
- `xlsx`: Parses Excel files (.xlsx, .xls, .csv)
- `multer`: Handles file uploads from requests

---

## STEP 2: Create Database Table

Run the SQL migration:

```bash
# Option 1: Run directly in MySQL CLI
mysql -u root -p your_database < migrations/001_create_import_jobs_table.sql

# Option 2: Or run in MySQL Workbench/Admin panel
# Copy-paste content from migrations/001_create_import_jobs_table.sql
```

**Table created:** `import_jobs` (tracks all bulk import operations)

---

## STEP 3: Update Package.json (if needed)

Make sure `.env` has Redis config:

```bash
# In lead_backend/.env

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password

# Or if using Redis Cloud/external:
REDIS_HOST=your-redis-cloud-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password
```

---

## STEP 4: Update Routes

Replace your current `src/routes/leadsRoutes.js` with the updated version.

**Or manually add these 3 routes to existing leadsRoutes.js:**

```javascript
const bulkImportService = require("../services/bulkLeadImportService");
const multer = require("multer");

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    cb(
      allowed.includes(file.mimetype) ? null : new Error("Invalid file"),
      true,
    );
  },
});

// Add these 3 routes:
router.post(
  "/bulk-import",
  authMiddleware,
  upload.single("excelFile"),
  bulkImportService.submitLeadImport,
);
router.get(
  "/import-status/:jobId",
  authMiddleware,
  bulkImportService.getImportStatus,
);
router.get(
  "/import-history",
  authMiddleware,
  bulkImportService.getImportHistory,
);
```

---

## STEP 5: Create Role Check Middleware (Optional but Recommended)

```javascript
// File: lead_backend/src/middlewares/roleMiddleware.js

const checkRole = (requiredRole) => {
  return (req, res, next) => {
    if (req.user.role !== requiredRole && req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can bulk import leads",
        error: { code: "FORBIDDEN" },
      });
    }
    next();
  };
};

module.exports = checkRole;
```

Then update the route:

```javascript
const checkRole = require("../middlewares/roleMiddleware");

router.post(
  "/bulk-import",
  authMiddleware,
  checkRole("admin"), // Add this
  upload.single("excelFile"),
  bulkImportService.submitLeadImport,
);
```

---

## STEP 6: Update Index.js to Import Service

Add this to `lead_backend/src/index.js`:

```javascript
// At the top with other requires
const bulkImportService = require("./services/bulkLeadImportService");

// This initializes the queue listener
console.log("✅ Bulk import service initialized");
```

---

## STEP 7: Test the Implementation

### Test 1: Check if Redis is connected

```bash
# In terminal, check Redis connection
redis-cli ping
# Should return: PONG

# Check if Bull queue is working:
redis-cli
> KEYS *
# Should see keys like: "bull:lead-import:*"
```

### Test 2: Test API with cURL

```bash
# Create test Excel file first (or use existing)

# Upload leads
curl -X POST http://localhost:5000/api/v1/leads/bulk-import \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "excelFile=@leads.xlsx"

# Response (202 Accepted):
{
  "success": true,
  "message": "Lead import started in background",
  "statusCode": 202,
  "data": {
    "jobId": "lead_import_1_1715861234567",
    "fileName": "leads.xlsx",
    "estimatedTime": "5-10 minutes for 1000 leads"
  }
}
```

### Test 3: Check Import Status

```bash
curl -X GET http://localhost:5000/api/v1/leads/import-status/lead_import_1_1715861234567 \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"

# Response:
{
  "success": true,
  "data": {
    "jobId": "lead_import_1_1715861234567",
    "status": "active",      // or "completed" or "failed"
    "progress": "50%",
    "progressValue": 50,
    "attempts": { "made": 1, "max": 3 },
    "result": { "importedCount": 500, "failedCount": 0 },
    "error": null
  }
}
```

### Test 4: Check Import History

```bash
curl -X GET http://localhost:5000/api/v1/leads/import-history \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"

# Response: List of all past imports
```

---

## STEP 8: Frontend Integration (React)

```javascript
// File: lead-frontend/src/components/BulkLeadImport.jsx

import { useState } from "react";

export const BulkLeadImport = () => {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null);

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);

    // Upload file
    const formData = new FormData();
    formData.append("excelFile", selectedFile);

    try {
      const response = await fetch("/api/v1/leads/bulk-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });

      const data = await response.json();
      const newJobId = data.data.jobId;
      setJobId(newJobId);

      // Poll for status every 2 seconds
      const interval = setInterval(async () => {
        const statusRes = await fetch(
          `/api/v1/leads/import-status/${newJobId}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );

        const statusData = await statusRes.json();
        setProgress(statusData.data.progressValue);
        setStatus(statusData.data.status);

        if (
          statusData.data.status === "completed" ||
          statusData.data.status === "failed"
        ) {
          clearInterval(interval);
          alert(`Import ${statusData.data.status}!`);
        }
      }, 2000);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload file");
    }
  };

  return (
    <div>
      <h2>Bulk Import Leads</h2>

      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} />

      {jobId && (
        <>
          <p>Job ID: {jobId}</p>
          <p>Status: {status}</p>

          <div
            style={{ border: "1px solid #ccc", width: "200px", height: "20px" }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                backgroundColor: "green",
                transition: "width 0.3s",
              }}
            />
          </div>

          <p>{progress}% Complete</p>
        </>
      )}
    </div>
  );
};
```

---

## STEP 9: Production Considerations

### Multiple Workers

Run multiple workers for parallel processing:

```bash
# Terminal 1: Main server
npm start

# Terminal 2: Worker 1
node -e "require('./src/services/bulkLeadImportService')"

# Terminal 3: Worker 2
node -e "require('./src/services/bulkLeadImportService')"

# Now jobs are processed in parallel!
```

### Email Notifications (Optional)

Uncomment this in `bulkLeadImportService.js`:

```javascript
// Step 6: Send email notification
await sendEmailNotification(uploadedBy, {
  subject: "Lead Import Completed",
  importedCount,
  failedCount,
  jobId,
});
```

### Excel File Format

Your Excel should have columns:

```
| Name     | Email            | Phone       | Company    |
|----------|------------------|-------------|------------|
| John Doe | john@example.com | +1234567890 | Acme Inc   |
| Jane Doe | jane@example.com | +0987654321 | Beta Corp  |
```

---

## STEP 10: Debugging

### Check Bull Dashboard (Optional)

```bash
npm install bull-board
```

Then add:

```javascript
const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [new BullAdapter(leadImportQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());
```

Visit: `http://localhost:5000/admin/queues` to see queue status

### Logs

Monitor logs in terminal:

```bash
✅ Processing job lead_import_1_1715861234567: leads.xlsx
Step 1: Parsing Excel file...
Parsed 1000 rows from Excel
Step 2: Validating lead data...
Validated 950 leads, 50 errors
Step 3: Checking for duplicates...
900 new leads (50 duplicates)
Step 4: Inserting leads into database...
✅ Inserted 900 leads
⏳ Job lead_import_1_1715861234567 progress: 100%
✅ Job lead_import_1_1715861234567 completed successfully
   Imported 900 leads
```

---

## TROUBLESHOOTING

| Problem                       | Solution                                                  |
| ----------------------------- | --------------------------------------------------------- |
| **Queue not processing jobs** | Check if Redis is running: `redis-cli ping`               |
| **File upload fails**         | Check file size < 10MB, format is .xlsx/.xls/.csv         |
| **Jobs stuck in "active"**    | Increase `lockDuration` in bulkLeadImportService.js       |
| **Memory issues**             | Use multer disk storage instead of memory for large files |
| **Email not sent**            | Implement email service in Step 6                         |

---

## Summary

✅ **What was created:**

1. `bulkLeadImportService.js` - Main service with Bull queue
2. `leadsRoutes_UPDATED.js` - Routes for upload, status, history
3. `001_create_import_jobs_table.sql` - Database table
4. This setup guide

✅ **What happens now:**

1. Admin uploads Excel → Job queued immediately (202 response)
2. Background worker processes independently
3. UI polls status → Shows progress bar
4. Job completes → Leads added to DB
5. Email notification (optional)

✅ **You can now:**

- Bulk import leads
- Track progress in real-time
- Handle retries automatically
- Scale with multiple workers
- Monitor in Bull dashboard

Good luck! 🚀
