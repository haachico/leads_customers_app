# Visual Breakdown: What Each Function Does

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    STREAMING ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────┘

PHASE 1: GENERATE & WRITE (generateLeads.js)
═══════════════════════════════════════════════════════════════

┌─────────────────────┐
│ In Memory           │ RAM: ~1MB
│ ─────────────────   │
│ for loop (100x)     │ Generates ONE lead
│ ├─ Lead 1           │ ├─ Writes to disk
│ ├─ Lead 2           │ ├─ Clears from RAM
│ ├─ Lead 3           │ └─ Repeats
│ └─ ...              │
└─────────────────────┘
         │
         │ stream.write(JSON.stringify(lead) + "\n")
         │
         ↓
┌─────────────────────────────────────────┐
│ leads.json (JSONL Format)               │ Disk: ~10KB
│ ────────────────────────────────────────│
│ {"name":"Lead 1"...}\n                  │ Line 1
│ {"name":"Lead 2"...}\n                  │ Line 2
│ {"name":"Lead 3"...}\n                  │ Line 3
│ {"name":"Lead 4"...}\n                  │ ...
│ {"name":"Lead 5"...}\n                  │ Line 100
└─────────────────────────────────────────┘


PHASE 2: READ, BATCH & INSERT (bulkInsertFromFile.js)
═══════════════════════════════════════════════════════════════

Disk                    Streaming               In Memory       Database
─────────────────────────────────────────────────────────────────────────

leads.json          fs.createReadStream()   readline.createInterface()
┌─────────────────┐     (64KB chunks)            (line-by-line)
│ Line 1          │            │                      │
│ Line 2          ◄────────────┤           ┌──────────┤
│ Line 3          │            │           │          │
│ ...             │            ├──────────►│ batch[1] │
│ Line 50         │            │           │ batch[2] │
│ ...             │            │           └──────────┘
│ Line 51         ◄────────────┤                  │
│ Line 52         │            │                  │ insertBatch()
│ ...             │            │                  ▼
│ Line 100        │            │           ┌──────────────┐
└─────────────────┘            │           │ MySQL        │
                               │           │ Batch insert │
                    Repeat ─────┘           │ 50 records   │
                                            └──────────────┘


MEMORY SNAPSHOT AT ANY MOMENT
═══════════════════════════════════════════════════════════════

Phase 1: Generating
┌─────────────────────┐
│ RAM: ~1MB           │
│ ─────────────────   │
│ Current lead obj    │ Only 1 in RAM
│ Write stream buffer │ at a time!
└─────────────────────┘

Phase 2: Reading & Inserting (Batch size = 50)
┌─────────────────────┐
│ RAM: ~2MB           │
│ ─────────────────   │
│ Read stream buffer  │ Only 50 leads
│ batch[] (50 items)  │ in memory
│ readline interface  │ at a time!
└─────────────────────┘
```

---

## Function-by-Function Explanation

### fs.createWriteStream()

```javascript
const stream = fs.createWriteStream("leads.json");

// What's happening UNDER THE HOOD:
// ├─ Opens file descriptor to leads.json
// ├─ Creates internal buffer (16KB default)
// ├─ Ready to accept writes
// └─ Doesn't wait for previous write to complete

// When you call: stream.write(data)
// ├─ Data goes to internal buffer
// ├─ When buffer reaches 16KB, flushes to disk
// ├─ Continues accepting writes immediately
// └─ No blocking!
```

**Timeline Example:**

```
Time  Action
────  ────────────────────────────────────
0ms   write(Lead 1) → buffer [1]
1ms   write(Lead 2) → buffer [1,2]
2ms   write(Lead 3) → buffer [1,2,3]
...
15ms  buffer full → FLUSH to disk
16ms  write(Lead 20) → buffer [20]
...
30ms  FLUSH to disk again
```

---

### fs.createReadStream()

```javascript
const stream = fs.createReadStream("leads.json");

// What's happening UNDER THE HOOD:
// ├─ Opens file descriptor
// ├─ Reads in 64KB chunks by default
// ├─ Emits 'data' event when chunk ready
// ├─ Keeps reading next chunks
// └─ Emits 'end' event when done

