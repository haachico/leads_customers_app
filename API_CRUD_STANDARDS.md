# API CRUD Standards Guide - Interview Ready

> **TL;DR**: Standard response format, HTTP methods, route patterns, and parameters for enterprise-grade CRUD APIs.

---

## 1. STANDARD RESPONSE STRUCTURE (ALL RESPONSES)

### Success Response (for all 2xx responses)

```json
{
  "success": true,
  "message": "Descriptive human-readable message",
  "statusCode": 200,
  "data": {
    // Actual resource or array of resources
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_abc123def456",
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "totalPages": 5
    }
  }
}
```

### Error Response (for all 4xx/5xx responses)

```json
{
  "success": false,
  "message": "Human-readable error message",
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "Email must be valid"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_abc123def456"
  }
}
```

### Key Points:

- ✅ **Always include**: `success`, `message`, `statusCode`, `meta.timestamp`, `meta.requestId`
- ✅ **Use `data` key** for resources (even if single item)
- ✅ **Use `error` key** for error details (not inside data)
- ✅ **Include timestamps** in ISO 8601 format
- ✅ **Request ID** for tracking and debugging

---

## 1.5 WHY REQUEST ID & TIMESTAMP? Real-World Scenarios

### 🔍 REQUEST ID - What & Why?

**What is it?** A **unique identifier** for EACH API request that helps you track and debug issues.

**Format:** `req_abc123def456` or `uuid-like: 550e8400-e29b-41d4-a716-446655440000`

**Real-World Scenario:**

```
Customer calls: "My user creation failed at 3:45 PM!"

WITHOUT Request ID:
Support: "Hmm, let me check logs..."
- 50 POST /api/v1/users requests at 3:45 PM
- Which one failed? No way to know!
- 😞 Can't help customer

WITH Request ID:
Customer: "It said error code 409 with request ID: req_xyz789"
Support: grep "req_xyz789" logs.txt
→ Instantly finds the exact request
→ Sees: Email "john@ex.com" already exists
→ Solves in 30 seconds
→ 😊 Customer happy
```

**Why it's essential:**

- ✅ **Debugging** - Find exact request in million log lines
- ✅ **Support** - Customer tells you request ID, you find problem instantly
- ✅ **Correlation** - Link frontend → backend → database → cache logs
- ✅ **Monitoring** - Track request flow through microservices
- ✅ **Legal** - Audit trail (who did what, when)

---

### ⏰ TIMESTAMP - What & Why?

**What is it?** The exact **moment when the server processed the response** (ISO 8601 format).

**Format:** `2026-05-16T10:30:45.123Z` (UTC timezone)

**Real-World Scenario #1 - Audit Trail:**

```
Boss asks: "When did John update his profile?"

WITHOUT Timestamp:
API Response: { success: true, data: { name: "John" } }
You: "Uh... no idea when" 😅

WITH Timestamp:
API Response: { success: true, data: { name: "John" }, meta: { timestamp: "2026-05-16T10:30:00Z" } }
You: "At 10:30 AM on May 16, 2026" ✅
```

**Real-World Scenario #2 - Debugging Race Conditions:**

```
Customer: "I created a user but it's not showing up!"

Backend logs:
[req_xyz] 10:30:00.000Z - User created successfully
[req_abc] 10:30:00.100Z - User fetched (but not in list!)

WITH Timestamp you see:
→ Created at 10:30:00.000Z
→ Fetched at 10:30:00.100Z
→ Only 100ms gap - database replication lag!
→ Problem: User created in master, fetched from old replica
```

**Why it's essential:**

- ✅ **Audit** - Know when things happened
- ✅ **Compliance** - Legal requirement for financial/health apps
- ✅ **Debugging** - Correlate with other timestamps (logs, emails, etc.)
- ✅ **Analytics** - "API was slow at 3:45 PM" → check logs at that time
- ✅ **Billing** - Accurate usage tracking ("user deleted on May 16")

---

### 💻 HOW TO IMPLEMENT REQUEST ID IN BACKEND (Node.js/Express)

**Method 1: Generate in Middleware (Recommended) with MySQL**

```javascript
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");

// Middleware to attach request ID to every request
app.use((req, res, next) => {
  // Check if frontend sent a request ID, otherwise generate one
  req.id = req.headers["x-request-id"] || `req_${uuidv4()}`;

  // Log with request ID for debugging
  console.log(`[${req.id}] ${req.method} ${req.path}`);

  // Attach to response headers so frontend can see it
  res.setHeader("X-Request-ID", req.id);

  next();
});

// In your route with MySQL
app.get("/api/v1/users/:id", async (req, res) => {
  let connection;
  try {
    console.log(`[${req.id}] Fetching user ${req.params.id}...`);

    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, email, role, createdAt, updatedAt FROM users WHERE id = ?",
      [req.params.id],
    );

    if (users.length === 0) {
      console.log(`[${req.id}] User not found`);
      return res.status(404).json({
        success: false,
        message: "User not found",
        statusCode: 404,
        error: { code: "RESOURCE_NOT_FOUND", details: null },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    }

    const user = users[0];
    console.log(`[${req.id}] User found:`, user.name);

    res.json({
      success: true,
      message: "User retrieved successfully",
      statusCode: 200,
      data: user,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  } catch (err) {
    console.error(`[${req.id}] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
      statusCode: 500,
      error: { code: "INTERNAL_ERROR", details: err.message },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**Method 2: Simple Request ID Generator (No UUID dependency)**

