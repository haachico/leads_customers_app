# MERN Backend & Database Interview Guide - 2 Years Experience

> **Target Audience**: Mid-level developers (2 years MERN experience)
> **Focus**: Backend architecture, database design, performance optimization, real-world scenarios
> **Company Level**: Startups to Mid-cap companies (not FAANG-level)

---

## 📚 Table of Contents

1. [Backend Architecture Questions](#backend-architecture-questions)
2. [Database Design & Optimization](#database-design--optimization)
3. [Authentication & Security](#authentication--security)
4. [Performance & Scaling](#performance--scaling)
5. [Real-World Problem Solving](#real-world-problem-solving)
6. [API Design Patterns](#api-design-patterns)
7. [Error Handling & Debugging](#error-handling--debugging)
8. [Caching Strategies](#caching-strategies)
9. [Concurrency & Race Conditions](#concurrency--race-conditions)
10. [File & Data Management](#file--data-management)

---

## Backend Architecture Questions

### Q1: Design a social media feed system (like Twitter/Instagram)

**Scenario**: You need to show a user's feed with posts from people they follow. You have 100k users, each following ~50 people. How would you design this backend?

**Your Answer:**

**1. Database Design:**

```sql
-- Posts Table
CREATE TABLE posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  image_urls JSON,            -- JSON array of image URLs
  likes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- Follow Relationship
CREATE TABLE follows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_follow (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id),
  INDEX idx_follower (follower_id),
  INDEX idx_following (following_id)
);

-- Feed Cache (for performance)
CREATE TABLE feed_cache (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  post_ids JSON,              -- JSON array of post IDs
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INT DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id)
);
```

**2. API Endpoint:**

```javascript
app.get('/api/v1/feed', authMiddleware, async (req, res) => {
  let connection;
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    connection = await pool.getConnection();

    // Step 1: Get user's following list
    const [following] = await connection.query(
      'SELECT following_id FROM follows WHERE follower_id = ?',
      [userId]
    );

    const followingIds = following.map(f => f.following_id);
    followingIds.push(userId); // Include own posts

    // Step 2: Get paginated posts from following with user details (using JOIN)
    const [posts] = await connection.query(`
      SELECT
        p.id,
        p.user_id,
        p.content,
        p.image_urls,
        p.likes,
        p.created_at,
        p.updated_at,
        u.id as user_id,
        u.name,
        u.email,
        u.profile_image
      FROM posts p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.user_id IN (?)
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [followingIds, limit, offset]);

    // Step 3: Get like status for current user
    const postIds = posts.map(p => p.id);
    const [likedPosts] = await connection.query(
      'SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (?)',
      [userId, postIds]
    );

    const likedPostIds = new Set(likedPosts.map(l => l.post_id));

    // Step 4: Enrich posts with like status
    const enrichedPosts = posts.map(post => ({
      id: post.id,
      userId: post.user_id,
      content: post.content,
      imageUrls: post.image_urls ? JSON.parse(post.image_urls) : [],
      likes: post.likes,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      author: {
        id: post.user_id,
        name: post.name,
        email: post.email,
        profileImage: post.profile_image
      },
      isLikedByUser: likedPostIds.has(post.id),
      likeCount: post.likes
    }));

    res.json({
      success: true,
      message: "Feed retrieved",
      statusCode: 200,
      data: enrichedPosts,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
        pagination: {
          page,
          limit,
          hasMore: -.length === limit
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching feed",
      error: { code: "FEED_ERROR" }
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**3. Performance Optimizations:**

```javascript
// Cache layer with Redis
const cacheKey = `feed:${userId}:page:${page}`;
const cachedFeed = await redis.get(cacheKey);

if (cachedFeed) {
  return res.json({
    success: true,
    data: JSON.parse(cachedFeed),
    statusCode: 200,
    meta: { cached: true, requestId: req.id },
  });
}

// ... fetch from DB using SQL query above

// Cache for 5 minutes
await redis.setex(cacheKey, 300, JSON.stringify(enrichedPosts));
```

**4. Invalidation Strategy:**

```javascript
// When user posts something, invalidate all followers' cache
async function postCreated(userId) {
  let connection;
  try {
    connection = await pool.getConnection();

    // Get all followers using SQL
    const [followers] = await connection.query(
      "SELECT follower_id FROM follows WHERE following_id = ?",
      [userId],
    );

    // Invalidate their cache
    for (const follower of followers) {
      for (let page = 1; page <= 10; page++) {
        await redis.del(`feed:${follower.follower_id}:page:${page}`);
      }
    }
  } finally {
    if (connection) connection.release();
  }
}
```

**Key Points to Mention:**

- N+1 query problem solved with SQL JOINs
- Cache invalidation strategy
- Pagination efficiency with LIMIT/OFFSET
- Proper database indexes on foreign keys and sorting columns
- Index on (user_id, created_at DESC) for efficient sorting and filtering

---

### Q2: How would you handle user authentication and token management?

**Scenario**: Design an authentication system with access tokens and refresh tokens. How do you prevent token theft? What's your token refresh strategy?

**Your Answer:**

**1. JWT Structure with Refresh Tokens:**

```javascript
// Access Token (15 mins)
const accessToken = jwt.sign(
  {
    userId: user._id,
    email: user.email,
    role: user.role,
    type: "access",
  },
  process.env.JWT_SECRET,
  { expiresIn: "15m" },
);

// Refresh Token (7 days) - stored in HTTP-only cookie
const refreshToken = jwt.sign(
  {
    userId: user._id,
    type: "refresh",
    tokenVersion: user.tokenVersion, // For invalidation
  },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: "7d" },
);
```

**2. Login Endpoint:**

```javascript
app.post("/api/v1/auth/login", async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;

    // Validate email format
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required",
        error: { code: "MISSING_FIELDS" },
      });
    }

    connection = await pool.getConnection();

    // Find user
    const [users] = await connection.query(
      "SELECT id, email, password_hash, name, role FROM users WHERE email = ?",
      [email],
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        error: { code: "INVALID_CREDENTIALS" },
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        error: { code: "INVALID_CREDENTIALS" },
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.token_version },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );

    // Store refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Log login activity
    await connection.query(
      `
      INSERT INTO audit_logs (user_id, action, ip, user_agent, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `,
      [user.id, "LOGIN", req.ip, req.headers["user-agent"], new Date()],
    );

    res.json({
      success: true,
      message: "Login successful",
      statusCode: 200,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Login error",
      error: { code: "AUTH_ERROR" },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**3. Token Refresh Endpoint:**

```javascript
app.post("/api/v1/auth/refresh", async (req, res) => {
  let connection;
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
        error: { code: "NO_REFRESH_TOKEN" },
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    connection = await pool.getConnection();

    // Check if token version matches (to handle logout)
    const [users] = await connection.query(
      "SELECT id, email, role, token_version FROM users WHERE id = ?",
      [decoded.userId],
    );

    if (users.length === 0 || users[0].token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: "Refresh token invalid",
        error: { code: "INVALID_REFRESH_TOKEN" },
      });
    }

    const user = users[0];

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.json({
      success: true,
      message: "Token refreshed",
      statusCode: 200,
      data: { accessToken: newAccessToken },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Token refresh failed",
      error: { code: "REFRESH_ERROR" },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**4. Logout Endpoint (Invalidate Refresh Token):**

```javascript
app.post("/api/v1/auth/logout", authMiddleware, async (req, res) => {
  let connection;
  try {
    const userId = req.user.id;

    connection = await pool.getConnection();

    // Increment token_version to invalidate all refresh tokens
    await connection.query(
      "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
      [userId],
    );

    // Clear refresh token cookie
    res.clearCookie("refreshToken");

    res.json({
      success: true,
      message: "Logged out successfully",
      statusCode: 200,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Logout error",
      error: { code: "LOGOUT_ERROR" },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**5. Auth Middleware:**

```javascript
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
        error: { code: "NO_AUTH_HEADER" },
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.user.id = decoded.userId;

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Access token expired",
        error: { code: "TOKEN_EXPIRED" },
      });
    }

    res.status(401).json({
      success: false,
      message: "Invalid token",
      error: { code: "INVALID_TOKEN" },
    });
  }
};
```

**Key Points to Mention:**

- HTTP-only cookies for refresh tokens (secure against XSS)
- Access tokens short-lived (15 mins)
- Refresh tokens long-lived (7 days)
- Token version for instant logout
- Audit logging for security
- Password hashing with bcrypt
- CSRF protection consideration

---

## Database Design & Optimization

### Q3: You have a large dataset (millions of records). How do you structure it for efficient queries?

**Scenario**: Design a database for an e-commerce app with users, products, orders, and reviews. Millions of records. How do you optimize queries?

**Your Answer:**

**1. Schema Design with Proper Indexes:**

```sql
-- Users Table
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin', 'seller') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_created_at (created_at DESC)
);

-- Products Table
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100),
  seller_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FULLTEXT INDEX idx_fulltext_search (name, description),
  INDEX idx_category (category),
  INDEX idx_price (price),
  INDEX idx_seller (seller_id),
  INDEX idx_category_price (category, price)
);

-- Orders Table
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  status ENUM('pending', 'confirmed', 'shipped', 'delivered') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_status (status)
);

-- Reviews Table
CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_product_rating (product_id, rating),
  INDEX idx_user (user_id)
);
```

**2. Query Optimization - Slow Query Example:**

```javascript
// ❌ SLOW - N+1 Problem with multiple queries
app.get("/api/v1/products/:id/reviews", async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [reviews] = await connection.query(
      "SELECT * FROM reviews WHERE product_id = ?",
      [req.params.id],
    );

    // This queries user DB for EVERY review! N+1 problem
    for (let review of reviews) {
      const [user] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [review.user_id],
      );
      review.userDetails = user[0];
    }

    res.json(reviews);
  } finally {
    if (connection) connection.release();
  }
});

// ✅ FAST - Using SQL JOIN (single query)
app.get("/api/v1/products/:id/reviews", async (req, res) => {
  let connection;
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    connection = await pool.getConnection();

    // Single query with JOIN - much faster!
    const [reviews] = await connection.query(
      `
      SELECT 
        r.id,
        r.product_id,
        r.user_id,
        r.rating,
        r.comment,
        r.created_at,
        u.id as user_id,
        u.name,
        u.email,
        u.profile_image
      FROM reviews r
      INNER JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?

    `,
      [req.params.id, limit, offset],
    );

    // Transform to desired format
    const enrichedReviews = reviews.map((r) => ({
      id: r.id,
      productId: r.product_id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      userDetails: {
        id: r.user_id,
        name: r.name,
        email: r.email,
        profileImage: r.profile_image,
      },
    }));

    res.json({
      success: true,
      data: enrichedReviews,
      statusCode: 200,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
        pagination: { page, limit },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching reviews",
      error: { code: "REVIEW_ERROR" },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**3. Denormalization Strategy for Read-Heavy Data:**

```sql
-- Denormalized order with product snapshot
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  status ENUM('pending', 'confirmed', 'shipped') DEFAULT 'pending',
  -- Denormalized product snapshot
  product_snapshot JSON,  -- Contains {id, name, price, image, category}
  quantity INT NOT NULL,
  total_price DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- When product price changes, update in BOTH tables
async function updateProductPrice(productId, newPrice) {
  let connection;
  try {
    connection = await pool.getConnection();

    await connection.beginTransaction();

    // Update product
    await connection.query(
      'UPDATE products SET price = ? WHERE id = ?',
      [newPrice, productId]
    );

    // Update all open orders with this product (careful update!)
    await connection.query(`
      UPDATE orders
      SET product_snapshot = JSON_SET(
        product_snapshot,
        '$.price',
        ?
      )
      WHERE JSON_EXTRACT(product_snapshot, '$.id') = ?
      AND status IN ('pending', 'confirmed')
    `, [newPrice, productId]);

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    if (connection) connection.release();
  }
}
```

**4. Pagination with Large Datasets:**

```javascript
// ❌ SLOW - OFFSET method (scans all rows up to offset)
SELECT * FROM products OFFSET 1000000 LIMIT 10;  // Scans 1M+ rows!

// ✅ FAST - Cursor-based pagination with indexed column
app.get('/api/v1/products', async (req, res) => {
  let connection;
  try {
    const limit = 20;
    const cursor = req.query.cursor; // Last product's ID from previous page

    connection = await pool.getConnection();

    let query = 'SELECT * FROM products';
    let params = [];

    if (cursor) {
      // Get products AFTER this cursor ID
      query += ' WHERE id > ?';
      params.push(cursor);
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(limit + 1); // Get one extra to check if more exist

    const [products] = await connection.query(query, params);

    const hasMore = products.length > limit;
    if (hasMore) products.pop(); // Remove extra row

    res.json({
      success: true,
      data: products,
      statusCode: 200,
      meta: {
        hasMore,
        nextCursor: products[products.length - 1]?.id,
        requestId: req.id,
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**Key Points to Mention:**

- Proper indexing strategy (single, compound, fulltext)
- SQL JOINs vs multiple queries (solves N+1 problem)
- Query execution plan analysis (EXPLAIN)
- Index monitoring and optimization
- Denormalization for read-heavy workloads
- Cursor-based pagination for large datasets
- Batch operations when possible
- Connection pooling for efficiency

---

## Authentication & Security

### Q4: How would you prevent SQL injection, XSS, and CSRF attacks in your backend?

**Scenario**: Your app handles sensitive user data. What security measures do you implement?

**Your Answer:**

**1. SQL Injection Prevention (using parameterized queries):**

```javascript
// ❌ VULNERABLE - String concatenation (NEVER do this!)
app.get("/api/users/:id", async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    // DON'T DO THIS:
    const query = `SELECT * FROM users WHERE id = ${req.params.id}`;
    const [result] = await connection.query(query);
    // If id = "1; DROP TABLE users--" → Disaster!
  } finally {
    if (connection) connection.release();
  }
});

// ✅ SAFE - Using parameterized queries (Prepared Statements)
app.get("/api/v1/users/:id", async (req, res) => {
  let connection;
  try {
    const id = req.params.id;

    // MySQL prepared statement (safe from SQL injection)
    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, email FROM users WHERE id = ?",
      [id], // Parameter is automatically escaped
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: { code: "USER_NOT_FOUND" },
      });
    }

    res.json({
      success: true,
      data: user,
      statusCode: 200,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: { code: "SERVER_ERROR" },
    });
  }
});
```

**2. XSS Prevention (Input Sanitization):**

```javascript
const sanitizeHtml = require('sanitize-html');
const validator = require('validator');

// Middleware to sanitize input
app.use(express.json({ limit: '10mb' }));

app.post('/api/v1/posts', authMiddleware, async (req, res) => {
  try {
    let { content, title } = req.body;

    // Validate inputs
    if (!content || !title) {
      return res.status(400).json({
        success: false,
        message: "Title and content required",
        error: { code: "MISSING_FIELDS" }
      });
    }

    // Sanitize HTML (remove script tags, etc.)
    content = sanitizeHtml(content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'a'],
      allowedAttributes: { 'a': ['href'] }
    });

    title = validator.trim(title);
    title = validator.escape(title); // Escape HTML entities

    if (title.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Title too long",
        error: { code: "VALIDATION_ERROR" }
      });
    }

    let connection;
    try {
      connection = await pool.getConnection();

      const [result] = await connection.query(
        'INSERT INTO posts (user_id, title, content, created_at) VALUES (?, ?, ?, NOW())',
        [req.user.id, title, content]
      );

      res.json({
        success: true,
        message: "Post created",
        statusCode: 201,
        data: {
          id: result.insertId,
          title,
          content,
          userId: req.user.id,
          createdAt: new Date()
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() }
      });
    } finally {
      if (connection) connection.release();
    }
  }
});
```

**3. CSRF Protection (with tokens):**

```javascript
const csrf = require("csurf");
const cookieParser = require("cookie-parser");

