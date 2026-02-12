/**
 * Cash Register (Caja) Controller
 * Business logic for cash register operations
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';
import shiftManager from '../services/shiftManager.js';
import { withTransaction } from '../utils/dbSession.js';

/**
 * Open cash register shift (apertura de turno)
 * Now supports overnight shifts with timezone handling
 */
export const openShift = async (req, res) => {
  try {
    const { caja_id, monto_apertura, observaciones_apertura, es_overnight, timezone } = req.body;

    if (!caja_id || monto_apertura === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Caja y monto de apertura son requeridos',
      });
    }

    // Use shift manager service for validation and opening
    const turno = await withTransaction(pool, req.user.id, async (client) => {
      const shiftData = {
        cajaId: caja_id,
        usuarioId: req.user.id,
        montoInicial: monto_apertura,
        esOvernight: es_overnight || false,
        timezone: timezone || shiftManager.DEFAULT_TIMEZONE
      };
      
      const newShift = await shiftManager.openShift(pool, shiftData);
      
      // Add observaciones_apertura if provided (using database update)
      if (observaciones_apertura) {
        await client.query(
          'UPDATE turnos_caja SET observaciones_apertura = $1 WHERE id = $2',
          [observaciones_apertura, newShift.id]
        );
        newShift.observaciones_apertura = observaciones_apertura;
      }
      
      return newShift;
    });

    logger.info(`Cash register shift opened by ${req.user.username} - Turno ID: ${turno.id}${turno.es_overnight ? ' (OVERNIGHT)' : ''}`);

    res.status(201).json({
      success: true,
      data: turno,
      message: turno.es_overnight ? 
        'Turno nocturno de caja abierto exitosamente' : 
        'Turno de caja abierto exitosamente',
    });
  } catch (error) {
    logger.error('Error opening shift:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al abrir turno de caja',
    });
  }
};

/**
 * Close cash register shift (cierre de turno)
 * Now supports overnight shifts and automatic date calculation
 */
export const closeShift = async (req, res) => {
  try {
    const { turno_id, monto_cierre, observaciones_cierre } = req.body;

    if (!turno_id || monto_cierre === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Turno ID y monto de cierre son requeridos',
      });
    }

    // Get shift statistics to calculate expected amount
    const stats = await shiftManager.calculateShiftStats(pool, turno_id);
    
    // Get shift details
    const shiftResult = await pool.query(
      'SELECT * FROM turnos_caja WHERE id = $1',
      [turno_id]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Turno no encontrado',
      });
    }

    const shift = shiftResult.rows[0];
    
    // Verify ownership or admin rights
    if (shift.usuario_id !== req.user.id && req.user.rol !== 'dueño') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para cerrar este turno',
      });
    }

    // Calculate expected amount from shift stats
    const totalIngresos = parseFloat(stats.ventas.total_contado || 0);
    const totalEgresos = stats.movimientos
      .filter(m => m.tipo === 'egreso' || m.tipo === 'retiro')
      .reduce((sum, m) => sum + parseFloat(m.total), 0);
    
    const montoEsperado = parseFloat(shift.monto_inicial || 0) + totalIngresos - totalEgresos;

    // Close shift using shift manager
    const closedShift = await shiftManager.closeShift(pool, turno_id, {
      montoFinal: monto_cierre,
      montoEsperado,
      notasCierre: observaciones_cierre
    });

    logger.info(`Cash register shift closed by ${req.user.username} - Turno ID: ${turno_id}${closedShift.es_overnight ? ' (OVERNIGHT)' : ''}`);

    res.json({
      success: true,
      data: {
        ...closedShift,
        stats
      },
      message: 'Turno de caja cerrado exitosamente',
    });
  } catch (error) {
    logger.error('Error closing shift:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al cerrar turno de caja',
    });
  }
};

/**
 * Get current open shift for user
 */
export const getCurrentShift = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        t.*,
        c.nombre as caja_nombre,
        u.nombre || ' ' || u.apellido as usuario_nombre
       FROM turnos_caja t
       JOIN cajas c ON t.caja_id = c.id
       JOIN usuarios u ON t.usuario_id = u.id
       WHERE t.usuario_id = $1 AND t.estado = 'abierta'
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No hay turno abierto',
      });
    }

    // Get movements summary
    const turnoId = result.rows[0].id;
    const movimientosResult = await pool.query(
      `SELECT 
        COUNT(*) as total_movimientos,
        COALESCE(SUM(CASE WHEN tipo IN ('ingreso', 'venta', 'aporte') THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo IN ('egreso', 'retiro', 'gasto') THEN monto ELSE 0 END), 0) as total_egresos
       FROM movimientos_caja
       WHERE turno_id = $1`,
      [turnoId]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        ...movimientosResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('Error getting current shift:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener turno actual',
    });
  }
};