```javascript
// Generate simple request IDs
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || generateRequestId();
  res.setHeader("X-Request-ID", req.id);
  next();
});
```

**Method 3: Complete Response Helper with MySQL (Reusable)**

```javascript
const pool = require("../config/db");

// Helper to standardize responses with request ID
const sendResponse = (
  req,
  res,
  statusCode,
  success,
  message,
  data = null,
  error = null,
) => {
  const response = {
    success,
    message,
    statusCode,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
    },
  };

  if (data) response.data = data;
  if (error) response.error = error;

  res.status(statusCode).json(response);
};

// Usage in routes with MySQL
app.get("/api/v1/users/:id", async (req, res) => {
  let connection;
  try {
    console.log(`[${req.id}] Fetching user ${req.params.id}`);

    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, email, role, createdAt, updatedAt FROM users WHERE id = ?",
      [req.params.id],
    );

    if (users.length === 0) {
      console.log(`[${req.id}] User not found`);
      return sendResponse(req, res, 404, false, "User not found", null, {
        code: "RESOURCE_NOT_FOUND",
        details: null,
      });
    }

    const user = users[0];
    console.log(`[${req.id}] User found: ${user.name}`);

    sendResponse(req, res, 200, true, "User retrieved successfully", user);
  } catch (err) {
    console.error(`[${req.id}] Error:`, err.message);

    sendResponse(req, res, 500, false, "Server error", null, {
      code: "INTERNAL_ERROR",
      details: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**Log File Example (with request IDs):**

```
[req_1715876400000_a1b2c3d4e] GET /api/v1/users
[req_1715876400000_a1b2c3d4e] Fetching user 123
[req_1715876400000_a1b2c3d4e] User found: John Doe
[req_1715876400050_x9y8z7w6v] POST /api/v1/users
[req_1715876400050_x9y8z7w6v] Creating user with email: jane@example.com
[req_1715876400050_x9y8z7w6v] Email already exists - conflict
[req_1715876400050_x9y8z7w6v] Response: 409 DUPLICATE_RESOURCE
```

**Why logs are powerful:**

```bash
# Find all requests with an error
$ grep "req_abc123" app.log
[req_abc123] POST /api/v1/users
[req_abc123] Creating user...
[req_abc123] Email validation failed
[req_abc123] Response: 400 VALIDATION_ERROR

# Find requests that took too long
$ grep -E "\[req_[^]]+\].*took [5-9]|[0-9]{2,}" app.log

# Track user activity
$ grep "user_id:123" app.log | grep "req_"
```

---

### 🔄 Full Flow - Frontend → Backend → Response

**Frontend (sends request ID in header):**

```javascript
const requestId = `fe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

axios
  .get("/api/v1/users/123", {
    headers: {
      "X-Request-ID": requestId, // ← Frontend sends its ID
    },
  })
  .then((res) => {
    console.log("Response Request ID:", res.data.meta.requestId); // ← Backend echoes it back
    console.log("Timestamp:", res.data.meta.timestamp);
  });
```

**Backend (receives, processes, returns same ID):**

```
1. Frontend sends: X-Request-ID: fe_1715876400000_abc123
2. Backend middleware: req.id = 'fe_1715876400000_abc123'
3. Backend uses it in logs: [fe_1715876400000_abc123] Processing request
4. Backend returns in response: meta.requestId = 'fe_1715876400000_abc123'
5. Frontend sees same ID: Can correlate with logs!
```

---

| Item                   | Include?   | Why                                     |
| ---------------------- | ---------- | --------------------------------------- |
| `meta.requestId`       | **YES** ✅ | Production debugging, support           |
| `meta.timestamp`       | **YES** ✅ | Audit trail, legal compliance           |
| `data.createdAt`       | **YES** ✅ | When resource was created               |
| `data.updatedAt`       | **YES** ✅ | When resource was last modified         |
| `meta.clientRequestId` | OPTIONAL   | If frontend generated one, echo it back |

---

### 📝 COMPLETE RESPONSE WITH CONTEXT

```json
{
  "success": true,
  "message": "User created successfully",
  "statusCode": 201,
  "data": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T10:00:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:45Z",
    "requestId": "req_abc123def456"
  }
}
```

**What each timestamp means:**

