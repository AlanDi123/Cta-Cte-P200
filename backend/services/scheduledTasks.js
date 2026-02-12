/**
 * Scheduled Tasks
 * Periodic background jobs
 */
import cron from 'node-cron';
import logger from '../utils/logger.js';
import jobQueueManager from '../utils/jobQueue.js';
import { pool } from '../database/connection.js';

/**
 * Schedule cleanup of expired stock reservations
 * Runs every 5 minutes
 */
export const scheduleReservationCleanup = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await jobQueueManager.addJob('cleanup', 'cleanup-old-data', {
        type: 'expired_reservations',
      });
      logger.debug('Scheduled: Expired reservations cleanup');
    } catch (error) {
      logger.error('Error scheduling reservation cleanup:', error);
    }
  });
};

/**
 * Schedule cleanup of old audit logs
 * Runs daily at 3 AM
 */
export const scheduleAuditCleanup = () => {
  cron.schedule('0 3 * * *', async () => {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      await jobQueueManager.addJob('cleanup', 'cleanup-old-data', {
        type: 'audit_logs',
        olderThan: sixMonthsAgo.toISOString(),
      });
      logger.info('Scheduled: Old audit logs cleanup');
    } catch (error) {
      logger.error('Error scheduling audit cleanup:', error);
    }
  });
};

/**
 * Schedule cache warmup
 * Runs every hour
 */
export const scheduleCacheWarmup = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Starting cache warmup...');
      
      // Pre-load frequently accessed products
      const productsResult = await pool.query(
        `SELECT id, codigo, nombre, precio_venta, stock_actual 
         FROM productos 
         WHERE activo = true 
         ORDER BY created_at DESC 
         LIMIT 100`
      );
      
      logger.info(`Cache warmed up with ${productsResult.rows.length} products`);
    } catch (error) {
      logger.error('Error during cache warmup:', error);
    }
  });
};

/**
 * Schedule stock alerts check
 * Runs every 30 minutes
 */
export const scheduleStockAlerts = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await pool.query(
        `SELECT id, codigo, nombre, stock_actual, stock_minimo
         FROM productos
         WHERE activo = true
         AND stock_actual <= stock_minimo`
      );
      
      if (result.rows.length > 0) {
        logger.warn(`Stock alert: ${result.rows.length} products below minimum stock`);
        // TODO: Send notifications to admins
      }
    } catch (error) {
      logger.error('Error checking stock alerts:', error);
    }
  });
};

/**
 * Schedule database health check
 * Runs every 15 minutes
 */
export const scheduleDatabaseHealthCheck = () => {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await pool.query('SELECT NOW()');
      logger.debug('Database health check: OK');
    } catch (error) {
      logger.error('Database health check: FAILED', error);
    }
  });
};

/**
 * Initialize all scheduled tasks
 */
export const initializeScheduledTasks = () => {
  logger.info('Initializing scheduled tasks...');
  
  scheduleReservationCleanup();
  scheduleAuditCleanup();
  scheduleCacheWarmup();
  scheduleStockAlerts();
  scheduleDatabaseHealthCheck();
  
  logger.info('✓ Scheduled tasks initialized');
};

export default {
  scheduleReservationCleanup,
  scheduleAuditCleanup,
  scheduleCacheWarmup,
  scheduleStockAlerts,
  scheduleDatabaseHealthCheck,
  initializeScheduledTasks,
};
