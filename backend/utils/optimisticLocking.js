/**
 * Optimistic Locking Utility
 * Handles concurrent edit detection using version columns
 * 
 * Usage:
 *   await withOptimisticLock(pool, 'productos', productId, 
 *     currentVersion, async (client) => {
 *       // perform update
 *     });
 */

/**
 * Execute operation with optimistic locking check
 * @param {object} pool - Database connection pool
 * @param {string} tableName - Name of the table
 * @param {string} recordId - ID of the record to update
 * @param {number} expectedVersion - Expected version number from client
 * @param {function} operation - Async function that performs the update
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} If version conflict detected
 */
export async function withOptimisticLock(pool, tableName, recordId, expectedVersion, operation) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check current version
    const versionCheck = await client.query(
      `SELECT version FROM ${tableName} WHERE id = $1 FOR UPDATE`,
      [recordId]
    );
    
    if (versionCheck.rows.length === 0) {
      throw new Error(`Registro no encontrado en ${tableName}`);
    }
    
    const currentVersion = versionCheck.rows[0].version;
    
    // Version mismatch - concurrent modification detected
    if (currentVersion !== expectedVersion) {
      throw new OptimisticLockError(
        `El registro ha sido modificado por otro usuario. Por favor, recargue y vuelva a intentar.`,
        {
          tableName,
          recordId,
          expectedVersion,
          currentVersion
        }
      );
    }
    
    // Execute the operation
    const result = await operation(client);
    
    await client.query('COMMIT');
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Custom error for optimistic lock conflicts
 */
export class OptimisticLockError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'OptimisticLockError';
    this.statusCode = 409; // Conflict
    this.details = details;
  }
}

/**
 * Middleware to handle optimistic lock errors in Express
 */
export function optimisticLockErrorHandler(err, req, res, next) {
  if (err instanceof OptimisticLockError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        details: err.details
      }
    });
  }
  next(err);
}

/**
 * Helper to extract version from request body
 * @param {object} body - Request body
 * @returns {number} Version number
 * @throws {Error} If version is missing or invalid
 */
export function requireVersion(body) {
  const version = parseInt(body.version);
  
  if (isNaN(version) || version < 1) {
    throw new Error('Versión inválida o faltante. Se requiere número de versión para actualizar.');
  }
  
  return version;
}

/**
 * Execute multiple operations in a transaction with retry logic
 * Useful for handling transient deadlocks in high-concurrency scenarios
 * 
 * @param {object} pool - Database connection pool
 * @param {function} operation - Async function to execute
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<any>} Result of the operation
 */
export async function withRetry(pool, operation, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(pool);
    } catch (error) {
      lastError = error;
      
      // Retry on deadlock or serialization errors
      if (
        error.code === '40P01' || // deadlock_detected
        error.code === '40001' || // serialization_failure
        error instanceof OptimisticLockError
      ) {
        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Non-retryable error or max retries reached
      throw error;
    }
  }
  
  throw lastError;
}

export default {
  withOptimisticLock,
  withRetry,
  OptimisticLockError,
  optimisticLockErrorHandler,
  requireVersion
};
