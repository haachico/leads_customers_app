const redisConfig = require("../config/redis");

// Cache utility functions
const cacheUtil = {
  // Generate cache key
  generateKey: (type, ...params) => {
    return `${type}:${params.join(":")}`;
  },

  // Get from cache
  get: async (key) => {
    try {
      if (!redisConfig.isConnected()) {
        return null; // Redis not available
      }

      const data = await redisConfig.client.get(key);
      if (data) {
        console.log(`✅ Cache HIT: ${key}`);
        return JSON.parse(data);
      }
      console.log(`❌ Cache MISS: ${key}`);
      return null;
    } catch (error) {
      console.error("Cache GET error:", error);
      return null;
    }
  },

  // Set in cache with expiry (default 5 minutes = 300 seconds)
  set: async (key, value, expirySeconds = 300) => {
    try {
      if (!redisConfig.isConnected()) {
        return; // Redis not available, skip caching
      }

      await redisConfig.client.setEx(key, expirySeconds, JSON.stringify(value));
      console.log(`💾 Cached: ${key} (expires in ${expirySeconds}s)`);
    } catch (error) {
      console.error("Cache SET error:", error);
    }
  },

  // Delete specific key
  delete: async (key) => {
    try {
      if (!redisConfig.isConnected()) {
        return;
      }

      await redisConfig.client.del(key);
      console.log(`🗑️  Deleted cache: ${key}`);
    } catch (error) {
      console.error("Cache DELETE error:", error);
    }
  },

  // Delete all keys matching pattern
  deletePattern: async (pattern) => {
    try {
      if (!redisConfig.isConnected()) {
        return;
      }

      const keys = await redisConfig.client.keys(pattern);
      if (keys.length > 0) {
        await redisConfig.client.del(keys);
        console.log(`🗑️  Deleted ${keys.length} cache entries: ${pattern}*`);
      }
    } catch (error) {
      console.error("Cache DELETE PATTERN error:", error);
    }
  },

  // Clear all cache
  clear: async () => {
    try {
      if (!redisConfig.isConnected()) {
        return;
      }

      await redisConfig.client.flushDb();
      console.log("🗑️  All cache cleared!");
    } catch (error) {
      console.error("Cache CLEAR error:", error);
    }
  },
};

module.exports = cacheUtil;
