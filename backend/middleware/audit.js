/**
 * Audit logging middleware
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * Log action to audit table
 * @param {string} tabla - Table name
 * @param {string} registroId - Record ID
 * @param {string} accion - Action (INSERT, UPDATE, DELETE)
 * @param {Object} datosAnteriores - Previous data
 * @param {Object} datosNuevos - New data
 * @param {Object} usuario - User object
 * @param {Object} req - Express request object
 */
export const logAudit = async (tabla, registroId, accion, datosAnteriores, datosNuevos, usuario, req) => {
  try {
    await pool.query(
      `INSERT INTO auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tabla,
        registroId,
        accion,
        datosAnteriores ? JSON.stringify(datosAnteriores) : null,
        datosNuevos ? JSON.stringify(datosNuevos) : null,
        usuario?.id || null,
        req?.ip || null,
        req?.get('user-agent') || null,
      ]
    );
  } catch (error) {
    logger.error('Error logging audit:', error);
    // Don't throw - audit failures shouldn't stop the operation
  }
};

/**
 * Middleware to automatically log modifications
 */
export const auditMiddleware = (tabla) => {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send function to log audit after successful response
    res.send = function (data) {
      // Only log for successful modifications
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const accion = {
          'POST': 'INSERT',
          'PUT': 'UPDATE',
          'PATCH': 'UPDATE',
          'DELETE': 'DELETE',
        }[req.method];

        if (accion) {
          // Try to parse response to get record ID
          let recordId = null;
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            recordId = parsed.data?.id || req.params.id;
          } catch (e) {
            // Ignore parse errors
          }

          logAudit(
            tabla,
            recordId,
            accion,
            null, // We don't have previous data in middleware
            req.body,
            req.user,
            req
          ).catch(err => logger.error('Audit middleware error:', err));
        }
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
};

export default {
  logAudit,
  auditMiddleware,
};
