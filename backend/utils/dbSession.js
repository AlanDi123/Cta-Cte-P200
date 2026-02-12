/**
 * Database Session Utilities
 * Handle session variables for audit trails and multi-user tracking
 */

/**
 * Set current user ID in database session for audit triggers
 * This allows triggers to know which user performed the action
 * 
 * @param {object} client - Database client
 * @param {string} userId - UUID of current user
 */
export async function setCurrentUser(client, userId) {
  if (!userId) {
    return;
  }
  
  try {
    await client.query('SET LOCAL app.current_user_id = $1', [userId]);
  } catch (error) {
    // Log but don't fail the operation if session variable setting fails
    console.error('Failed to set current user in session:', error);
  }
}

/**
 * Clear current user from database session
 * @param {object} client - Database client
 */
export async function clearCurrentUser(client) {
  try {
    await client.query('RESET app.current_user_id');
  } catch (error) {
    console.error('Failed to clear current user from session:', error);
  }
}

/**
 * Execute operation with user context set in database session
 * Ensures audit triggers can track who made changes
 * 
 * @param {object} pool - Database connection pool
 * @param {string} userId - UUID of current user
 * @param {function} operation - Async function to execute
 * @returns {Promise<any>} Result of the operation
 */
export async function withUserContext(pool, userId, operation) {
  const client = await pool.connect();
  
  try {
    await setCurrentUser(client, userId);
    const result = await operation(client);
    return result;
  } finally {
    await clearCurrentUser(client);
    client.release();
  }
}

/**
 * Execute transaction with user context
 * Combines transaction management with user context for audit
 * 
 * @param {object} pool - Database connection pool
 * @param {string} userId - UUID of current user
 * @param {function} operation - Async function to execute in transaction
 * @returns {Promise<any>} Result of the operation
 */
export async function withTransaction(pool, userId, operation) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await setCurrentUser(client, userId);
    
    const result = await operation(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await clearCurrentUser(client);
    client.release();
  }
}

/**
 * Middleware to extract user ID from JWT and make it available
 * Should be used after authentication middleware
 */
export function attachUserContext(req, res, next) {
  // User should be set by auth middleware
  if (req.user && req.user.id) {
    req.userId = req.user.id;
  }
  next();
}

export default {
  setCurrentUser,
  clearCurrentUser,
  withUserContext,
  withTransaction,
  attachUserContext
};
