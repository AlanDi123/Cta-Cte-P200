/**
 * Shift Management Service for 24/7 Operations
 * Handles overnight shifts, timezone-aware operations, and shift transitions
 */

// Note: moment-timezone is optional - will add to package.json if needed
// For now, using native Date with timezone consideration

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Determine if a shift spans midnight (overnight shift)
 * @param {Date|string} startTime - Shift start time
 * @param {Date|string} endTime - Shift end time  
 * @returns {boolean} True if shift crosses midnight
 */
export function isOvernightShift(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  // Extract hours and minutes for time comparison
  const startHour = start.getHours();
  const endHour = end.getHours();
  
  // If end hour is earlier than start hour, it's overnight
  // (e.g., start at 22:00, end at 06:00)
  if (endHour < startHour) {
    return true;
  }
  
  // If end is before start in absolute time, it's overnight
  if (end < start) {
    return true;
  }
  
  // If shift is longer than 12 hours, likely overnight
  const hoursDiff = (end - start) / (1000 * 60 * 60);
  return hoursDiff > 12;
}

/**
 * Calculate official closing date for a shift
 * For overnight shifts, uses the date when shift started
 * 
 * @param {Date|string} aperturaFecha - Shift opening timestamp
 * @param {Date|string} cierreFecha - Shift closing timestamp
 * @param {boolean} esOvernight - Whether shift is overnight
 * @returns {string} Official closing date (YYYY-MM-DD)
 */
export function calculateOfficialClosingDate(aperturaFecha, cierreFecha, esOvernight) {
  const apertura = new Date(aperturaFecha);
  const cierre = new Date(cierreFecha);
  
  const dateToUse = esOvernight ? apertura : cierre;
  
  // Format as YYYY-MM-DD
  return dateToUse.toISOString().split('T')[0];
}

/**
 * Validate shift opening
 * Checks if user can open a new shift
 * 
 * @param {object} pool - Database pool
 * @param {string} cajaId - Cash register ID
 * @param {string} usuarioId - User ID
 * @returns {Promise<{canOpen: boolean, reason: string}>}
 */
export async function canOpenShift(pool, cajaId, usuarioId) {
  // Check if caja has an open shift
  const result = await pool.query(
    `SELECT id, usuario_id, fecha_apertura, es_overnight
     FROM turnos_caja
     WHERE caja_id = $1 AND estado = 'abierto'
     LIMIT 1`,
    [cajaId]
  );
  
  if (result.rows.length > 0) {
    const openShift = result.rows[0];
    const hoursOpen = (new Date() - new Date(openShift.fecha_apertura)) / (1000 * 60 * 60);
    
    // If shift has been open for more than 24 hours, it's likely stuck
    if (hoursOpen > 24) {
      return {
        canOpen: false,
        reason: `Turno abierto hace ${Math.round(hoursOpen)} horas. Requiere cierre administrativo.`,
        requiresAdminClose: true
      };
    }
    
    const formatDate = (date) => new Date(date).toLocaleString('es-AR');
    return {
      canOpen: false,
      reason: `Caja ya tiene un turno abierto desde ${formatDate(openShift.fecha_apertura)}`
    };
  }
  
  // Check if user already has an open shift in another caja
  const userShift = await pool.query(
    `SELECT tc.id, c.nombre as caja_nombre
     FROM turnos_caja tc
     JOIN cajas c ON tc.caja_id = c.id
     WHERE tc.usuario_id = $1 AND tc.estado = 'abierto'
     LIMIT 1`,
    [usuarioId]
  );
  
  if (userShift.rows.length > 0) {
    return {
      canOpen: false,
      reason: `Usuario ya tiene un turno abierto en caja "${userShift.rows[0].caja_nombre}"`
    };
  }
  
  return { canOpen: true, reason: 'OK' };
}

/**
 * Open a new shift
 * 
 * @param {object} pool - Database pool
 * @param {object} shiftData - Shift data
 * @param {string} shiftData.cajaId - Cash register ID
 * @param {string} shiftData.usuarioId - User ID
 * @param {number} shiftData.montoInicial - Opening amount
 * @param {boolean} shiftData.esOvernight - Is overnight shift
 * @param {string} shiftData.timezone - Timezone
 * @returns {Promise<object>} Created shift
 */
export async function openShift(pool, shiftData) {
  const {
    cajaId,
    usuarioId,
    montoInicial = 0,
    esOvernight = false,
    timezone = DEFAULT_TIMEZONE
  } = shiftData;
  
  // Validate
  const validation = await canOpenShift(pool, cajaId, usuarioId);
  if (!validation.canOpen) {
    throw new Error(validation.reason);
  }
  
  const now = new Date();
  
  const result = await pool.query(
    `INSERT INTO turnos_caja (
      caja_id, usuario_id, fecha_apertura, monto_inicial,
      estado, es_overnight, timezone
    ) VALUES ($1, $2, $3, $4, 'abierto', $5, $6)
    RETURNING *`,
    [cajaId, usuarioId, now, montoInicial, esOvernight, timezone]
  );
  
  return result.rows[0];
}