- `data.createdAt` = Resource creation time (in database)
- `data.updatedAt` = Resource modification time (in database)
- `meta.timestamp` = API response time (when you got the response)

---

### 🎯 APPLIES TO ALL CRUD OPERATIONS

**This response structure is MANDATORY for:**

- ✅ **GET** (fetch single or list)
- ✅ **POST** (create)
- ✅ **PUT** (full update)
- ✅ **PATCH** (partial update)
- ✅ **DELETE** (delete)

**Same format for success AND error responses for every operation.**

---

## RESPONSE FORMAT FOR EACH CRUD OPERATION (ALL FOLLOW SAME STRUCTURE)

### GET (Fetch) - 200 OK

```json
{
  "success": true,
  "message": "User retrieved successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-16T10:00:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

### POST (Create) - 201 Created

```json
{
  "success": true,
  "message": "User created successfully",
  "statusCode": 201,
  "data": {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "createdAt": "2026-05-16T10:35:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:35:00Z",
    "requestId": "req_def456"
  }
}
```

### PUT (Full Update) - 200 OK

```json
{
  "success": true,
  "message": "User updated successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "John Smith",
    "email": "john.smith@example.com",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T10:40:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:40:00Z",
    "requestId": "req_ghi789"
  }
}
```

### PATCH (Partial Update) - 200 OK

```json
{
  "success": true,
  "message": "User updated successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "John Smith",
    "email": "john@example.com",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T10:45:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:45:00Z",
    "requestId": "req_jkl012"
  }
}
```

### DELETE - 200 OK or 204 No Content

```json
{
  "success": true,
  "message": "User deleted successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "message": "Deleted user with id: 1"
  },
  "meta": {
    "timestamp": "2026-05-16T10:50:00Z",
    "requestId": "req_mno345"
  }
}
```

### ERROR Response (400, 404, 409, etc.) - Same Structure

```json
{
  "success": false,
  "message": "Email already exists",
  "statusCode": 409,
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "details": {
      "field": "email",
      "value": "john@example.com"
    }
  },
  "meta": {
    "timestamp": "2026-05-16T10:55:00Z",
    "requestId": "req_pqr678"
  }
}
```

---

## 2. CRUD OPERATIONS - COMPLETE GUIDE

### 📖 READ Operations

#### 2.1 GET Single Resource

```
GET /api/v1/resource/{id}
```

**Path Parameters:**

- `id` (required) - Unique identifier

**Query Parameters (Optional):**

- `fields=id,name,email` - Select specific fields
- `populate=author` - Include related resources (relationships)

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T10:30:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_xyz789"
  }
}
```

**Error Response (404 Not Found):**

```json
{
  "success": false,
  "message": "Resource not found",
  "statusCode": 404,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "details": null
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_xyz789"
  }
}
```

---

#### 2.2 GET All Resources (List)

```
GET /api/v1/resources
```

**Query Parameters:**

- `page=1` (default: 1) - Page number
- `limit=10` (default: 10, max: 100) - Items per page
- `sort=name:asc` or `sort=-createdAt` (desc with -)
- `search=john` - Search term
- `filter[status]=active` - Filter by field
- `fields=id,name` - Select specific fields

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "statusCode": 200,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "createdAt": "2026-05-16T10:00:00Z",
      "updatedAt": "2026-05-16T10:30:00Z"
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "email": "jane@example.com",
      "createdAt": "2026-05-16T10:05:00Z",
      "updatedAt": "2026-05-16T10:25:00Z"
    }
  ],
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_abc123",
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### ✍️ CREATE Operations

#### 3.1 POST Single Resource

```
POST /api/v1/resources
```

**Headers Required:**

- `Content-Type: application/json`
- `Authorization: Bearer {token}` (if protected)

**Body Parameters (in JSON):**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user"
}
```

**Validation Rules:**

- All required fields must be present
- Type checking (string, number, etc.)
- Format validation (email, URL, etc.)
- Length constraints (min/max)

**Response (201 Created):**

```json
{
  "success": true,
  "message": "Resource created successfully",
  "statusCode": 201,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2026-05-16T10:30:00Z",
    "updatedAt": "2026-05-16T10:30:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_new123"
  }
}
```

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "message": "Validation failed",
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "Email must be valid format"
      },
      {
        "field": "name",
        "message": "Name is required"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_new123"
  }
}
```

**Error Response (409 Conflict - Duplicate):**

```json
{
  "success": false,
  "message": "Resource already exists",
  "statusCode": 409,
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "details": {
      "field": "email",
      "value": "john@example.com"
    }
  },
  "meta": {
    "timestamp": "2026-05-16T10:30:00Z",
    "requestId": "req_new123"
  }
}
```

---

### ✏️ UPDATE Operations

#### 🆚 PUT vs PATCH - Key Difference

**PUT = Replace ENTIRE resource (all fields required)**

