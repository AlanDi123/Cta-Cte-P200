/**
 * Enhanced Error Handling Middleware
 * Provides robust error handling for 24/7 operation
 * Includes logging, user-friendly messages, and recovery mechanisms
 */

import logger from '../utils/logger.js';
import { OptimisticLockError } from '../utils/optimisticLocking.js';

/**
 * Error types and their handling
 */
const ERROR_TYPES = {
  // Database errors
  '23505': { // Unique violation
    status: 400,
    userMessage: 'Ya existe un registro con esos datos',
    logLevel: 'warn'
  },
  '23503': { // Foreign key violation
    status: 400,
    userMessage: 'No se puede completar la operación porque hay datos relacionados',
    logLevel: 'warn'
  },
  '23502': { // Not null violation
    status: 400,
    userMessage: 'Faltan datos requeridos',
    logLevel: 'warn'
  },
  '40P01': { // Deadlock detected
    status: 503,
    userMessage: 'El sistema está ocupado. Por favor, intente nuevamente en unos segundos.',
    logLevel: 'warn',
    retryable: true
  },
  '40001': { // Serialization failure
    status: 503,
    userMessage: 'Operación en conflicto. Por favor, intente nuevamente.',
    logLevel: 'warn',
    retryable: true
  },
  '53300': { // Too many connections
    status: 503,
    userMessage: 'El sistema está experimentando alta demanda. Por favor, intente en unos momentos.',
    logLevel: 'error'
  },
  'ECONNREFUSED': { // Connection refused
    status: 503,
    userMessage: 'Error de conexión con la base de datos. Contacte al administrador.',
    logLevel: 'error'
  },
  'ETIMEDOUT': { // Timeout
    status: 504,
    userMessage: 'La operación tardó demasiado tiempo. Por favor, intente nuevamente.',
    logLevel: 'warn',
    retryable: true
  }
};

/**
 * Application error class for controlled errors
 */
export class ApplicationError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

/**
 * Not found error
 */
export class NotFoundError extends ApplicationError {
  constructor(resource = 'Recurso') {
    super(`${resource} no encontrado`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends ApplicationError {
  constructor(message, validationErrors = []) {
    super(message, 400, validationErrors);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Authorization error
 */
export class UnauthorizedError extends ApplicationError {
  constructor(message = 'No autorizado') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends ApplicationError {
  constructor(message = 'Acceso denegado') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Get error details from database error
 */
function getDatabaseErrorDetails(error) {
  const errorType = ERROR_TYPES[error.code] || ERROR_TYPES[error.code?.toUpperCase()];
  
  if (errorType) {
    return {
      status: errorType.status,
      userMessage: errorType.userMessage,
      logLevel: errorType.logLevel,
      retryable: errorType.retryable || false
    };
  }
  
  // Default for unknown database errors
  return {
    status: 500,
    userMessage: 'Error en la base de datos',
    logLevel: 'error',
    retryable: false
  };
}

/**
 * Format error response
 */
function formatErrorResponse(error, includeStack = false) {
  const response = {
    success: false,
    error: {
      message: error.message || 'Error interno del servidor',
      code: error.code || error.name || 'INTERNAL_ERROR'
    },
    timestamp: new Date().toISOString()
  };
  
  // Add details if available
  if (error.details) {
    response.error.details = error.details;
  }
  
  if (error.validationErrors) {
    response.error.validationErrors = error.validationErrors;
  }
  
  // Add retry hint for retryable errors
  if (error.retryable) {
    response.error.retryable = true;
    response.error.retryAfter = 5; // seconds
  }
  
  // Include stack trace in development
  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }
  
  return response;
}

/**
 * Main error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Don't handle if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  let statusCode = 500;
  let userMessage = err.message;
  let logLevel = 'error';
  let retryable = false;
  
  // Handle different error types
  if (err instanceof ApplicationError) {
    // Application errors (controlled)
    statusCode = err.statusCode;
    userMessage = err.message;
    logLevel = statusCode >= 500 ? 'error' : 'warn';
    
  } else if (err instanceof OptimisticLockError) {
    // Optimistic lock conflicts
    statusCode = err.statusCode || 409;
    userMessage = err.message;
    logLevel = 'warn';
    
  } else if (err.code) {
    // Database or system errors
    const details = getDatabaseErrorDetails(err);
    statusCode = details.status;
    userMessage = details.userMessage;
    logLevel = details.logLevel;
    retryable = details.retryable;
    
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    // JWT errors
    statusCode = 401;
    userMessage = 'Token inválido o expirado';
    logLevel = 'warn';
    
  } else if (err.name === 'ValidationError' && err.validationErrors) {
    // Validation errors
    statusCode = 400;
    userMessage = 'Errores de validación';
    logLevel = 'warn';
  }
  
  // Prepare error object for logging
  const errorLog = {
    message: err.message,
    code: err.code,
    name: err.name,
    statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.username || 'anonymous',
    timestamp: new Date().toISOString()
  };
  
  // Log error with appropriate level
  if (logLevel === 'error') {
    logger.error('Request error:', errorLog, err.stack);
  } else {
    logger.warn('Request warning:', errorLog);
  }
  
  // Send response
  res.status(statusCode).json(formatErrorResponse({
    ...err,
    message: userMessage,
    retryable
  }, isDevelopment));
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res, next) {
  const error = new NotFoundError('Endpoint');
  error.message = `Ruta no encontrada: ${req.method} ${req.originalUrl}`;
  next(error);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error recovery middleware
 * Attempts to recover from certain types of errors
 */
export function errorRecovery(err, req, res, next) {
  // Check if error is recoverable
  const details = getDatabaseErrorDetails(err);
  
  if (details.retryable && !req.retryCount) {
    // Mark request as retried
    req.retryCount = 1;
    
    logger.info(`Attempting automatic retry for request: ${req.method} ${req.originalUrl}`);
    
    // Small delay before retry
    setTimeout(() => {
      // Re-execute the request handler
      // This is a simplified version - in production you might want more sophisticated retry logic
      next();
    }, 100);
  } else {
    // Not recoverable or already retried, pass to error handler
    next(err);
  }
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(server, pool) {
  const shutdown = async (signal) => {
    logger.info(`${signal} received, starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });
    
    // Close database pool
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
    }
    
    // Give existing requests time to complete
    setTimeout(() => {
      logger.info('Graceful shutdown complete');
      process.exit(0);
    }, 5000);
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections in production for 24/7 operation
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }
  });
}

/**
 * Health check with error recovery
 */
export async function healthCheck(req, res, next) {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Check database connection
    try {
      const { pool } = await import('../database/connection.js');
      await pool.query('SELECT 1');
      health.database = 'connected';
    } catch (error) {
      health.database = 'disconnected';
      health.status = 'degraded';
      logger.warn('Database health check failed:', error);
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    health.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    next(error);
  }
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  errorRecovery,
  setupGracefulShutdown,
  healthCheck,
  ApplicationError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError
};