/**
 * Register cash movement
 */
export const registerMovement = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { turno_id, tipo, monto, concepto, medio_pago } = req.body;

    if (!turno_id || !tipo || !monto || !concepto) {
      return res.status(400).json({
        success: false,
        error: 'Turno, tipo, monto y concepto son requeridos',
      });
    }

    // Validate movement type
    const validTypes = ['ingreso', 'egreso', 'retiro', 'aporte', 'gasto'];
    if (!validTypes.includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de movimiento inválido',
      });
    }

    await client.query('BEGIN');

    // Verify shift exists and is open
    const turnoResult = await client.query(
      'SELECT * FROM turnos_caja WHERE id = $1 AND estado = $2',
      [turno_id, 'abierta']
    );

    if (turnoResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Turno no encontrado o ya está cerrado',
      });
    }

    // Register movement
    const result = await client.query(
      `INSERT INTO movimientos_caja (
        turno_id, tipo, monto, concepto, medio_pago, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [turno_id, tipo, monto, concepto, medio_pago || 'efectivo', req.user.id]
    );

    const movimiento = result.rows[0];

    // Log audit
    await logAudit('movimientos_caja', movimiento.id, 'INSERT', null, movimiento, req.user, req);

    await client.query('COMMIT');

    logger.info(`Cash movement registered: ${tipo} - ${monto} - ${concepto}`);

    res.status(201).json({
      success: true,
      data: movimiento,
      message: 'Movimiento registrado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error registering movement:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar movimiento',
    });
  } finally {
    client.release();
  }
};

/**
 * Get shift movements
 */
export const getShiftMovements = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        m.*,
        u.nombre || ' ' || u.apellido as usuario_nombre
       FROM movimientos_caja m
       LEFT JOIN usuarios u ON m.created_by = u.id
       WHERE m.turno_id = $1
       ORDER BY m.fecha DESC`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error getting shift movements:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener movimientos del turno',
    });
  }
};

/**
 * Get all cash registers
 */
export const getCashRegisters = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cajas WHERE activa = true ORDER BY numero'
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error getting cash registers:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cajas',
    });
  }
};

/**
 * Get shift history
 */
export const getShiftHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      usuario_id,
      caja_id,
      desde,
      hasta,
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (usuario_id) {
      conditions.push(`t.usuario_id = $${paramCount}`);
      params.push(usuario_id);
      paramCount++;
    }

    if (caja_id) {
      conditions.push(`t.caja_id = $${paramCount}`);
      params.push(caja_id);
      paramCount++;
    }

    if (desde) {
      conditions.push(`t.fecha_apertura >= $${paramCount}`);
      params.push(desde);
      paramCount++;
    }

    if (hasta) {
      conditions.push(`t.fecha_apertura <= $${paramCount}`);
      params.push(hasta);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM turnos_caja t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get data
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        t.*,
        c.nombre as caja_nombre,
        u.nombre || ' ' || u.apellido as usuario_nombre
       FROM turnos_caja t
       JOIN cajas c ON t.caja_id = c.id
       JOIN usuarios u ON t.usuario_id = u.id
       ${whereClause}
       ORDER BY t.fecha_apertura DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting shift history:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial de turnos',
    });
  }
};

/**
 * Force close a stuck shift (admin only)
 */
export const forceCloseShift = async (req, res) => {
  try {
    // Check admin permissions
    if (req.user.rol !== 'dueño' && req.user.rol !== 'administrativo') {
      return res.status(403).json({
        success: false,
        error: 'Permiso denegado. Solo administradores pueden forzar cierre de turnos.'
      });
    }

    const { turno_id, reason } = req.body;

    if (!turno_id || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Turno ID y razón son requeridos'
      });
    }

    const closedShift = await shiftManager.forceCloseShift(
      pool,
      turno_id,
      req.user.id,
      reason
    );

    logger.warn(`Shift force-closed by admin ${req.user.username}: ${turno_id} - ${reason}`);

    res.json({
      success: true,
      data: closedShift,
      message: 'Turno cerrado forzosamente'
    });
  } catch (error) {
    logger.error('Error force-closing shift:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al forzar cierre de turno'
    });
  }
};

export default {
  openShift,
  closeShift,
  getCurrentShift,
  registerMovement,
  getShiftMovements,
  getCashRegisters,
  getShiftHistory,
  forceCloseShift,
};
