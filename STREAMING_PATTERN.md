# Node.js Streaming Pattern - Complete Guide

## Problem We're Solving

**Scenario:** Insert 100 leads into database.

### ❌ BAD Approach (In-Memory, Old Way)

```javascript
function bulkInsertLeads() {
  const leads = []; // Generate ALL 100 in memory
  for (let i = 1; i <= 100; i++) {
    leads.push({ name: `Lead ${i}`, ... });
  }
  // Now all 100 are in RAM at once
  // Problem: With 1 MILLION leads = 500MB+ RAM used! 💥
}
```

### ✅ GOOD Approach (Streaming, New Way)

```javascript
// Read line-by-line, process in batches
// Only keep 50 in memory at a time
// Problem: With 1 MILLION leads = Only ~2MB RAM used! 🚀
```

---

## Three Key Node.js Functions

### 1️⃣ `fs.createWriteStream()` - Write to Disk Efficiently

**What it does:** Writes data to file line-by-line WITHOUT loading everything in memory.

```javascript
const fs = require("fs");

const stream = fs.createWriteStream("leads.json");

// Write 100 leads one at a time
for (let i = 1; i <= 100; i++) {
  const lead = {
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    status: "new",
    userId: 3,
  };

  // Write ONE lead per line (JSONL format)
  stream.write(JSON.stringify(lead) + "\n");
}

stream.end(); // Close the file
```

**Why use it?**

- ✅ Writes one object at a time (not all in memory)
- ✅ Fast for large datasets
- ✅ Doesn't block CPU while writing

**Output file format (JSONL = JSON Lines):**

```
{"name":"Lead 1","email":"lead1@example.com","status":"new","userId":3}
{"name":"Lead 2","email":"lead2@example.com","status":"new","userId":3}
{"name":"Lead 3","email":"lead3@example.com","status":"new","userId":3}
```

---

### 2️⃣ `fs.createReadStream()` - Read from Disk Efficiently

**What it does:** Reads file in chunks WITHOUT loading entire file into memory.

```javascript
const fs = require("fs");

const fileStream = fs.createReadStream("leads.json");

// Process each chunk as it's read
fileStream.on("data", (chunk) => {
  console.log("Got chunk:", chunk.toString());
});

fileStream.on("end", () => {
  console.log("File fully read!");
});
```

**Why use it?**

- ✅ Reads 64KB at a time (configurable)
- ✅ Perfect for HUGE files (1GB+)
- ✅ Doesn't wait for entire file to load

**Memory comparison:**

```
File size: 1GB

❌ fs.readFileSync() → Loads entire 1GB into RAM!
✅ fs.createReadStream() → Only ~64KB in RAM at once!
```

---

### 3️⃣ `readline.createInterface()` - Process Line by Line

**What it does:** Wraps `createReadStream()` and splits by lines automatically.

```javascript
const fs = require("fs");
const readline = require("readline");

const fileStream = fs.createReadStream("leads.json");
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity, // Handle both \n and \r\n
});

// Read ONE line at a time
for await (const line of rl) {
  console.log("Line:", line);

  const lead = JSON.parse(line);
  console.log("Parsed lead:", lead);
}
```

**Why use it?**

- ✅ Automatic line splitting (no manual parsing)
- ✅ Handles different line endings (\n vs \r\n)
- ✅ Works perfectly with JSONL format

---

## Our Complete Workflow

### Step 1: Generate & Write (generateLeads.js)

```javascript
const fs = require("fs");

const stream = fs.createWriteStream("leads.json");

for (let i = 1; i <= 100; i++) {
  const lead = {
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    userId: userIds[Math.floor(Math.random() * userIds.length)],
  };

  // Write one JSON object per line
  stream.write(JSON.stringify(lead) + "\n");
}

stream.end();
```

**Output:** `leads.json` (100 lines, ~10KB file)

---

### Step 2: Read, Batch & Insert (bulkInsertFromFile.js)