```
PUT /api/v1/users/1
{
  "name": "Jane",
  "email": "jane@ex.com",
  "role": "admin"
}
→ REPLACES entire user. Missing fields are set to null/default
```

**PATCH = Update ONLY specified fields (partial)**

```
PATCH /api/v1/users/1
{
  "name": "Jane"
}
→ Only updates NAME. Email, role stay unchanged
```

**Real Example:**

```javascript
// Current user in database:
{
  id: 1,
  name: "John",
  email: "john@ex.com",
  role: "user"
}

// PUT request (replace everything)
PUT /api/v1/users/1
{
  "name": "Jane",
  "email": "jane@ex.com",
  "role": "admin"
}
// Result: name=Jane, email=jane@ex.com, role=admin ✅

// PATCH request (update only these fields)
PATCH /api/v1/users/1
{
  "name": "Jane"
}
// Result: name=Jane, email=john@ex.com (unchanged), role=user (unchanged) ✅
```

---

#### 🔄 Idempotency - What & Why?

**🧠 MEMORABLE DEFINITION:**

> **"Idempotent = Click button multiple times, get same result every time. Safe to retry."**

Think of it like **ATM withdrawal**:

- You click "Withdraw $100" → Machine gives $100, shows "200" balance
- Click again → Same machine state, balance still "200" (you don't get another $100)
- Click again → Still "200"
- **Safe to click multiple times without duplicating the action**

**Technical Definition:**
Idempotent = Same result AND same status code no matter how many times you call it

```
PUT /api/v1/users/1 { name: "Jane", email: "jane@ex.com", role: "admin" }
Call 1x → 200 OK, name="Jane", email="jane@ex.com" ✅
Call 2x → 200 OK, name="Jane", email="jane@ex.com" ✅
Call 3x → 200 OK, name="Jane", email="jane@ex.com" ✅
Same result + same status code every time = IDEMPOTENT
```

**NOT Idempotent** = Different result OR different status code each call

```
POST /api/v1/users { name: "Jane", email: "jane@ex.com" }
Call 1x → 201 Created, Creates user ID 1 ✅
Call 2x → 409 Conflict (different status!) ❌ (duplicate)
Call 3x → 409 Conflict (different status!) ❌ (duplicate)
Different status codes = NOT IDEMPOTENT
```

⚠️ **CRITICAL**: Even if duplicate checking prevents duplicates, **changing status code means it's NOT idempotent**

- Status code change = Different response = NOT idempotent
- Duplicate checking is a safety feature, NOT idempotency

---

#### 📊 PUT vs PATCH vs POST Comparison

| Aspect                 | PUT                       | PATCH                     | POST                |
| ---------------------- | ------------------------- | ------------------------- | ------------------- |
| **What**               | Replace entire resource   | Update some fields        | Create new resource |
| **Idempotent?**        | ✅ YES                    | ✅ YES                    | ❌ NO               |
| **Body**               | All fields required       | Only changed fields       | New data            |
| **Unspecified Fields** | Set to NULL/default       | Unchanged                 | N/A                 |
| **Request 2x**         | Same result + same status | Same result + same status | Different results   |
| **Use Case**           | Full replacement          | Partial update            | New creation        |

**⚠️ IMPORTANT**: Both PUT and PATCH are idempotent (same result), but PUT replaces everything while PATCH updates only specified fields

---

#### 🎯 Duplicate Checking vs Idempotency - KEY DIFFERENCE

**⚠️ THEY ARE NOT THE SAME!**

| Feature         | Duplicate Checking               | Idempotency                    |
| --------------- | -------------------------------- | ------------------------------ |
| **Purpose**     | Prevent duplicate data in DB     | Same result on retry           |
| **Status Code** | Returns 409 Conflict (DIFFERENT) | Returns SAME status code       |
| **Example**     | POST duplicate → 409             | PUT same data → 200 both times |
| **Idempotent?** | ❌ NO - status changes           | ✅ YES - status consistent     |

**Example:**

```
// POST with duplicate checking (NOT idempotent)
POST /api/v1/users { email: "john@ex.com" }
Call 1: 201 Created ✅
Call 2: 409 Conflict ❌ (status changed!)
Call 3: 409 Conflict ❌ (status changed!)
→ Status code changes = NOT IDEMPOTENT

// PUT without duplicates (IS idempotent)
PUT /api/v1/users/1 { name: "Jane", ... }
Call 1: 200 OK ✅
Call 2: 200 OK ✅ (same status)
Call 3: 200 OK ✅ (same status)
→ Status code consistent = IDEMPOTENT
```

**Key Takeaway:**

- **Duplicate checking** = Data safety feature (prevents bad data)
- **Idempotency** = Retry safety feature (network resilience)
- **POST is NOT idempotent** even with duplicate checking (status changes)
- **PUT and PATCH ARE idempotent** (same status code always)

---

#### ⚠️ Why Idempotency Matters

**Real scenario - Network issues:**

```
User clicks "Save Profile" button
↓
Network fails, user doesn't know
↓
User clicks again (retry)
↓
What happens?
```

**With PUT (Idempotent) - SAFE:**

```
PUT /api/v1/users/1 { name: "Jane", ... }
1st call: Saves Jane ✅
2nd call: Saves Jane (same) ✅
3rd call: Saves Jane (same) ✅
→ No duplicates, always correct
```

**With POST (Not Idempotent) - DANGEROUS:**

```
POST /api/v1/users { name: "Jane" }
1st call: Creates user Jane ✅
2nd call: Creates another user Jane (duplicate!) ❌
3rd call: Creates another user Jane (duplicate!) ❌
→ 3 different users created!
```

---

#### 🎯 When to Use What

**Use PUT when:**

- ✅ Sending complete resource data
- ✅ User is replacing entire object
- ✅ You want idempotency guarantee
- ✅ Example: Profile update with all fields

⚠️ **WARNING**: PUT replaces ALL fields. Fields NOT in request body will become NULL!

```javascript
// Endpoint: PUT /api/v1/users/:id
const user = {
  name: "John", // ALL fields
  email: "john@ex.com", // MUST provide all
  role: "admin", // fields to replace
  bio: "Developer", // entire object
};

// Database before: { name: "John", email: "john@ex.com", password: "encrypted", role: "admin" }
// PUT /api/v1/users/1 with ONLY { name: "Jane", email: "jane@ex.com" }
// Database after: { name: "Jane", email: "jane@ex.com", password: NULL, role: NULL }
// ❌ Password and role lost!
```

**Use PATCH when:**

- ✅ Sending only changed fields
- ✅ User is updating specific fields only
- ✅ Want lightweight requests (save bandwidth)
- ✅ Want to preserve fields not sent in request
- ✅ Example: Just update name, leave email alone

✅ **SAFE**: PATCH only updates fields you send, others are preserved

```javascript
// Endpoint: PATCH /api/v1/users/:id
const update = {
  name: "Jane", // Only THIS field
};

// Database before: { name: "John", email: "john@ex.com", password: "encrypted", role: "admin" }
// PATCH /api/v1/users/1 with { name: "Jane" }
// Database after: { name: "Jane", email: "john@ex.com", password: "encrypted", role: "admin" }
// ✅ Only name changed, everything else preserved!
```

**Use POST when:**

- ✅ Creating NEW resource
- ✅ Action-like operations (send email, generate report)
- ✅ NOT for idempotency needs

```javascript
// Endpoint: POST /api/v1/users
const newUser = {
  name: "Jane",
  email: "jane@ex.com",
};
// Creates brand new user with new ID
```

---

#### 💻 Code Examples

**PUT - Full Replacement:**

```javascript
app.put("/api/v1/users/:id", async (req, res) => {
  const { name, email, role } = req.body;

  // Validate ALL required fields
  if (!name || !email || !role) {
    return res.status(400).json({
      success: false,
      message: "All fields required",
      error: { code: "MISSING_FIELDS" },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // UPDATE everything (replace)
    await connection.query(
      "UPDATE users SET name = ?, email = ?, role = ?, updatedAt = NOW() WHERE id = ?",
      [name, email, role, req.params.id],
    );

    const [users] = await connection.query("SELECT * FROM users WHERE id = ?", [
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "User replaced successfully",
      statusCode: 200,
      data: users[0],
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**PATCH - Partial Update:**

```javascript
app.patch("/api/v1/users/:id", async (req, res) => {
  const updates = req.body;

  // No validation of ALL fields - only what's sent
  const allowedFields = ["name", "email", "role", "bio"];
  const updateFields = Object.keys(updates).filter((key) =>
    allowedFields.includes(key),
  );

  if (updateFields.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid fields to update",
      error: { code: "NO_UPDATE_FIELDS" },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // Build dynamic UPDATE query
    const setClause = updateFields.map((field) => `${field} = ?`).join(", ");
    const values = [
      ...updateFields.map((field) => updates[field]),
      req.params.id,
    ];

    // UPDATE only specified fields (partial)
    await connection.query(
      `UPDATE users SET ${setClause}, updatedAt = NOW() WHERE id = ?`,
      values,
    );

    const [users] = await connection.query("SELECT * FROM users WHERE id = ?", [
      req.params.id,
    ]);

    res.json({
      success: true,
      message: "User updated successfully",
      statusCode: 200,
      data: users[0],
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

---

#### ✅ Best Practice

| Scenario                       | Use   | Why                        |
| ------------------------------ | ----- | -------------------------- |
| Admin editing full profile     | PUT   | Replace everything         |
| User changing just password    | PATCH | Only update password       |
| Bulk update all fields         | PUT   | Simpler, idempotent        |
| User fixing typo in bio        | PATCH | Send only bio field        |
| Mobile app (limited bandwidth) | PATCH | Send only changed fields   |
| API with retry logic           | PUT   | Idempotency = safe retries |

---

#### 4.1 PUT Full Update (Replace entire resource)

```
PUT /api/v1/resources/{id}
```

**Path Parameters:**

- `id` (required) - Resource to update

**Body Parameters (ALL fields required):**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "admin"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Resource updated successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "admin",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T11:00:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T11:00:00Z",
    "requestId": "req_upd456"
  }
}
```

---

#### 4.2 PATCH Partial Update (Update only some fields)

```
PATCH /api/v1/resources/{id}
```

**Path Parameters:**

- `id` (required) - Resource to update

**Body Parameters (only fields being updated):**

```json
{
  "name": "Jane Doe"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Resource updated successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "name": "Jane Doe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2026-05-16T10:00:00Z",
    "updatedAt": "2026-05-16T11:00:00Z"
  },
  "meta": {
    "timestamp": "2026-05-16T11:00:00Z",
    "requestId": "req_upd456"
  }
}
```

**Error Response (404 Not Found):**

```json
{
  "success": false,
  "message": "Resource not found",
  "statusCode": 404,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "details": null
  },
  "meta": {
    "timestamp": "2026-05-16T11:00:00Z",
    "requestId": "req_upd456"
  }
}
```

---

### 🗑️ DELETE Operations

#### 5.1 DELETE Single Resource

```
DELETE /api/v1/resources/{id}
```

**Path Parameters:**

- `id` (required) - Resource to delete

**Query Parameters (Optional):**

- `force=true` - Force delete (skip soft delete)

**Response (200 OK or 204 No Content):**

**Option A - 200 with confirmation data:**

```json
{
  "success": true,
  "message": "Resource deleted successfully",
  "statusCode": 200,
  "data": {
    "id": 1,
    "message": "Deleted resource with id: 1"
  },
  "meta": {
    "timestamp": "2026-05-16T11:30:00Z",
    "requestId": "req_del789"
  }
}
```

**Option B - 204 No Content (preferred for REST purists):**

```
HTTP/1.1 204 No Content
```

**Error Response (404 Not Found):**

```json
{
  "success": false,
  "message": "Resource not found",
  "statusCode": 404,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "details": null
  },
  "meta": {
    "timestamp": "2026-05-16T11:30:00Z",
    "requestId": "req_del789"
  }
}
```

---

## 3. HTTP STATUS CODES - QUICK REFERENCE

| Code    | Name                 | Use Case                   | Example                       |
| ------- | -------------------- | -------------------------- | ----------------------------- |
| **200** | OK                   | GET, PUT, PATCH successful | Resource retrieved/updated    |
| **201** | Created              | POST successful            | Resource created with new ID  |
| **204** | No Content           | DELETE successful          | Soft delete, no response body |
| **400** | Bad Request          | Validation error           | Missing required field        |
| **401** | Unauthorized         | Missing/invalid auth       | No bearer token provided      |
| **403** | Forbidden            | Auth failed                | User lacks permission         |
| **404** | Not Found            | Resource missing           | ID doesn't exist              |
| **409** | Conflict             | Business logic violation   | Duplicate email               |
| **422** | Unprocessable Entity | Semantic error             | Logic error (optional)        |
| **429** | Too Many Requests    | Rate limit                 | Max 100 requests/min          |
| **500** | Server Error         | Internal error             | Database crash                |

---

## 4. PARAMETER PLACEMENT RULES

### ❌ WRONG - Do NOT mix them up

```
# WRONG: Filters in path
GET /api/v1/resources/page/1/limit/10

# WRONG: Resource ID in body
POST /api/v1/resources
Body: { "id": 1, "name": "John" }

# WRONG: Too much in path
DELETE /api/v1/resources/force/true/cascade/true
```

### ✅ CORRECT - Standard placement

| Type           | Where       | Example                                   |
| -------------- | ----------- | ----------------------------------------- |
| **Identity**   | Path        | `GET /api/v1/resources/123`               |
| **Filtering**  | Query       | `GET /api/v1/resources?status=active`     |
| **Pagination** | Query       | `GET /api/v1/resources?page=1&limit=10`   |
| **Sorting**    | Query       | `GET /api/v1/resources?sort=-createdAt`   |
| **Data**       | Body (JSON) | `POST /api/v1/resources` with JSON body   |
| **Options**    | Query       | `DELETE /api/v1/resources/123?force=true` |

---

## 5. COMPLETE EXAMPLE: USERS CRUD API

### Route Structure

```
GET    /api/v1/users              → List all users
GET    /api/v1/users/{id}         → Get single user
POST   /api/v1/users              → Create user
PUT    /api/v1/users/{id}         → Replace user
PATCH  /api/v1/users/{id}         → Update user
DELETE /api/v1/users/{id}         → Delete user
```

### Full Query Examples

```
# Get first 10 active users, sorted by name
GET /api/v1/users?page=1&limit=10&filter[status]=active&sort=name:asc

# Get specific fields only
GET /api/v1/users?fields=id,name,email

# Get user with related posts
GET /api/v1/users/123?populate=posts

# Search users
GET /api/v1/users?search=john&limit=20

# Combined complex query
GET /api/v1/users?page=2&limit=25&filter[role]=admin&sort=-createdAt&fields=id,name,email,role
```

---

## 6. INTERVIEW CHECKLIST - What Interviewers Look For

### API Design Section

- [ ] Understand difference between GET, POST, PUT, PATCH, DELETE
- [ ] Know correct HTTP status codes and when to use them
- [ ] Explain path params vs query params vs body params
- [ ] Standard response structure (success, data, meta, error)
- [ ] Error format with codes and details
- [ ] Pagination implementation (page, limit, total, hasNextPage)
- [ ] Request ID for tracking
- [ ] Timestamps in ISO 8601 format

### Validation & Security

- [ ] Input validation (type, format, length)
- [ ] Error codes for programmatic handling
- [ ] 400 for validation, 404 for missing, 409 for conflicts
- [ ] 401 for auth, 403 for permission
- [ ] Never expose internal IDs (\_id → id)
- [ ] Don't return sensitive data (passwords, tokens)

### Real-World Concerns

- [ ] Pagination to handle large datasets
- [ ] Sorting options
- [ ] Filtering capabilities
- [ ] Field selection (don't send unnecessary data)
- [ ] Soft delete consideration (archive instead of remove)
- [ ] Timestamp tracking (createdAt, updatedAt)
- [ ] Request ID for debugging

### Bonus Points

- [ ] API versioning (/v1/)
- [ ] Rate limiting mention
- [ ] CORS headers
- [ ] Idempotency keys for retries
- [ ] Request/response logging

---

## 7. COMMON MISTAKES - DON'T DO THESE

### ❌ Mistake #1: Wrong HTTP Methods

```javascript
// WRONG
app.post("/api/users/:id", updateUser); // Should be PUT/PATCH
app.post("/createUser", createUser); // "create" in URL is verb

// CORRECT
app.patch("/api/v1/users/:id", updateUser);
app.post("/api/v1/users", createUser);
```

### ❌ Mistake #2: Inconsistent Response Format

```json
// WRONG: Sometimes "data", sometimes "user", sometimes "result"
POST /api/users → { "user": {...} }
GET /api/users/1 → { "data": {...} }
DELETE /api/users/1 → { "result": {...} }

// CORRECT: Always "data" for resources
POST /api/users → { "success": true, "data": {...} }
GET /api/users/1 → { "success": true, "data": {...} }
```

### ❌ Mistake #3: Wrong Status Codes

```javascript
// WRONG
app.post("/api/users", (req, res) => {
  // Validation fails
  res.status(500).json({ error: "Email already exists" }); // 500?!
});

// CORRECT
app.post("/api/users", (req, res) => {
  // Validation fails
  res.status(400).json({ error: "Email already exists" }); // 400
  // OR if it's a duplicate
  res.status(409).json({ error: "Email already exists" }); // 409
});
```

### ❌ Mistake #4: Leaking Internal Data

```json
// WRONG
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",    // MongoDB ID
    "password": "$2b$10$encrypted",       // Password!
    "email": "john@ex.com",               // Could be private
    "internalNote": "VIP customer",       // Internal only
    "dbVersion": 3                        // Backend detail
  }
}

