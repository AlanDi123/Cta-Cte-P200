/**
 * Account Management Service
 * Handles current account (cuenta corriente) operations with precision
 * Implements deterministic balance calculation from movements
 */

import logger from '../utils/logger.js';

/**
 * Recalculate client balance from all movements (deterministic calculation)
 * Always use this instead of cumulative visual updates
 * 
 * @param {object} pool - Database pool
 * @param {string} clientId - Client UUID
 * @returns {Promise<object>} Recalculated balance and movements count
 */
export async function recalculateClientBalance(pool, clientId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Use the database function for deterministic calculation
    const result = await client.query(
      'SELECT recalcular_saldo_cliente($1) as nuevo_saldo',
      [clientId]
    );
    
    const nuevoSaldo = result.rows[0].nuevo_saldo;
    
    // Get movement count for verification
    const countResult = await client.query(
      'SELECT COUNT(*) as total_movimientos FROM cuenta_corriente WHERE cliente_id = $1',
      [clientId]
    );
    
    await client.query('COMMIT');
    
    logger.info(`Balance recalculated for client ${clientId}: ${nuevoSaldo} (${countResult.rows[0].total_movimientos} movements)`);
    
    return {
      clientId,
      nuevoSaldo,
      totalMovimientos: parseInt(countResult.rows[0].total_movimientos)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Error recalculating balance for client ${clientId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Recalculate all client balances (for data integrity fixes)
 * Use this to fix inconsistencies after data corrections
 * 
 * @param {object} pool - Database pool
 * @param {object} options - Options
 * @param {boolean} options.onlyActive - Only recalculate active clients
 * @returns {Promise<object>} Summary of recalculation
 */
export async function recalculateAllBalances(pool, options = {}) {
  const { onlyActive = true } = options;
  
  try {
    const whereClause = onlyActive ? 'WHERE activo = true' : '';
    
    // Get all clients
    const clientsResult = await pool.query(
      `SELECT id, codigo, nombre FROM clientes ${whereClause} ORDER BY codigo`
    );
    
    const clients = clientsResult.rows;
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    logger.info(`Starting balance recalculation for ${clients.length} clients...`);
    
    for (const client of clients) {
      try {
        const result = await recalculateClientBalance(pool, client.id);
        results.push({
          ...result,
          codigo: client.codigo,
          nombre: client.nombre,
          status: 'success'
        });
        successCount++;
      } catch (error) {
        results.push({
          clientId: client.id,
          codigo: client.codigo,
          nombre: client.nombre,
          status: 'error',
          error: error.message
        });
        errorCount++;
        logger.error(`Failed to recalculate balance for ${client.codigo}:`, error);
      }
    }
    
    logger.info(`Balance recalculation complete: ${successCount} successful, ${errorCount} errors`);
    
    return {
      total: clients.length,
      successCount,
      errorCount,
      results
    };
  } catch (error) {
    logger.error('Error in recalculateAllBalances:', error);
    throw error;
  }
}

/**
 * Register a movement in cuenta corriente
 * Automatically updates client balance via trigger
 * 
 * @param {object} pool - Database pool
 * @param {object} movement - Movement data
 * @param {string} movement.clienteId - Client ID
 * @param {string} movement.tipo - Type: venta, pago, nota_credito, nota_debito, ajuste_credito, ajuste_debito
 * @param {number} movement.monto - Amount
 * @param {string} movement.concepto - Description
 * @param {string} movement.referenciaId - Reference to related record (venta_id, pago_id, etc)
 * @param {string} movement.referenciaTipo - Type of reference (venta, pago, ajuste)
 * @param {string} userId - User performing the operation
 * @returns {Promise<object>} Created movement
 */
export async function registerMovement(pool, movement, userId) {
  const client = await pool.connect();
  
  try {
    const {
      clienteId,
      tipo,
      monto,
      concepto,
      referenciaId,
      referenciaTipo
    } = movement;
    
    // Validate movement type
    const validTypes = ['venta', 'pago', 'nota_credito', 'nota_debito', 'ajuste_credito', 'ajuste_debito'];
    if (!validTypes.includes(tipo)) {
      throw new Error(`Tipo de movimiento inválido: ${tipo}`);
    }
    
    await client.query('BEGIN');
    
    // Set user context for audit trigger
    await client.query('SET LOCAL app.current_user_id = $1', [userId]);
    
    // Register movement
    const result = await client.query(
      `INSERT INTO cuenta_corriente (
        cliente_id, tipo, monto, concepto, 
        referencia_id, referencia_tipo, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [clienteId, tipo, monto, concepto, referenciaId, referenciaTipo, userId]
    );
    
    const newMovement = result.rows[0];
    
    // Get updated client balance
    const clientResult = await client.query(
      'SELECT saldo, limite_credito FROM clientes WHERE id = $1',
      [clienteId]
    );
    
    await client.query('COMMIT');
    
    logger.info(`Movement registered: ${tipo} - ${monto} for client ${clienteId}`);
    
    return {
      movement: newMovement,
      clientBalance: clientResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error registering movement:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create credit note (nota de crédito)
 * Used to reduce client debt (returns, discounts, etc.)
 * 
 * @param {object} pool - Database pool
 * @param {object} data - Credit note data
 * @param {string} data.clienteId - Client ID
 * @param {number} data.monto - Amount to credit
 * @param {string} data.motivo - Reason for credit note
 * @param {string} data.ventaId - Optional: related sale ID
 * @param {string} userId - User performing the operation
 * @returns {Promise<object>} Created credit note movement
 */
export async function createCreditNote(pool, data, userId) {
  const { clienteId, monto, motivo, ventaId } = data;
  
  if (!clienteId || !monto || !motivo) {
    throw new Error('Cliente, monto y motivo son requeridos');
  }
  
  if (monto <= 0) {
    throw new Error('El monto debe ser positivo');
  }
  
  return await registerMovement(pool, {
    clienteId,
    tipo: 'nota_credito',
    monto,
    concepto: `Nota de Crédito: ${motivo}`,
    referenciaId: ventaId,
    referenciaTipo: ventaId ? 'venta' : 'ajuste'
  }, userId);
}

/**
 * Create debit note (nota de débito)
 * Used to increase client debt (interest, penalties, etc.)
 * 
 * @param {object} pool - Database pool
 * @param {object} data - Debit note data
 * @param {string} data.clienteId - Client ID
 * @param {number} data.monto - Amount to debit
 * @param {string} data.motivo - Reason for debit note
 * @param {string} userId - User performing the operation
 * @returns {Promise<object>} Created debit note movement
 */
export async function createDebitNote(pool, data, userId) {
  const { clienteId, monto, motivo } = data;
  
  if (!clienteId || !monto || !motivo) {
    throw new Error('Cliente, monto y motivo son requeridos');
  }
  
  if (monto <= 0) {
    throw new Error('El monto debe ser positivo');
  }
  
  return await registerMovement(pool, {
    clienteId,
    tipo: 'nota_debito',
    monto,
    concepto: `Nota de Débito: ${motivo}`,
    referenciaId: null,
    referenciaTipo: 'ajuste'
  }, userId);
}

/**
 * Get client account statement with movements
 * 
 * @param {object} pool - Database pool
 * @param {string} clientId - Client ID
 * @param {object} options - Filter options
 * @param {Date} options.desde - Start date
 * @param {Date} options.hasta - End date
 * @param {number} options.limit - Max movements to return
 * @returns {Promise<object>} Account statement
 */
export async function getAccountStatement(pool, clientId, options = {}) {
  const { desde, hasta, limit = 100 } = options;
  
  try {
    // Get client info
    const clientResult = await pool.query(
      'SELECT * FROM clientes WHERE id = $1',
      [clientId]
    );
    
    if (clientResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }
    
    const client = clientResult.rows[0];
    
    // Build query for movements
    let query = `
      SELECT 
        cc.*,
        u.username as usuario_nombre
      FROM cuenta_corriente cc
      LEFT JOIN usuarios u ON cc.created_by = u.id
      WHERE cc.cliente_id = $1
    `;
    
    const params = [clientId];
    let paramCount = 2;
    
    if (desde) {
      query += ` AND cc.fecha >= $${paramCount}`;
      params.push(desde);
      paramCount++;
    }
    
    if (hasta) {
      query += ` AND cc.fecha <= $${paramCount}`;
      params.push(hasta);
      paramCount++;
    }
    
    // Get movements in chronological order for balance calculation
    const movementsResult = await pool.query(query + ' ORDER BY cc.fecha ASC, cc.created_at ASC LIMIT $' + paramCount, params);
    
    // Calculate running balance chronologically
    let runningBalance = 0;
    const movementsWithBalance = movementsResult.rows.map(mov => {
      if (mov.tipo === 'venta' || mov.tipo === 'nota_debito' || mov.tipo === 'ajuste_debito') {
        runningBalance += parseFloat(mov.monto);
      } else {
        runningBalance -= parseFloat(mov.monto);
      }
      
      return {
        ...mov,
        saldo_acumulado: runningBalance
      };
    });
    
    return {
      client: {
        id: client.id,
        codigo: client.codigo,
        nombre: client.nombre,
        saldo: client.saldo,
        limite_credito: client.limite_credito,
        credito_disponible: client.limite_credito - client.saldo
      },
      movements: movementsWithBalance,
      totalMovements: movementsWithBalance.length
    };
  } catch (error) {
    logger.error(`Error getting account statement for client ${clientId}:`, error);
    throw error;
  }
}

export default {
  recalculateClientBalance,
  recalculateAllBalances,
  registerMovement,
  createCreditNote,
  createDebitNote,
  getAccountStatement
};