app.use(cookieParser());
app.use(csrf({ cookie: true }));

// Get CSRF token endpoint
app.get("/api/v1/csrf-token", (req, res) => {
  res.json({
    success: true,
    data: { csrfToken: req.csrfToken() },
    meta: { requestId: req.id, timestamp: new Date().toISOString() },
  });
});

// Protected endpoints require CSRF token
app.post("/api/v1/posts", authMiddleware, async (req, res) => {
  // CSRF middleware automatically validates req.csrfToken()
  // in cookie matches X-CSRF-Token header

  const { content } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();

    const [result] = await connection.query(
      "INSERT INTO posts (user_id, content, created_at) VALUES (?, ?, NOW())",
      [req.user.id, content],
    );

    res.json({
      success: true,
      message: "Post created",
      statusCode: 201,
      data: {
        id: result.insertId,
        content,
        userId: req.user.id,
        createdAt: new Date(),
      },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**4. Rate Limiting:**

```javascript
const rateLimit = require("express-rate-limit");

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests, please try again later",
    error: { code: "RATE_LIMIT_EXCEEDED" },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 minutes
  skipSuccessfulRequests: true,
});

app.use("/api/", apiLimiter);
app.post("/api/v1/auth/login", loginLimiter, async (req, res) => {
  // ... login logic
});
```

**5. Security Headers:**

```javascript
const helmet = require("helmet");

// Add security headers
app.use(helmet());

// Additional CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    maxAge: 3600,
  }),
);

// Disable PoweredBy header
app.disable("x-powered-by");

// Content Security Policy
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
    },
  }),
);
```

**Key Points to Mention:**

- Input validation and sanitization
- Parameterized queries
- CSRF tokens
- Rate limiting
- Security headers (Helmet.js)
- HTTPS enforcement
- Password hashing
- HTTP-only cookies

---

## Performance & Scaling

### Q5: Your API is slow (50ms response time, should be <20ms). How do you debug and optimize?

**Scenario**: API performance is degrading as data grows. What's your approach?

**Your Answer:**

**1. Identify Performance Bottlenecks (Monitoring & Logging):**

```javascript
// Middleware to track API performance
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Log slow requests (>50ms)
    if (duration > 50) {
      console.warn({
        requestId: req.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        severity: duration > 100 ? "ERROR" : "WARN",
      });

      // Send to monitoring service
      monitor.recordMetric("api_response_time", duration, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      });
    }
  });

  next();
});
```

**2. Database Query Optimization:**

```javascript
// Step 1: Analyze slow queries
app.get("/api/v1/orders/:userId", async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Find execution plan
    const [explain] = await connection.query(
      "EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE user_id = ?",
      [req.params.userId],
    );

    console.log("Query Plan:", JSON.stringify(explain, null, 2));

    // Look for: "type": "ALL" (bad - full table scan)
    // vs "type": "range" or "ref" (good - uses index)
    const executionPlan = explain[0].EXPLAIN;

    if (executionPlan.query_block.table.type === "ALL") {
      console.error(
        "⚠️ Missing index on user_id! Performance will be slow.\n" +
          "CREATE INDEX idx_user_id ON orders(user_id, created_at DESC);",
      );
    }

    // Now execute the actual query (with index it's fast)
    const [orders] = await connection.query(
      `
      SELECT * FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [req.params.userId],
    );

    res.json({
      success: true,
      data: orders,
      statusCode: 200,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: { code: "ORDER_ERROR" },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**3. Enable Query Profiling:**

```sql
-- MySQL Query Profiling (development/staging only)
SET PROFILING = ON;

-- Run your slow query
SELECT * FROM orders WHERE user_id = 123;

-- View query profile
SHOW PROFILE;

-- View with detailed breakdown
SHOW PROFILE FOR QUERY 1;

-- Analyze slow log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- Log queries taking >1 second

-- Check slow queries
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;

-- Use EXPLAIN to analyze
EXPLAIN
  SELECT o.*, u.name, u.email
  FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE o.user_id = 123
  ORDER BY o.created_at DESC;

-- Look for these metrics:
-- - type: ALL (bad) vs ref/range (good)
-- - rows: Number scanned (should be low)
-- - Extra: "Using temporary", "Using filesort" (bad signs)
```

**4. Caching Layer:**

```javascript
const redis = require("redis");
const client = redis.createClient();

app.get("/api/v1/products/:id", async (req, res) => {
  try {
    const cacheKey = `product:${req.params.id}`;

    // Check cache first
    const cached = await client.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        statusCode: 200,
        meta: {
          requestId: req.id,
          cached: true,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Cache miss - fetch from DB
    let connection;
    try {
      connection = await pool.getConnection();

      const [products] = await connection.query(
        "SELECT id, name, price, stock FROM products WHERE id = ?",
        [req.params.id],
      );

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
          error: { code: "NOT_FOUND" },
        });
      }

      const product = products[0];

      // Cache for 1 hour
      await client.setex(cacheKey, 3600, JSON.stringify(product));

      res.json({
        success: true,
        data: product,
        statusCode: 200,
        meta: {
          requestId: req.id,
          cached: false,
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      if (connection) connection.release();
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching product",
      error: { code: "PRODUCT_ERROR" },
    });
  }
});
```

**5. Connection Pooling (MySQL-specific):**

```javascript
// SETUP: Connection pooling configuration
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, // Max connections in pool
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  dateStrings: true, // Return dates as strings
});

// Every route automatically uses a connection from the pool
app.get("/api/v1/users", async (req, res) => {
  let connection;
  try {
    // Gets connection from pool (reuses existing if available)
    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, email FROM users LIMIT 10",
    );

    res.json({ success: true, data: users });
  } finally {
    if (connection) connection.release(); // Return to pool
  }
});

// Connection pool benefits:
// - Eliminates connection creation overhead
// - Reuses TCP connections
// - Handles connection timeouts automatically
// - Queues requests when all connections busy
```

**Key Points to Mention:**

- Use `.lean()` for read-only queries (faster)
- Analyze query execution plans
- Create proper database indexes
- Implement caching layer (Redis)
- Use connection pooling
- Monitor slow queries
- Pagination for large datasets
- Batch operations when possible

---

## Real-World Problem Solving

### Q6: How would you handle file uploads? (Images, documents, CSV exports)

**Scenario**: Build file upload feature for user profile pictures and document uploads. Requirements: validation, security, scalability.

**Your Answer:**

**1. File Upload with Validation:**

```javascript
const multer = require("multer");
const path = require("path");
const sharp = require("sharp"); // Image optimization
const fs = require("fs").promises;

// Multer configuration
const storage = multer.memoryStorage(); // Store in RAM first

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error("Invalid file type. Only JPEG, PNG allowed"));
    }

    // Validate filename (prevent path traversal)
    if (file.originalname.includes("..") || file.originalname.includes("/")) {
      return cb(new Error("Invalid filename"));
    }

    cb(null, true);
  },
});

// Upload endpoint
app.post(
  "/api/v1/profile/picture",
  authMiddleware,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
          error: { code: "NO_FILE" },
        });
      }

      const userId = req.user.id;

      // Generate unique filename
      const filename = `profile_${userId}_${Date.now()}.webp`;
      const filepath = path.join(process.env.UPLOAD_DIR, "profiles", filename);

      // Optimize image with Sharp
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(400, 400, { fit: "cover" }) // Profile pic size
        .webp({ quality: 80 })
        .toBuffer();

      // Save to disk
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, optimizedBuffer);

      // Update user in DB
      let connection;
      try {
        connection = await pool.getConnection();

        const oldImagePath = (
          await connection.query(
            "SELECT profile_image_path FROM users WHERE id = ?",
            [userId],
          )
        )[0][0];

        await connection.query(
          "UPDATE users SET profile_image_path = ?, profile_image_url = ?, updated_at = NOW() WHERE id = ?",
          [filepath, `/uploads/profiles/${filename}`, userId],
        );

        // Delete old image
        if (oldImagePath?.profile_image_path) {
          try {
            await fs.unlink(oldImagePath.profile_image_path);
          } catch (err) {
            console.warn("Could not delete old image:", oldImagePath);
          }
        }
      } finally {
        if (connection) connection.release();
      }

      res.json({
        success: true,
        message: "Profile picture updated",
        statusCode: 200,
        data: {
          profileImageUrl: user.profileImageUrl,
          updatedAt: user.updatedAt,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error uploading file",
        error: { code: "UPLOAD_ERROR" },
      });
    }
  },
);
```

**2. Upload to Cloud Storage (Scalable):**

```javascript
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

app.post(
  "/api/v1/profile/picture",
  authMiddleware,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      // Optimize image
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize(400, 400, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();

      // Generate S3 key
      const s3Key = `profiles/${userId}/${Date.now()}.webp`;

      // Upload to S3
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: optimizedBuffer,
        ContentType: "image/webp",
        ACL: "public-read",
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      };

      const result = await s3.upload(params).promise();

      // Update user in DB
      let connection;
      try {
        connection = await pool.getConnection();

        await connection.query(
          "UPDATE users SET profile_image_url = ?, profile_image_s3_key = ?, updated_at = NOW() WHERE id = ?",
          [result.Location, s3Key, userId],
        );
      } finally {
        if (connection) connection.release();
      }

      res.json({
        success: true,
        message: "Profile picture updated",
        statusCode: 200,
        data: { profileImageUrl: result.Location },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error uploading file",
        error: { code: "S3_UPLOAD_ERROR" },
      });
    }
  },
);
```

**3. Signed URLs (Secure Download):**

```javascript
app.get(
  "/api/v1/files/:fileId/download-url",
  authMiddleware,
  async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();

      const [files] = await connection.query(
        "SELECT id, s3_key, user_id, is_public FROM files WHERE id = ?",
        [req.params.fileId],
      );

      if (!files.length) {
        return res.status(404).json({
          success: false,
          message: "File not found",
          error: { code: "FILE_NOT_FOUND" },
        });
      }

      const file = files[0];

      // Check permissions
      if (
        file.user_id !== req.user.id &&
        !file.is_public &&
        !req.user.isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
          error: { code: "FORBIDDEN" },
        });
      }

      // Generate signed URL (valid for 15 minutes)
      const signedUrl = s3.getSignedUrl("getObject", {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: file.s3Key,
        Expires: 15 * 60, // 15 minutes
      });

      res.json({
        success: true,
        data: { downloadUrl: signedUrl },
        statusCode: 200,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Error generating download URL",
        error: { code: "URL_ERROR" },
      });
    }
  },
);
```

**Key Points to Mention:**

- File type validation
- Size limits
- Image optimization with Sharp
- Cloud storage (S3) for scalability
- Signed URLs for secure downloads
- Filename sanitization
- Old file cleanup
- Error handling and logging

---

## API Design Patterns

### Q7: How do you version your APIs? Design an API versioning strategy.

**Your Answer:**

**1. URL-based versioning (recommended):**

```javascript
// /api/v1/users → Version 1
// /api/v2/users → Version 2 (breaking changes)

// v1 endpoints
app.get("/api/v1/users/:id", async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, email FROM users WHERE id = ?",
      [req.params.id],
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: { code: "NOT_FOUND" },
      });
    }

    const user = users[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email, // Include email in v1
      },
    });
  } finally {
    if (connection) connection.release();
  }
});

// v2 endpoints (different response format)
app.get("/api/v2/users/:id", async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [users] = await connection.query(
      "SELECT id, name, last_login, status FROM users WHERE id = ?",
      [req.params.id],
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: { code: "NOT_FOUND" },
      });
    }

    const user = users[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        // Email removed for privacy in v2
        // Added new fields
        lastLogin: user.last_login,
        status: user.status,
      },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**2. Header-based versioning (alternative):**

```javascript
app.get("/api/users/:id", (req, res) => {
  const apiVersion = req.headers["api-version"] || "1";

  if (apiVersion === "1") {
    // v1 logic
  } else if (apiVersion === "2") {
    // v2 logic
  }
});

// Client usage:
// GET /api/users/123
// Headers: { 'Api-Version': '2' }
```

**3. Deprecation strategy:**

```javascript
app.use((req, res, next) => {
  const apiVersion = req.path.match(/\/api\/v(\d+)\//)?.[1];

  if (apiVersion === "1") {
    // Add deprecation warning header
    res.setHeader("Deprecation", "true");
    res.setHeader(
      "Sunset",
      new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString(),
    ); // 6 months
    res.setHeader("Link", '</api/v2/docs>; rel="successor-version"');
  }

  next();
});
```

**Key Points to Mention:**

- URL versioning cleaner than header versioning
- Deprecation timeline and sunset headers
- Backward compatibility in v1
- Clear migration path for clients

---

## Error Handling & Debugging

### Q8: What's your error handling strategy? How do you handle unexpected errors?

**Your Answer:**

**1. Custom Error Classes:**

```javascript
class APIError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class NotFoundError extends APIError {
  constructor(message) {
    super(message, 404, "RESOURCE_NOT_FOUND");
  }
}

class UnauthorizedError extends APIError {
  constructor(message) {
    super(message, 401, "UNAUTHORIZED");
  }
}

class ConflictError extends APIError {
  constructor(message, details = null) {
    super(message, 409, "CONFLICT", details);
  }
}

module.exports = {
  APIError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
};
```

**2. Global Error Handler:**

```javascript
// Async wrapper to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage:
app.post(
  "/api/v1/users",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError("Email and password required");
    }

    let connection;
    try {
      connection = await pool.getConnection();

      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await connection.query(
        "INSERT INTO users (email, password, created_at) VALUES (?, ?, NOW())",
        [email, hashedPassword],
      );

      res.json({
        success: true,
        data: {
          id: result.insertId,
          email,
        },
      });
    } finally {
      if (connection) connection.release();
    }
  }),
);

// Global error middleware (must be last)
app.use((err, req, res, next) => {
  console.error({
    requestId: req.id,
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: `${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });

  // Handle known errors
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      statusCode: err.statusCode,
      error: {
        code: err.code,
        details: err.details,
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const details = Object.keys(err.errors).map((field) => ({
      field,
      message: err.errors[field].message,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      statusCode: 400,
      error: {
        code: "VALIDATION_ERROR",
        details,
      },
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    message: "Server error",
    statusCode: 500,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      details: process.env.NODE_ENV === "development" ? err.message : null,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});
```

**3. Logging System:**

```javascript
const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  defaultMeta: { service: "backend-api" },
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

// Usage:
app.post(
  "/api/v1/users",
  asyncHandler(async (req, res) => {
    logger.info("User creation started", {
      userId: req.user.id,
      requestId: req.id,
    });

    let connection;
    try {
      connection = await pool.getConnection();

      const [result] = await connection.query(
        "INSERT INTO users (email, name, password, created_at) VALUES (?, ?, ?, NOW())",
        [req.body.email, req.body.name, req.body.password],
      );

      logger.info("User created successfully", {
        userId: result.insertId,
        requestId: req.id,
      });

      res.json({
        success: true,
        data: {
          id: result.insertId,
          email: req.body.email,
          name: req.body.name,
        },
      });
    } finally {
      if (connection) connection.release();
    }
  }),
);
```

**Key Points to Mention:**

- Custom error classes for different scenarios
- Global error handler middleware
- Async error handling wrapper
- Structured logging
- Error tracking (Sentry)
- Different handling for development vs production

---

## Caching Strategies

### Q9: Design a caching strategy for your application. When to cache? When to invalidate?

**Your Answer:**

**1. Redis Caching Patterns:**

```javascript
const redis = require("redis");
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

// Cache-Aside Pattern (most common)
app.get("/api/v1/products/:id", async (req, res) => {
  let connection;
  try {
    const cacheKey = `product:${req.params.id}`;

    // Step 1: Check cache
    const cached = await client.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        meta: { cached: true, requestId: req.id },
      });
    }

    connection = await pool.getConnection();

    // Step 2: Cache miss - fetch from DB
    const [products] = await connection.query(
      "SELECT id, name, price, stock FROM products WHERE id = ?",
      [req.params.id],
    );

    if (!products.length) {
      throw new NotFoundError("Product not found");
    }

    const product = products[0];

    // Step 3: Store in cache
    await client.setex(cacheKey, 3600, JSON.stringify(product)); // 1 hour

    res.json({
      success: true,
      data: product,
      meta: { cached: false, requestId: req.id },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      error: { code: err.code },
    });
  } finally {
    if (connection) connection.release();
  }
});
```

**2. Cache Invalidation Strategies:**

```javascript
// Strategy 1: Time-based (TTL)
await redis.setex(`user:${userId}`, 1800, JSON.stringify(user)); // 30 mins

// Strategy 2: Event-based (update product → invalidate cache)
app.patch(
  "/api/v1/products/:id",
  asyncHandler(async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();

      const [result] = await connection.query(
        "UPDATE products SET ? WHERE id = ?",
        [req.body, req.params.id],
      );

      const [products] = await connection.query(
        "SELECT * FROM products WHERE id = ?",
        [req.params.id],
      );

      const product = products[0];

      // Invalidate cache
      const cacheKey = `product:${req.params.id}`;
      await redis.del(cacheKey);

      // Also invalidate related caches
      await redis.del(`product:category:${product.category}`);
      // Wildcard invalidation (KEYS command may be slow in production)
      const keys = await redis.keys(`products:search:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      res.json({ success: true, data: product });
    } finally {
      if (connection) connection.release();
    }
  }),
);

// Strategy 3: Tag-based invalidation
async function invalidateUserCache(userId) {
  const keys = await redis.keys(`user:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Usage:
app.post(
  "/api/v1/auth/logout",
  asyncHandler(async (req, res) => {
    await invalidateUserCache(req.user.id);
    res.json({ success: true, message: "Logged out" });
  }),
);
```

**3. Multi-layer Caching:**

```javascript
// Layer 1: Application memory (fast, but single instance)
const memoryCache = new Map();

// Layer 2: Redis (shared across instances)
// Layer 3: Database (slowest)

async function getProduct(productId) {
  // Check memory first
  if (memoryCache.has(`product:${productId}`)) {
    return memoryCache.get(`product:${productId}`);
  }

  // Check Redis
  const redisData = await redis.get(`product:${productId}`);
  if (redisData) {
    const product = JSON.parse(redisData);
    memoryCache.set(`product:${productId}`, product); // Store in memory too
    return product;
  }

  // Check DB
  let connection;
  try {
    connection = await pool.getConnection();
    const [products] = await connection.query(
      "SELECT id, name, price, stock FROM products WHERE id = ?",
      [productId],
    );

    if (!products.length) {
      return null;
    }

    const product = products[0];

    // Populate all caches
    memoryCache.set(`product:${productId}`, product);
    await redis.setex(`product:${productId}`, 3600, JSON.stringify(product));

    return product;
  } finally {
    if (connection) connection.release();
  }
}
```

**Key Points to Mention:**

- Cache-aside vs write-through vs write-behind patterns
- TTL for time-based expiration
- Event-based invalidation
- Multi-layer caching strategies
- Cache warming for important data
- Monitoring cache hit ratio

---

## Concurrency & Race Conditions

### Q10: How do you handle race conditions? (Two users updating same data simultaneously)

**Your Answer:**

**Scenario**: Two users try to purchase same product simultaneously. Stock = 1. Both should not succeed.

**1. Pessimistic Locking (Database lock):**

```javascript
// MySQL with transactions
app.post(
  "/api/v1/cart/checkout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();

      // Start transaction
      await connection.beginTransaction();

      const userId = req.user.id;
      const { productId, quantity } = req.body;

      // Lock row and fetch product
      const [products] = await connection.query(
        "SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE",
        [productId],
      );

      if (!products.length) {
        throw new NotFoundError("Product not found");
      }

      const product = products[0];

      // Check stock
      if (product.stock < quantity) {
        throw new ConflictError("Insufficient stock");
      }

      // Decrement stock
      await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [quantity, productId],
      );

      // Create order
      const [result] = await connection.query(
        "INSERT INTO orders (user_id, product_id, quantity, total_price, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [userId, productId, quantity, product.price * quantity, "confirmed"],
      );

      // Commit transaction
      await connection.commit();

      res.json({
        success: true,
        message: "Order created",
        statusCode: 201,
        data: {
          orderId: result.insertId,
          totalPrice: product.price * quantity,
        },
      });
    } catch (err) {
      // Rollback on error
      if (connection) await connection.rollback();
      throw err;
    } finally {
      if (connection) connection.release();
    }
  }),
);
```

**2. Optimistic Locking (Version field):**

```javascript
// Product table schema with version field
// CREATE TABLE products (
//   id INT PRIMARY KEY AUTO_INCREMENT,
//   name VARCHAR(255),
//   stock INT,
//   price DECIMAL(10, 2),
//   version INT DEFAULT 0,
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
// );

app.post(
  "/api/v1/cart/checkout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    let connection;
    try {
      connection = await pool.getConnection();

      const userId = req.user.id;
      const { productId, quantity, productVersion } = req.body;

      // Fetch product with current version
      const [products] = await connection.query(
        "SELECT id, name, price, stock, version FROM products WHERE id = ?",
        [productId],
      );

      if (!products.length) {
        throw new NotFoundError("Product not found");
      }

      const product = products[0];

      // Validate version matches
      if (product.version !== productVersion) {
        throw new ConflictError(
          "Product was updated by another user. Please refresh.",
        );
      }

      // Try to update only if version still matches
      const [updateResult] = await connection.query(
        "UPDATE products SET stock = stock - ?, version = version + 1 WHERE id = ? AND version = ?",
        [quantity, productId, productVersion],
      );

      // Check if update actually happened (affectedRows > 0)
      if (updateResult.affectedRows === 0) {
        throw new ConflictError("Product was updated. Please retry.");
      }

      // Fetch updated product
      const [updatedProducts] = await connection.query(
        "SELECT stock FROM products WHERE id = ?",
        [productId],
      );

      if (updatedProducts[0].stock < 0) {
        throw new ConflictError("Insufficient stock");
      }

      // Create order
      const [result] = await connection.query(
        "INSERT INTO orders (user_id, product_id, quantity, total_price, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [userId, productId, quantity, product.price * quantity, "confirmed"],
      );

      res.json({
        success: true,
        message: "Order created",
        statusCode: 201,
        data: {
          orderId: result.insertId,
          totalPrice: product.price * quantity,
        },
      });
    } finally {
      if (connection) connection.release();
    }
  }),
);
```

**3. Distributed Lock (for multiple servers):**

```javascript
const Redlock = require("redlock");

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
});

app.post(
  "/api/v1/cart/checkout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const lockKey = `checkout:${req.body.productId}`;

    let lock;
    let connection;
    try {
      // Acquire lock (max 1 second)
      lock = await redlock.lock(lockKey, 1000);

      connection = await pool.getConnection();

      const [products] = await connection.query(
        "SELECT id, stock, price FROM products WHERE id = ?",
        [req.body.productId],
      );

      if (!products.length) {
        throw new NotFoundError("Product not found");
      }

      if (products[0].stock < req.body.quantity) {
        throw new ConflictError("Insufficient stock");
      }

      // Safe to update
      await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [req.body.quantity, req.body.productId],
      );

      const [result] = await connection.query(
        "INSERT INTO orders (user_id, product_id, quantity, total_price, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [
          req.user.id,
          req.body.productId,
          req.body.quantity,
          products[0].price * req.body.quantity,
          "confirmed",
        ],
      );

      res.json({
        success: true,
        message: "Order created",
        statusCode: 201,
        data: {
          orderId: result.insertId,
        },
      });
    } catch (err) {
      throw err;
    } finally {
      // Release lock
      if (lock) await lock.unlock().catch((err) => console.error(err));
      if (connection) connection.release();
    }
  }),
);
```

**Key Points to Mention:**

- Transactions for ACID guarantees
- Optimistic locking with version fields
- Pessimistic locking with database locks
- Distributed locks for multi-instance scenarios
- Race condition testing strategies

---

## File & Data Management

### Q11: How do you handle large CSV/Excel file imports? (Processing performance & memory)

**Your Answer:**

```javascript
const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Large CSV import endpoint
app.post('/api/v1/bulk-import/products', authMiddleware, upload.single('csvFile'), asyncHandler(async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const userId = req.user.id;
    const fileId = `import_${userId}_${Date.now()}`;

    connection = await pool.getConnection();

    // Create job in background
    await connection.query(
      'INSERT INTO import_jobs (job_id, user_id, filename, status, total_records, processed_records, failed_records, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [fileId, userId, req.file.originalname, 'processing', 0, 0, 0]
    );

    // Return immediately
    res.json({
      success: true,
      message: "Import started",
      statusCode: 202, // Accepted
      data: { jobId: fileId },
      meta: { requestId: req.id }
    });

    // Process in background (don't wait)
    processLargeCSV(req.file.buffer, fileId, userId);

  } catch (err) {
    throw err;
  } finally {
    if (connection) connection.release();
  }
}));

// Background processing function
async function processLargeCSV(fileBuffer, jobId, userId) {
  let processedCount = 0;
  let failedCount = 0;
  const batchSize = 1000;
  let batch = [];
  const errors = [];

  try {
    const stream = Readable.from([fileBuffer]);

    stream
      .pipe(csv())
      .on('data', async (row) => {
        try {
          // Validate row
          if (!row.name || !row.price || isNaN(row.price)) {
            errors.push({ row: processedCount + 1, error: 'Invalid data' });
            failedCount++;
            return;
          }

          batch.push({
            name: row.name.trim(),
            price: parseFloat(row.price),
            category: row.category?.trim(),
            stock: parseInt(row.stock) || 0,
            userId,
            createdAt: new Date()
          });

          processedCount++;

          // Batch insert every 1000 records
          if (batch.length >= batchSize) {
            await batchInsertProducts(batch, jobId);
            failedCount = await updateJobProgress(jobId, processedCount, failedCount);
            batch = [];
          }
        } catch (err) {
          console.error('Row processing error:', err);
        }
      })

      .on('end', async () => {
        let connection;
        try {
          connection = await pool.getConnection();

          // Insert remaining batch
          if (batch.length > 0) {
            await batchInsertProducts(batch, jobId);
          }

          // Mark as completed
          await connection.query(
            'UPDATE import_jobs SET status = ?, processed_records = ?, failed_records = ?, completed_at = NOW(), errors = ? WHERE job_id = ?',
            ['completed', processedCount, failedCount, JSON.stringify(errors.slice(0, 100)), jobId]
          );
        } catch (err) {
          console.error('CSV processing error:', err);
          if (connection) {
            await connection.query(
              'UPDATE import_jobs SET status = ?, error_message = ? WHERE job_id = ?',
              ['failed', err.message, jobId]
            );
          }
        } finally {
          if (connection) connection.release();
        }
      });
  } catch (err) {
    console.error('CSV stream error:', err);
  }
}

// Helper: Batch insert products
async function batchInsertProducts(batch, jobId) {
  let connection;
  try {
    connection = await pool.getConnection();

    // Build multi-row INSERT query
    const values = batch.map(p => [p.name, p.price, p.category, p.stock, p.userId]);

    await connection.query(
      'INSERT INTO products (name, price, category, stock, user_id, created_at) VALUES ?',
      [values]
    );

    return 0; // No failures
  } catch (err) {
    console.error('Batch insert error:', err);
    return batch.length; // All rows failed
  } finally {
    if (connection) connection.release();
  }
}

// Helper: Update job progress
async function updateJobProgress(jobId, processed, failed) {
  let connection;
  try {
    connection = await pool.getConnection();

    await connection.query(
      'UPDATE import_jobs SET processed_records = ?, failed_records = ? WHERE job_id = ?',
      [processed, failed, jobId]
    );

    return 0;
  } finally {
    if (connection) connection.release();
  }
}

          console.log(`Import ${jobId} completed:`, {
            total: processedCount,
            failed: failedCount
          });
        } catch (err) {
          console.error('Import completion error:', err);
        }
      })

      .on('error', async (err) => {
        let connection;
        try {
          connection = await pool.getConnection();

          await connection.query(
            'UPDATE import_jobs SET status = ?, error_message = ? WHERE job_id = ?',
            ['failed', err.message, jobId]
          );
        } finally {
          if (connection) connection.release();
        }
      });

  } catch (err) {
    console.error('CSV processing error:', err);
    let connection;
    try {
      connection = await pool.getConnection();

      await connection.query(
        'UPDATE import_jobs SET status = ?, error_message = ? WHERE job_id = ?',
        ['failed', err.message, jobId]
      );
    } finally {
      if (connection) connection.release();
    }
  }
}

// Check import status endpoint
app.get('/api/v1/bulk-import/:jobId', authMiddleware, asyncHandler(async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [jobs] = await connection.query(
      'SELECT * FROM import_jobs WHERE job_id = ? AND user_id = ?',
      [req.params.jobId, req.user.id]  // Security: only creator can view
    );

    if (!jobs.length) {
      throw new NotFoundError('Job not found');
    }

    const job = jobs[0];

    res.json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      progress: `${job.processedRecords} / ${job.totalRecords || '?'}`,
      processed: job.processedRecords,
      failed: job.failedRecords,
      errors: job.errors,
      completedAt: job.completedAt
    }
  });
}));
```

**Key Points to Mention:**

- Stream processing for memory efficiency
- Batch inserts for performance
- Background job processing
- Error handling and logging
- Progress tracking
- Validation before insertion
- Rollback strategies

---

## 🎯 Interview Tips & Common Mistakes

### What Interviewers Look For:

✅ **Good Signs:**

- Asks clarifying questions about requirements
- Discusses trade-offs (speed vs memory, simplicity vs flexibility)
- Mentions testing and monitoring
- Considers security from start
- Thinks about scalability
- Uses proper error handling
- Talks about caching and optimization

❌ **Red Flags:**

- Writes code without thinking about performance
- Ignores security concerns
- No error handling
- Doesn't consider edge cases
- Can't explain trade-offs
- Over-engineers simple problems
- No testing strategy mentioned

---

## 💡 Common Interview Questions Summary Table

| Topic               | Frequency  | Key Points                                                |
| ------------------- | ---------- | --------------------------------------------------------- |
| **Authentication**  | ⭐⭐⭐⭐⭐ | JWT, refresh tokens, session vs token, security           |
| **Database Design** | ⭐⭐⭐⭐⭐ | Indexes, query optimization, N+1 problem, denormalization |
| **Caching**         | ⭐⭐⭐⭐   | Redis, invalidation strategies, cache-aside pattern       |
| **API Design**      | ⭐⭐⭐⭐   | Status codes, error handling, versioning, pagination      |
| **File Uploads**    | ⭐⭐⭐     | Validation, S3, image optimization, security              |
| **Race Conditions** | ⭐⭐⭐     | Transactions, locks, atomicity                            |
| **Scaling**         | ⭐⭐⭐     | Connection pooling, horizontal scaling, monitoring        |
| **Security**        | ⭐⭐⭐⭐⭐ | Input validation, XSS, CSRF, SQL injection, HTTPS         |

---

## 📝 Practice Template for Each Question

**When asked a backend question, follow this structure:**

1. **Clarify Requirements** (1 min)
   - What's the scale? (users, data volume)
   - What are the constraints? (latency, cost)
   - Any specific tech stack?

2. **High-Level Design** (2 mins)
   - Database schema
   - API endpoints
   - Caching strategy
   - Authentication method

3. **Deep Dive** (3-4 mins)
   - Code implementation
   - Edge cases
   - Error handling
   - Performance considerations

4. **Optimization & Trade-offs** (1 min)
   - Why this approach?
   - What would change at 10x scale?
   - Alternative approaches?

---

## 🎓 Quick Revision Guide - Critical Topics

### Handling 1 Million Records

**Decision Tree (Pick SQL or NoSQL based on):**

```
ACID required? → YES → SQL ✅
Fixed schema? → YES → SQL ✅
Many relationships? → YES → SQL ✅
Unstructured data? → YES → NoSQL ✅
Extreme scalability? → YES → NoSQL ✅
```

**Optimization Checklist (What to mention):**

- ✅ Pagination (cursor-based, not OFFSET)
- ✅ Indexes on filter/sort columns
- ✅ SQL JOINs (prevent N+1 queries)
- ✅ Connection pooling (reuse connections)
- ✅ Query optimization (use EXPLAIN)
- ✅ Redis caching (TTL-based)
- ✅ Batch operations (insert 1000 at once)
- ✅ Denormalization (for read-heavy data)
- ✅ Sharding (for extreme scale, 10M+)

**Code Example:**

```javascript
// Connection pooling
const pool = mysql.createPool({
  connectionLimit: 10,  // Reuse connections
  waitForConnections: true,
});

// Cursor pagination (not OFFSET)
SELECT * FROM posts WHERE id > ? ORDER BY id LIMIT 20;

// SQL JOIN (not N+1)
SELECT p.*, u.name FROM posts p
INNER JOIN users u ON p.user_id = u.id
WHERE p.user_id IN (?);

// Batch insert
INSERT INTO users (name, email) VALUES (?, ?), (?, ?), ...;

// EXPLAIN to verify index usage
EXPLAIN SELECT * FROM posts WHERE user_id = ?;
```

---

### Security Essentials (Interview Answer)

**What to Say:**

```
"For security, I implement:

1. Parameterized Queries - Prevent SQL injection
   SELECT * FROM users WHERE id = ?;

2. Input Validation & Sanitization - Prevent XSS
   validator.trim(), sanitizeHtml()

3. Rate Limiting - Prevent brute force & DoS
   max: 5 attempts per 15 minutes for login

4. CORS - Control which origins can access
   origin: process.env.FRONTEND_URL

5. CSRF Protection - Token validation
   app.use(csrf({ cookie: true }));

6. Helmet - Security headers
   X-Content-Type-Options, X-Frame-Options, CSP

7. HTTPS + Secure Cookies
   httpOnly: true, secure: true, sameSite: 'strict'

8. JWT Authentication - Token-based auth
   Access token: 15 mins, Refresh: 7 days

9. Error Handling - Don't leak sensitive data
   Log details privately, show generic errors

10. Password Hashing - bcrypt with salt
    bcrypt.hash(password, 10)

11. Environment Variables - Secrets not in code
    .env file for API keys, DB credentials

12. Logging & Monitoring - Track suspicious activity
    logger.info('User login', {userId, ip, timestamp})
"
```

**Code Example:**

```javascript
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");

const app = express();

// 1. Trust proxy
app.set("trust proxy", 1);

// 2. Helmet security headers
app.use(helmet());

// 3. CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

// 4. Body parser with size limit
app.use(express.json({ limit: "10mb" }));

// 5. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,
});
app.use("/api/", limiter);

// 6. CSRF protection
app.use(cookieParser());
app.use(csrf({ cookie: true }));

// 7. Parameterized queries
const [users] = await connection.query(
  "SELECT * FROM users WHERE id = ?",
  [id], // Safe - parameter is escaped
);

// 8. Error handling
app.use((err, req, res, next) => {
  logger.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    // Don't expose details!
  });
});
```

---

### Interview Score Tracker

| Topic                | Your Score | Target | Gap                                   |
| -------------------- | ---------- | ------ | ------------------------------------- |
| **1M Data Handling** | 6/10       | 9/10   | +Connection pooling, JOINs, EXPLAIN   |
| **Security**         | 5/10       | 9/10   | +Rate limiting, CSRF, error handling  |
| **Authentication**   | 7/10       | 9/10   | +Token versioning, audit logs         |
| **Caching**          | 6/10       | 8/10   | +Multi-layer caching, invalidation    |
| **API Design**       | 5/10       | 8/10   | +Versioning, status codes, pagination |

**To improve to 8/10:** Mention all items in checklist, not just basics.

---

**Good Luck with your MERN interviews! 🚀**

Remember: Interviewers want to see your thinking process more than perfect code. Communicate clearly, ask questions, and explain your trade-offs.