/**
 * Close a shift
 * 
 * @param {object} pool - Database pool
 * @param {string} turnoId - Shift ID
 * @param {object} closeData - Closing data
 * @param {number} closeData.montoFinal - Final amount
 * @param {number} closeData.montoEsperado - Expected amount
 * @param {string} closeData.notasCierre - Closing notes
 * @returns {Promise<object>} Updated shift
 */
export async function closeShift(pool, turnoId, closeData) {
  const { montoFinal, montoEsperado, notasCierre } = closeData;
  
  // Get shift details
  const shiftResult = await pool.query(
    'SELECT * FROM turnos_caja WHERE id = $1',
    [turnoId]
  );
  
  if (shiftResult.rows.length === 0) {
    throw new Error('Turno no encontrado');
  }
  
  const shift = shiftResult.rows[0];
  
  if (shift.estado !== 'abierto') {
    throw new Error(`No se puede cerrar un turno con estado: ${shift.estado}`);
  }
  
  const now = new Date();
  
  // Calculate official closing date
  const fechaCierreOficial = calculateOfficialClosingDate(
    shift.fecha_apertura,
    now,
    shift.es_overnight
  );
  
  // Calculate difference
  const diferencia = montoFinal - montoEsperado;
  
  const result = await pool.query(
    `UPDATE turnos_caja
     SET estado = 'cerrado',
         fecha_cierre = $1,
         fecha_cierre_oficial = $2,
         monto_final = $3,
         monto_esperado = $4,
         diferencia = $5,
         notas_cierre = $6
     WHERE id = $7
     RETURNING *`,
    [
      now,
      fechaCierreOficial,
      montoFinal,
      montoEsperado,
      diferencia,
      notasCierre,
      turnoId
    ]
  );
  
  return result.rows[0];
}

/**
 * Get current active shift for a user or caja
 * 
 * @param {object} pool - Database pool
 * @param {object} criteria - Search criteria
 * @param {string} criteria.usuarioId - User ID
 * @param {string} criteria.cajaId - Cash register ID
 * @returns {Promise<object|null>} Active shift or null
 */
export async function getCurrentShift(pool, criteria) {
  const { usuarioId, cajaId } = criteria;
  
  let query = `
    SELECT tc.*, c.nombre as caja_nombre, u.username as usuario_nombre
    FROM turnos_caja tc
    JOIN cajas c ON tc.caja_id = c.id
    JOIN usuarios u ON tc.usuario_id = u.id
    WHERE tc.estado = 'abierto'
  `;
  
  const params = [];
  
  if (usuarioId) {
    params.push(usuarioId);
    query += ` AND tc.usuario_id = $${params.length}`;
  }
  
  if (cajaId) {
    params.push(cajaId);
    query += ` AND tc.caja_id = $${params.length}`;
  }
  
  query += ' LIMIT 1';
  
  const result = await pool.query(query, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Calculate shift statistics
 * 
 * @param {object} pool - Database pool
 * @param {string} turnoId - Shift ID
 * @returns {Promise<object>} Shift statistics
 */
export async function calculateShiftStats(pool, turnoId) {
  // Get movements summary
  const movimientosResult = await pool.query(
    `SELECT 
       tipo,
       medio_pago,
       COUNT(*) as cantidad,
       SUM(monto) as total
     FROM movimientos_caja
     WHERE turno_id = $1
     GROUP BY tipo, medio_pago`,
    [turnoId]
  );
  
  // Get sales in this shift
  const ventasResult = await pool.query(
    `SELECT 
       COUNT(*) as cantidad_ventas,
       SUM(total) as total_ventas,
       SUM(CASE WHEN tipo_venta = 'contado' THEN total ELSE 0 END) as total_contado,
       SUM(CASE WHEN tipo_venta = 'credito' THEN total ELSE 0 END) as total_credito
     FROM ventas
     WHERE turno_id = $1 AND estado = 'completada'`,
    [turnoId]
  );
  
  return {
    movimientos: movimientosResult.rows,
    ventas: ventasResult.rows[0] || {}
  };
}

/**
 * Force close stuck shift (admin only)
 * 
 * @param {object} pool - Database pool  
 * @param {string} turnoId - Shift ID
 * @param {string} adminId - Admin user ID
 * @param {string} reason - Reason for force close
 * @returns {Promise<object>} Updated shift
 */
export async function forceCloseShift(pool, turnoId, adminId, reason) {
  const now = new Date();
  
  const result = await pool.query(
    `UPDATE turnos_caja
     SET estado = 'cerrado_forzado',
         fecha_cierre = $1,
         notas_cierre = $2,
         updated_by = $3
     WHERE id = $4
     RETURNING *`,
    [now, `Cierre forzado: ${reason}`, adminId, turnoId]
  );
  
  return result.rows[0];
}

export default {
  isOvernightShift,
  calculateOfficialClosingDate,
  canOpenShift,
  openShift,
  closeShift,
  getCurrentShift,
  calculateShiftStats,
  forceCloseShift,
  DEFAULT_TIMEZONE
};
