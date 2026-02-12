/**
 * Idempotency Middleware
 * Prevents duplicate operations by tracking idempotency keys
 */
import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * Generate idempotency key from request
 * @param {Object} req - Express request
 * @param {Object} body - Request body
 * @returns {String} Idempotency key
 */
export const generateIdempotencyKey = (req, body) => {
  // Use client-provided key if available
  if (body.idempotency_key && body.idempotency_key.length >= 10) {
    return body.idempotency_key;
  }
  
  // Generate deterministic key from request fingerprint
  const fingerprint = JSON.stringify({
    user_id: req.user?.id,
    path: req.path,
    method: req.method,
    body: sanitizeBodyForKey(body),
    // Include time bucket for natural expiration (5 minute window)
    time_bucket: Math.floor(Date.now() / 300000),
  });
  
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
};

/**
 * Sanitize body for idempotency key generation
 * Removes non-deterministic fields
 */
const sanitizeBodyForKey = (body) => {
  const { idempotency_key, timestamp, ...sanitized } = body;
  return sanitized;
};

/**
 * Validate idempotency key format
 */
export const validateIdempotencyKey = (key) => {
  if (!key) return false;
  if (typeof key !== 'string') return false;
  if (key.length < 10) return false;
  if (key.length > 100) return false;
  return true;
};

/**
 * Middleware to attach idempotency key to request
 */
export const attachIdempotencyKey = (req, res, next) => {
  try {
    // Generate or validate idempotency key
    const key = generateIdempotencyKey(req, req.body);
    
    if (!validateIdempotencyKey(key)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid idempotency key format',
      });
    }
    
    // Attach to request
    req.idempotency_key = key;
    
    // Log for debugging
    logger.debug(`Idempotency key: ${key.substring(0, 16)}...`);
    
    next();
  } catch (error) {
    logger.error('Error generating idempotency key:', error);
    return res.status(500).json({
      success: false,
      error: 'Error processing request',
    });
  }
};

/**
 * Middleware to require idempotency key on critical operations
 */
export const requireIdempotencyKey = (req, res, next) => {
  const key = req.body.idempotency_key || req.headers['idempotency-key'];
  
  if (!key) {
    return res.status(400).json({
      success: false,
      error: 'Idempotency-Key header or body field required for this operation',
      hint: 'Include an Idempotency-Key header or idempotency_key in request body',
    });
  }
  
  if (!validateIdempotencyKey(key)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid idempotency key format (must be 10-100 characters)',
    });
  }
  
  req.idempotency_key = key;
  next();
};

export default {
  generateIdempotencyKey,
  validateIdempotencyKey,
  attachIdempotencyKey,
  requireIdempotencyKey,
};
