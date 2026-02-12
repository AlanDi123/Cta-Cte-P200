/**
 * JWT Authentication Middleware
 */
import jwt from 'jsonwebtoken';
import config from '../config.js';
import logger from '../utils/logger.js';
import { pool } from '../database/connection.js';

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No se proporcionó token de autenticación',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, config.security.jwtSecret);

    // Get user from database
    const result = await pool.query(
      'SELECT id, username, email, nombre, apellido, rol, status FROM usuarios WHERE id = $1 AND status = $2',
      [decoded.userId, 'activo']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado o inactivo',
      });
    }

    // Attach user to request
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado',
      });
    }
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error de autenticación',
    });
  }
};

/**
 * Check if user has required role
 * @param {Array} allowedRoles - Array of allowed roles
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado',
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción',
        requiredRoles: allowedRoles,
        userRole: req.user.rol,
      });
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.security.jwtSecret);
      
      const result = await pool.query(
        'SELECT id, username, email, nombre, apellido, rol, status FROM usuarios WHERE id = $1 AND status = $2',
        [decoded.userId, 'activo']
      );

      if (result.rows.length > 0) {
        req.user = result.rows[0];
      }
    }
    next();
  } catch (error) {
    // Just continue without user if token is invalid
    next();
  }
};

export default {
  authenticate,
  authorize,
  optionalAuth,
};