// CORRECT
{
  "success": true,
  "data": {
    "id": 123,                            // Clean ID
    "name": "John Doe",                   // Public info
    "email": "john@ex.com",               // OK if needed
    "role": "user",                       // Needed for auth
    "createdAt": "2026-05-16T10:00:00Z"  // Meta only
  }
}
```

### ❌ Mistake #5: No Pagination on GET All

```javascript
// WRONG
app.get("/api/users", async (req, res) => {
  // Fetches ALL 1 million users!
  const connection = await pool.getConnection();
  const [users] = await connection.query("SELECT * FROM users");
  connection.release();
  res.json({ data: users });
});

// CORRECT
app.get("/api/users", async (req, res) => {
  let connection;
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    connection = await pool.getConnection();

    // Get paginated users
    const [users] = await connection.query(
      "SELECT id, name, email, role, createdAt, updatedAt FROM users LIMIT ? OFFSET ?",
      [limit, offset],
    );

    // Get total count
    const [totalResult] = await connection.query(
      "SELECT COUNT(*) as total FROM users",
    );
    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: users,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

### ❌ Mistake #6: No Request ID Tracking

```json
// WRONG
{ "success": true, "data": {...} }

// CORRECT
{
  "success": true,
  "data": {...},
  "meta": {
    "requestId": "req_abc123def456",
    "timestamp": "2026-05-16T10:30:00Z"
  }
}
```

---

## 8. QUICK REFERENCE TABLE - All CRUD Methods

| Operation        | Method | URL                      | Body             | Query                             | Response           | Code    |
| ---------------- | ------ | ------------------------ | ---------------- | --------------------------------- | ------------------ | ------- |
| List             | GET    | `/api/v1/resources`      | ❌               | `page`, `limit`, `sort`, `filter` | Array + pagination | 200     |
| Get One          | GET    | `/api/v1/resources/{id}` | ❌               | `fields`, `populate`              | Single object      | 200     |
| Create           | POST   | `/api/v1/resources`      | ✅               | ❌                                | Created object     | 201     |
| Update (full)    | PUT    | `/api/v1/resources/{id}` | ✅ (all fields)  | ❌                                | Updated object     | 200     |
| Update (partial) | PATCH  | `/api/v1/resources/{id}` | ✅ (some fields) | ❌                                | Updated object     | 200     |
| Delete           | DELETE | `/api/v1/resources/{id}` | ❌               | `force`                           | Confirmation       | 200/204 |

---

## 8.5 HOW TO EXPLAIN IDEMPOTENCY IN INTERVIEW

**When asked: "What is idempotency?"**

**Your answer (30 seconds):**

> "Idempotency means if you call the same API multiple times with the same data, you get the same result every time. It's important for network resilience - if a request fails and you retry it, you don't accidentally create duplicates."

**Then give example (30 seconds):**

> "For example, PUT is idempotent - if I update a user's name to 'Jane' and call it 3 times, they'll be named Jane after all 3 calls. But POST is NOT idempotent - calling create user 3 times creates 3 different users. That's why PUT is safer for retries."

**Interview follow-up: "Why does status code matter?"**

> "Because idempotency is about consistency. If calling the same request returns different status codes (201 then 409), that's not idempotent. PUT/PATCH return the same 200 status code every time, so they're idempotent."

---

**Quick Cheat Sheet for Interview:**

| Method     | Idempotent? | Status Codes   | Safe to Retry? |
| ---------- | ----------- | -------------- | -------------- |
| **PUT**    | ✅ YES      | Always 200     | ✅ YES         |
| **PATCH**  | ✅ YES      | Always 200     | ✅ YES         |
| **POST**   | ❌ NO       | 201, then 409  | ❌ NO          |
| **GET**    | ✅ YES      | Always 200     | ✅ YES         |
| **DELETE** | ✅ YES      | Always 200/204 | ✅ YES         |

**Why?** PUT/PATCH/GET/DELETE replace or fetch data (idempotent), but POST creates new data (not idempotent)

---

## 9. INTERVIEW ANSWER TEMPLATE

### Question: "Design a CRUD API for blog posts"

**Your Answer Structure:**

```
1. **Route Design**
   - GET /api/v1/posts (list)
   - GET /api/v1/posts/{id} (get one)
   - POST /api/v1/posts (create)
   - PATCH /api/v1/posts/{id} (update)
   - DELETE /api/v1/posts/{id} (delete)

2. **Request Format**
   - Path params for identity: /posts/{id}
   - Query params for filters: ?page=1&limit=10&sort=-createdAt
   - Body for data: { title, content, tags }

3. **Response Structure**
   - Always: { success, message, statusCode, data, meta }
   - Meta includes: timestamp, requestId, pagination (if list)
   - Data field contains resource(s)

4. **Status Codes**
   - 200: GET/PUT/PATCH success
   - 201: POST success
   - 400: Validation error
   - 404: Not found
   - 409: Duplicate/conflict

5. **Validation**
   - Title: required, max 255 chars
   - Content: required, min 10 chars
   - Tags: optional, array of strings

6. **Special Features**
   - Pagination with hasNextPage flag
   - Request ID for debugging
   - ISO 8601 timestamps
   - Error codes for programmatic handling
```

---

## 10. SUMMARY - MEMORIZE THIS

### The Golden Rules:

1. **Use nouns in URLs** → `/posts` not `/createPost`
2. **HTTP methods are verbs** → POST create, GET read, PUT/PATCH update, DELETE delete
3. **Path params = identity** → `/posts/{id}`
4. **Query params = filters** → `?page=1&limit=10&sort=-date`
5. **Body = data** → POST/PUT/PATCH send JSON body
6. **Standard response** → `{ success, message, statusCode, data, meta, error }`
7. **Right status codes** → 201 created, 400 bad request, 404 not found, 409 conflict
8. **Always paginate lists** → Never return millions
9. **Include request ID** → For debugging and tracking
10. **Validate everything** → Type, format, length, duplicates

---

**Practice**: Take any resource (users, products, posts) and apply these rules. You'll master API design.