```javascript
const fs = require("fs");
const readline = require("readline");

const fileStream = fs.createReadStream("leads.json");
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

let batch = [];
let batchNumber = 0;

// Read line by line (streaming)
for await (const line of rl) {
  const lead = JSON.parse(line);

  // Add to batch
  batch.push([lead.name, lead.email, lead.status, lead.userId]);

  // When batch reaches 50, insert and clear
  if (batch.length >= 50) {
    await insertBatch(batch, ++batchNumber);
    batch = []; // Clear for next batch
  }
}

// Insert remaining
if (batch.length > 0) {
  await insertBatch(batch, ++batchNumber);
}
```

**Memory usage:**

- Only 50 leads in memory at a time
- File reading happens automatically (64KB chunks)
- Total RAM: < 5MB (even for 1 million leads!)

---

## Memory Comparison: In-Memory vs Streaming

### ❌ IN-MEMORY (Old Way)

```javascript
const leads = [];
for (let i = 0; i < 1000000; i++) {
  leads.push({
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    status: "new",
    userId: Math.random() * 3,
  });
}
// RAM USED: ~200MB (generating)
// RAM USED: ~200MB (inserting in batch)
// TOTAL: 200MB
```

### ✅ STREAMING (New Way)

```javascript
// generateLeads.js
const stream = fs.createWriteStream("leads.json");
for (let i = 0; i < 1000000; i++) {
  stream.write(JSON.stringify({...}) + "\n");
}
// RAM USED: ~1MB (write buffer)

// bulkInsertFromFile.js
const rl = readline.createInterface({ input: fileStream });
let batch = [];
for await (const line of rl) {
  batch.push([...]);
  if (batch.length >= 50) {
    await insertBatch(batch); // Insert 50
    batch = []; // Clear
  }
}
// RAM USED: ~2MB (50 records in memory)
// TOTAL: ~3MB for 1 MILLION leads! 🚀
```

---

## Why This Pattern is Used in Production

| Aspect                | In-Memory                    | Streaming                      |
| --------------------- | ---------------------------- | ------------------------------ |
| **RAM Usage**         | 200MB                        | 3MB                            |
| **Speed**             | Slower (waits for full data) | Faster (processes as it reads) |
| **File Size Limit**   | 100MB max                    | 100GB+ possible                |
| **CPU Spike**         | Yes (all at once)            | No (gradual)                   |
| **Database Load**     | Burst inserts                | Smooth batches                 |
| **Server Crash Risk** | High                         | Low                            |

---

## Key Takeaways

### When to Use Each

1. **`createWriteStream()`** - Generating/writing large files

   ```javascript
   // ✅ DO THIS
   const stream = fs.createWriteStream("huge_file.json");
   for (let i = 0; i < 1000000; i++) {
     stream.write(JSON.stringify(data[i]) + "\n");
   }
   ```

2. **`createReadStream()`** - Reading large files

   ```javascript
   // ✅ DO THIS (not fs.readFileSync)
   const stream = fs.createReadStream("huge_file.json");
   ```

3. **`readline.createInterface()`** - Processing line-by-line
   ```javascript
   // ✅ DO THIS (for JSONL, CSV, etc.)
   const rl = readline.createInterface({ input: stream });
   for await (const line of rl) {
     process(line);
   }
   ```

---

## Production Pattern (What We Built)

```
┌──────────────────────────────────┐
│  generateLeads.js                │
│  ├─ Generate lead objects        │
│  ├─ Use createWriteStream()      │
│  └─ Write to leads.json (JSONL)  │
└──────────────┬───────────────────┘
               │
               ↓ leads.json (100 lines, 10KB)
               │
┌──────────────▼───────────────────┐
│  bulkInsertFromFile.js           │
│  ├─ Read with createReadStream() │
│  ├─ Parse with readline          │
│  ├─ Batch 50 records            │
│  └─ Insert to database (50x2)   │
└──────────────┬───────────────────┘
               │
               ↓ Database
               │
      ✅ 100 leads inserted!
```

---

## Real-World Companies Using This

- **Netflix** - Processes terabytes of logs daily
- **Spotify** - Batch music metadata processing
- **Amazon** - S3 file uploads/processing
- **Google** - BigQuery data loading

All use streaming + batching for efficiency! 🚀
