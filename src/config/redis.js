const redis = require("redis");
require("dotenv").config();

let client = null;
let isConnected = false;

// Create Redis client
async function initRedis() {
  try {
    client = redis.createClient({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.warn("⚠️  Redis: Max reconnection attempts reached");
            return new Error("Max reconnection attempts");
          }
          return retries * 100;
        },
      },
    });

    client.on("connect", () => {
      console.log("✅ Redis connected successfully!");
      isConnected = true;
    });

    client.on("error", (err) => {
      console.warn(
        "⚠️  Redis connection error (running without cache):",
        err.code,
      );
      isConnected = false;
    });

    client.on("ready", () => {
      console.log("✅ Redis ready!");
    });

    await client.connect();
  } catch (error) {
    console.warn("⚠️  Redis not available, caching disabled:", error.code);
    isConnected = false;
  }
}

// Initialize on import
initRedis();

module.exports = {
  client,
  isConnected: () => isConnected,
};