// Memory usage with 100MB file:
// ├─ Only 64KB in memory at once
// ├─ Rest stays on disk
// └─ Total process RAM: ~70MB (safe!)
```

**Timeline Example (100MB file):**

```
Time   Disk Read         RAM Status          Event
─────  ─────────────────────────────────────────────
0ms    Reading 0-64KB    Empty
100ms  64KB ready        [64KB data]         emit('data', chunk1)
200ms  Reading 64-128KB  [64KB data]
300ms  128KB ready       [64KB data]         emit('data', chunk2)
...
       (repeats ~1500 times)
```

---

### readline.createInterface()

```javascript
const rl = readline.createInterface({
  input: fs.createReadStream("leads.json"),
  crlfDelay: Infinity,
});

// What's happening UNDER THE HOOD:
// ├─ Wraps createReadStream()
// ├─ Buffers incoming chunks
// ├─ Looks for '\n' (newline) character
// ├─ When found, emits complete line
// ├─ Handles both \n and \r\n formats
// └─ Repeats for each chunk

// For each chunk received from stream:
chunk = "Line1\nLine2\nLine3\n"
                │       │       │
                ├──────┘       └──────┐
                ▼                     ▼
              emit('line', 'Line1')
              emit('line', 'Line2')
              emit('line', 'Line3')
```

**Timeline Example (JSONL file):**

```
Raw Stream Data:
{"name":"Lead1"...}\n{"name":"Lead2"...}\n

readline processes:
Event 1: line = '{"name":"Lead1"...}'
Event 2: line = '{"name":"Lead2"...}'

Your code:
for await (const line of rl) {
  // line = '{"name":"Lead1"...}'  then
  // line = '{"name":"Lead2"...}'  then
  // ...
}
```

---

## Actual Code Flow in Our Script

```javascript
// ====== FILE: generateLeads.js ======
const stream = fs.createWriteStream("leads.json");
const statuses = ["new", "in-progress", "converted"];
const userIds = [3, 4, 5];

for (let i = 1; i <= 100; i++) {
  const lead = {
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    userId: userIds[Math.floor(Math.random() * userIds.length)],
  };

  // This DOESN'T block - writes to buffer, continues immediately
  stream.write(JSON.stringify(lead) + "\n");
}

stream.end(); // Flush remaining data and close

// ====== FILE: bulkInsertFromFile.js ======
const fileStream = fs.createReadStream("leads.json");
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity,
});

let batch = [];
let batchNumber = 0;

// for await iterates as readline emits lines
for await (const line of rl) {
  const lead = JSON.parse(line); // Parse JSON

  batch.push([lead.name, lead.email, lead.status, lead.userId]);

  // When we have 50 records, insert them
  if (batch.length >= 50) {
    await insertBatch(batch, ++batchNumber);
    batch = []; // Clear for next batch
  }
}

// Insert remaining records
if (batch.length > 0) {
  await insertBatch(batch, ++batchNumber);
}

// insertBatch() actually inserts to database
async function insertBatch(batch, batchNumber) {
  const placeholders = batch.map(() => "(?, ?, ?, ?)").join(",");
  const values = batch.flat();
  const sql = `INSERT INTO leads (...) VALUES ${placeholders}`;
  await pool.execute(sql, values);
}
```

---

## Why This Matters for Interviews

**Interviewer Question:** "How would you handle inserting 1 million records?"

**Bad Answer:** "Loop and insert one by one" ❌

- Takes forever
- Database crashes
- Not scalable

**Good Answer:** "Streaming + batching" ✅

- Read file in chunks
- Batch inserts (50-100 per query)
- Minimal memory usage
- Shows you understand production patterns

**Your Answer (Now):**
"I use `createReadStream()` for memory efficiency, `readline` to parse line-by-line, and batch inserts in groups of 50. This way, only 50 records are in RAM at once, and we smooth out database load instead of spiking it."

💯 **Interview Gold!**

---

## See It In Action

Run these commands:

```bash
# Generate 100 leads to file
node scripts/generateLeads.js

# Check file
cat scripts/leads.json | head -3

# Read and batch insert
node scripts/bulkInsertFromFile.js

# Verify in database
node scripts/checkUsers.js
```

You've now implemented a **production-grade data pipeline**! 🚀
