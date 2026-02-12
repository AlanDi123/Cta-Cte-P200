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
 * Schedule near-expiration alerts check
 * Runs daily at 8 AM
 */
export const scheduleExpirationAlerts = () => {
  cron.schedule('0 8 * * *', async () => {
    try {
      // Products expiring in the next 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      const result = await pool.query(
        `SELECT 
          l.id as lote_id,
          l.numero_lote,
          l.fecha_vencimiento,
          p.id as producto_id,
          p.codigo,
          p.nombre,
          l.cantidad,
          (l.fecha_vencimiento::date - CURRENT_DATE) as dias_para_vencer
         FROM lotes l
         JOIN productos p ON l.producto_id = p.id
         WHERE l.fecha_vencimiento IS NOT NULL
         AND l.fecha_vencimiento <= $1
         AND l.fecha_vencimiento >= CURRENT_DATE
         AND l.cantidad > 0
         ORDER BY l.fecha_vencimiento ASC`,
        [thirtyDaysFromNow]
      );
      
      if (result.rows.length > 0) {
        logger.warn(`Expiration alert: ${result.rows.length} lots expiring in the next 30 days`);
        
        // Group by urgency
        const critical = result.rows.filter(r => r.dias_para_vencer <= 7);
        const warning = result.rows.filter(r => r.dias_para_vencer > 7 && r.dias_para_vencer <= 15);
        const notice = result.rows.filter(r => r.dias_para_vencer > 15);
        
        if (critical.length > 0) {
          logger.error(`CRITICAL: ${critical.length} lots expiring in 7 days or less!`);
        }
        if (warning.length > 0) {
          logger.warn(`WARNING: ${warning.length} lots expiring in 8-15 days`);
        }
        if (notice.length > 0) {
          logger.info(`NOTICE: ${notice.length} lots expiring in 16-30 days`);
        }
        
        // TODO: Send email notifications to admins with detailed report
      }
    } catch (error) {
      logger.error('Error checking expiration alerts:', error);
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
  scheduleExpirationAlerts();
  scheduleDatabaseHealthCheck();
  
  logger.info('✓ Scheduled tasks initialized');
};

export default {
  scheduleReservationCleanup,
  scheduleAuditCleanup,
  scheduleCacheWarmup,
  scheduleStockAlerts,
  scheduleExpirationAlerts,
  scheduleDatabaseHealthCheck,
  initializeScheduledTasks,
};
