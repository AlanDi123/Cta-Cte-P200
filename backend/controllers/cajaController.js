/**
 * Cash Register (Caja) Controller
 * Business logic for cash register operations
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';

/**
 * Open cash register shift (apertura de turno)
 */
export const openShift = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { caja_id, monto_apertura, observaciones_apertura } = req.body;

    if (!caja_id || monto_apertura === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Caja y monto de apertura son requeridos',
      });
    }

    await client.query('BEGIN');

    // Check if there's already an open shift for this user
    const existingShift = await client.query(
      `SELECT id FROM turnos_caja 
       WHERE usuario_id = $1 AND estado = 'abierta'`,
      [req.user.id]
    );

    if (existingShift.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ya tienes un turno abierto. Cierra el turno actual antes de abrir uno nuevo.',
      });
    }

    // Open new shift
    const result = await client.query(
      `INSERT INTO turnos_caja (
        caja_id, usuario_id, estado, monto_apertura, observaciones_apertura
      ) VALUES ($1, $2, 'abierta', $3, $4)
      RETURNING *`,
      [caja_id, req.user.id, monto_apertura, observaciones_apertura]
    );

    const turno = result.rows[0];

    // Log audit
    await logAudit('turnos_caja', turno.id, 'INSERT', null, turno, req.user, req);

    await client.query('COMMIT');

    logger.info(`Cash register shift opened by ${req.user.username} - Turno ID: ${turno.id}`);

    res.status(201).json({
      success: true,
      data: turno,
      message: 'Turno de caja abierto exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error opening shift:', error);
    res.status(500).json({
      success: false,
      error: 'Error al abrir turno de caja',
    });
  } finally {
    client.release();
  }
};

/**
 * Close cash register shift (cierre de turno)
 */
export const closeShift = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { turno_id, monto_cierre, observaciones_cierre } = req.body;

    if (!turno_id || monto_cierre === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Turno ID y monto de cierre son requeridos',
      });
    }

    await client.query('BEGIN');

    // Get shift data
    const turnoResult = await client.query(
      'SELECT * FROM turnos_caja WHERE id = $1 AND usuario_id = $2',
      [turno_id, req.user.id]
    );

    if (turnoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Turno no encontrado o no pertenece al usuario actual',
      });
    }

    const turno = turnoResult.rows[0];

    if (turno.estado === 'cerrada') {
      return res.status(400).json({
        success: false,
        error: 'El turno ya está cerrado',
      });
    }

    // Calculate expected amount (apertura + ingresos - egresos)
    const movimientosResult = await client.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN tipo IN ('ingreso', 'venta', 'aporte') THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo IN ('egreso', 'retiro', 'gasto') THEN monto ELSE 0 END), 0) as total_egresos
       FROM movimientos_caja
       WHERE turno_id = $1`,
      [turno_id]
    );

    const { total_ingresos, total_egresos } = movimientosResult.rows[0];
    const monto_esperado = parseFloat(turno.monto_apertura) + 
                           parseFloat(total_ingresos) - 
                           parseFloat(total_egresos);
    const diferencia = parseFloat(monto_cierre) - monto_esperado;

    // Close shift
    const result = await client.query(
      `UPDATE turnos_caja 
       SET estado = 'cerrada',
           fecha_cierre = CURRENT_TIMESTAMP,
           monto_cierre = $1,
           monto_esperado = $2,
           diferencia = $3,
           observaciones_cierre = $4
       WHERE id = $5
       RETURNING *`,
      [monto_cierre, monto_esperado, diferencia, observaciones_cierre, turno_id]
    );

    const closedTurno = result.rows[0];

    // Log audit
    await logAudit('turnos_caja', turno_id, 'UPDATE', turno, closedTurno, req.user, req);

    await client.query('COMMIT');

    logger.info(`Cash register shift closed by ${req.user.username} - Turno ID: ${turno_id}`);

    res.json({
      success: true,
      data: {
        ...closedTurno,
        total_ingresos,
        total_egresos,
      },
      message: 'Turno de caja cerrado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error closing shift:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cerrar turno de caja',
    });
  } finally {
    client.release();
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

export default {
  openShift,
  closeShift,
  getCurrentShift,
  registerMovement,
  getShiftMovements,
  getCashRegisters,
  getShiftHistory,
};
