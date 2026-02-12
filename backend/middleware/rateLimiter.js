/**
 * Rate Limiting Configuration
 * Prevents abuse of API endpoints
 */

import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: 'Demasiadas solicitudes. Por favor, intente más tarde.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per 15 minutes
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: 'Demasiadas solicitudes a este endpoint. Por favor, espere antes de intentar nuevamente.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Very strict rate limiter for backup/restore operations
 * 3 requests per hour
 */
export const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Límite de operaciones de backup excedido. Por favor, espere antes de crear más backups.',
    code: 'BACKUP_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Auth rate limiter for login attempts
 * 5 attempts per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Demasiados intentos de inicio de sesión. Por favor, espere antes de intentar nuevamente.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * Cash register operations rate limiter
 * 20 operations per minute
 */
export const cajaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    success: false,
    error: 'Demasiadas operaciones de caja. Por favor, espere un momento.',
    code: 'CAJA_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export default {
  apiLimiter,
  strictLimiter,
  backupLimiter,
  authLimiter,
  cajaLimiter
};
