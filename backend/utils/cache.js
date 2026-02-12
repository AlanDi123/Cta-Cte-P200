/**
 * Redis Cache Utility
 * Provides caching layer for frequently accessed data
 */
import { createClient } from 'redis';
import logger from './logger.js';

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = process.env.REDIS_ENABLED === 'true';
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (!this.isEnabled) {
      logger.info('Redis caching is disabled');
      return;
    }

    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined,
        database: parseInt(process.env.REDIS_DB || '0'),
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✓ Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   * @param {String} key - Cache key
   * @returns {Promise<Object|null>} Cached value or null
   */
  async get(key) {
    if (!this.isEnabled || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(value);
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {String} key - Cache key
   * @param {Object} value - Value to cache
   * @param {Number} ttl - Time to live in seconds (default: 300 = 5 minutes)
   */
  async set(key, value, ttl = 300) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {String} key - Cache key
   */
  async del(key) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client.del(key);
      logger.debug(`Cache DEL: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   * @param {String} pattern - Pattern to match (e.g., "products:*")
   */
  async delPattern(pattern) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.debug(`Cache DEL pattern: ${pattern} (${keys.length} keys)`);
      }
      return true;
    } catch (error) {
      logger.error(`Error deleting cache pattern ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Increment counter
   * @param {String} key - Cache key
   * @param {Number} amount - Amount to increment (default: 1)
   */
  async incr(key, amount = 1) {
    if (!this.isEnabled || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.client.incrBy(key, amount);
      return value;
    } catch (error) {
      logger.error(`Error incrementing cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Check if key exists
   * @param {String} key - Cache key
   */
  async exists(key) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on key
   * @param {String} key - Cache key
   * @param {Number} ttl - Time to live in seconds
   */
  async expire(key, ttl) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error(`Error setting expiration on ${key}:`, error);
      return false;
    }
  }

  /**
   * Publish message to channel (for pub/sub)
   * @param {String} channel - Channel name
   * @param {Object} message - Message to publish
   */
  async publish(channel, message) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const serialized = JSON.stringify(message);
      await this.client.publish(channel, serialized);
      logger.debug(`Published to ${channel}`);
      return true;
    } catch (error) {
      logger.error(`Error publishing to ${channel}:`, error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.isConnected && this.client) {
      await this.client.quit();
      logger.info('Redis disconnected');
    }
  }

  /**
   * Flush all cache
   */
  async flushAll() {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client.flushDb();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Error flushing cache:', error);
      return false;
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

// Cache key generators for common entities
export const CacheKeys = {
  product: (id) => `product:${id}`,
  products: (filters) => `products:${JSON.stringify(filters)}`,
  productStock: (id) => `product:${id}:stock`,
  client: (id) => `client:${id}`,
  clients: (filters) => `clients:${JSON.stringify(filters)}`,
  clientBalance: (id) => `client:${id}:balance`,
  user: (id) => `user:${id}`,
  shift: (id) => `shift:${id}`,
  activeShift: (userId) => `shift:active:${userId}`,
  sale: (id) => `sale:${id}`,
  dashboardKPIs: (date) => `dashboard:kpis:${date}`,
};

// Cache TTL configurations (in seconds)
export const CacheTTL = {
  SHORT: 60,        // 1 minute
  MEDIUM: 300,      // 5 minutes
  LONG: 1800,       // 30 minutes
  VERY_LONG: 86400, // 24 hours
};

export default cacheManager;
