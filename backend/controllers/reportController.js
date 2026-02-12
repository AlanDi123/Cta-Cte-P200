import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * Reports Controller - Comprehensive reporting system
 */

// Configuration constants
const STOCK_LEVELS = {
  LOW_MULTIPLIER: 1.5, // Stock is considered low when above minimum but below minimum * multiplier
};

// Sales Report
export const salesReport = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      cliente_id,
      producto_id,
      tipo_venta,
      turno, // 'diurno' or 'nocturno'
      group_by = 'day', // 'day', 'week', 'month', 'product', 'client'
    } = req.query;

    let query = `
      SELECT 
        v.id,
        v.numero_venta,
        v.created_at,
        v.tipo_venta,
        v.medio_pago,
        v.monto_total,
        v.monto_pagado,
        v.estado,
        c.nombre as cliente,
        u.nombre || ' ' || u.apellido as vendedor
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.vendedor_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Date filters
    if (start_date) {
      params.push(start_date);
      query += ` AND v.created_at >= $${paramCount}`;
      paramCount++;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND v.created_at <= $${paramCount}`;
      paramCount++;
    }

    // Client filter
    if (cliente_id) {
      params.push(cliente_id);
      query += ` AND v.cliente_id = $${paramCount}`;
      paramCount++;
    }

    // Sale type filter
    if (tipo_venta) {
      params.push(tipo_venta);
      query += ` AND v.tipo_venta = $${paramCount}`;
      paramCount++;
    }

    // Shift filter (diurno: 6am-10pm, nocturno: 10pm-6am)
    if (turno === 'diurno') {
      query += ` AND EXTRACT(HOUR FROM v.created_at) BETWEEN 6 AND 21`;
    } else if (turno === 'nocturno') {
      query += ` AND (EXTRACT(HOUR FROM v.created_at) < 6 OR EXTRACT(HOUR FROM v.created_at) >= 22)`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.total_ventas += parseFloat(row.monto_total);
      acc.total_pagado += parseFloat(row.monto_pagado);
      acc.cantidad += 1;
      return acc;
    }, { total_ventas: 0, total_pagado: 0, cantidad: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals,
    });
  } catch (error) {
    logger.error('Error generating sales report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte de ventas',
    });
  }
};

// Cash Report
export const cashReport = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      caja_id,
      usuario_id,
      turno, // 'diurno' or 'nocturno'
    } = req.query;

    let query = `
      SELECT 
        tc.id,
        tc.fecha_apertura,
        tc.fecha_cierre,
        tc.saldo_inicial,
        tc.saldo_final,
        tc.saldo_esperado,
        tc.diferencia,
        tc.estado,
        c.nombre as caja,
        u.nombre || ' ' || u.apellido as usuario
      FROM turnos_caja tc
      INNER JOIN cajas c ON tc.caja_id = c.id
      INNER JOIN usuarios u ON tc.usuario_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Date filters
    if (start_date) {
      params.push(start_date);
      query += ` AND tc.fecha_apertura >= $${paramCount}`;
      paramCount++;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND tc.fecha_apertura <= $${paramCount}`;
      paramCount++;
    }

    // Cash register filter
    if (caja_id) {
      params.push(caja_id);
      query += ` AND tc.caja_id = $${paramCount}`;
      paramCount++;
    }

    // User filter
    if (usuario_id) {
      params.push(usuario_id);
      query += ` AND tc.usuario_id = $${paramCount}`;
      paramCount++;
    }

    // Shift filter
    if (turno === 'diurno') {
      query += ` AND EXTRACT(HOUR FROM tc.fecha_apertura) BETWEEN 6 AND 21`;
    } else if (turno === 'nocturno') {
      query += ` AND (EXTRACT(HOUR FROM tc.fecha_apertura) < 6 OR EXTRACT(HOUR FROM tc.fecha_apertura) >= 22)`;
    }

    query += ` ORDER BY tc.fecha_apertura DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      if (row.estado === 'cerrado') {
        acc.total_ingresos += parseFloat(row.saldo_final) - parseFloat(row.saldo_inicial);
        acc.total_diferencias += parseFloat(row.diferencia || 0);
      }
      return acc;
    }, { total_ingresos: 0, total_diferencias: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals,
    });
  } catch (error) {
    logger.error('Error generating cash report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte de caja',
    });
  }
};

// Stock Report
export const stockReport = async (req, res) => {
  try {
    const {
      categoria_id,
      nivel = 'all', // 'critico', 'bajo', 'normal', 'alto', 'all'
      activo = true,
    } = req.query;

    let query = `
      SELECT 
        p.id,
        p.codigo,
        p.nombre,
        p.stock_actual,
        p.stock_minimo,
        p.stock_maximo,
        p.unidad_medida,
        p.precio_venta,
        p.precio_costo,
        c.nombre as categoria,
        (p.stock_actual * p.precio_costo) as valor_stock
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = $1
    `;

    const params = [activo];
    let paramCount = 2;

    // Category filter
    if (categoria_id) {
      params.push(categoria_id);
      query += ` AND p.categoria_id = $${paramCount}`;
      paramCount++;
    }

    // Stock level filter
    if (nivel === 'critico') {
      query += ` AND p.stock_actual <= p.stock_minimo`;
    } else if (nivel === 'bajo') {
      query += ` AND p.stock_actual > p.stock_minimo AND p.stock_actual <= (p.stock_minimo * $${paramCount})`;
      params.push(STOCK_LEVELS.LOW_MULTIPLIER);
      paramCount++;
    } else if (nivel === 'normal') {
      query += ` AND p.stock_actual > (p.stock_minimo * $${paramCount}) AND p.stock_actual < p.stock_maximo`;
      params.push(STOCK_LEVELS.LOW_MULTIPLIER);
      paramCount++;
    } else if (nivel === 'alto') {
      query += ` AND p.stock_actual >= p.stock_maximo`;
    }

    query += ` ORDER BY p.nombre`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.total_productos += 1;
      acc.valor_total_stock += parseFloat(row.valor_stock || 0);
      return acc;
    }, { total_productos: 0, valor_total_stock: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals,
    });
  } catch (error) {
    logger.error('Error generating stock report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte de stock',
    });
  }
};

// Clients Report
export const clientsReport = async (req, res) => {
  try {
    const {
      tipo_cliente,
      con_saldo = false,
      morosos = false,
      start_date,
      end_date,
    } = req.query;

    let query = `
      SELECT 
        c.id,
        c.nombre,
        c.tipo_cliente,
        c.limite_credito,
        c.saldo,
        c.telefono,
        c.email,
        COUNT(DISTINCT v.id) as total_compras,
        COALESCE(SUM(v.monto_total), 0) as total_gastado
      FROM clientes c
      LEFT JOIN ventas v ON c.id = v.cliente_id
    `;

    const params = [];
    let paramCount = 1;

    // Add date filter in JOIN if provided
    if (start_date || end_date) {
      query = query.replace(
        'LEFT JOIN ventas v ON c.id = v.cliente_id',
        'LEFT JOIN ventas v ON c.id = v.cliente_id' + 
        (start_date ? ` AND v.created_at >= $${paramCount++}` : '') +
        (end_date ? ` AND v.created_at <= $${paramCount++}` : '')
      );
      if (start_date) params.push(start_date);
      if (end_date) params.push(end_date);
    }

    query += ' WHERE c.activo = true';

    // Type filter
    if (tipo_cliente) {
      params.push(tipo_cliente);
      query += ` AND c.tipo_cliente = $${paramCount}`;
      paramCount++;
    }

    query += ' GROUP BY c.id';

    // Balance filter
    if (con_saldo === 'true') {
      query += ' HAVING c.saldo > 0';
    }

    // Overdue filter (requires cuenta_corriente check)
    if (morosos === 'true') {
      query += ` HAVING c.id IN (
        SELECT DISTINCT cliente_id 
        FROM cuenta_corriente 
        WHERE saldo > 0 AND fecha_vencimiento < CURRENT_DATE
      )`;
    }

    query += ' ORDER BY total_gastado DESC';

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.total_clientes += 1;
      acc.total_ventas += parseFloat(row.total_gastado);
      acc.saldo_total += parseFloat(row.saldo);
      return acc;
    }, { total_clientes: 0, total_ventas: 0, saldo_total: 0 });

    res.json({
      success: true,
      data: result.rows,
      totals,
    });
  } catch (error) {
    logger.error('Error generating clients report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte de clientes',
    });
  }
};

// Profit/Margin Report
export const profitReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        v.id,
        v.numero_venta,
        v.created_at,
        v.monto_total,
        c.nombre as cliente,
        SUM(vd.cantidad * p.precio_costo) as costo_total,
        v.monto_total - SUM(vd.cantidad * p.precio_costo) as ganancia,
        ((v.monto_total - SUM(vd.cantidad * p.precio_costo)) / NULLIF(SUM(vd.cantidad * p.precio_costo), 0) * 100) as margen_porcentaje
      FROM ventas v
      INNER JOIN ventas_detalle vd ON v.id = vd.venta_id
      INNER JOIN productos p ON vd.producto_id = p.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.estado = 'completada'
    `;

    const params = [];
    let paramCount = 1;

    if (start_date) {
      params.push(start_date);
      query += ` AND v.created_at >= $${paramCount}`;
      paramCount++;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND v.created_at <= $${paramCount}`;
      paramCount++;
    }

    query += ` GROUP BY v.id, v.numero_venta, v.created_at, v.monto_total, c.nombre
               ORDER BY v.created_at DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => {
      acc.total_ventas += parseFloat(row.monto_total);
      acc.total_costo += parseFloat(row.costo_total);
      acc.total_ganancia += parseFloat(row.ganancia);
      return acc;
    }, { total_ventas: 0, total_costo: 0, total_ganancia: 0 });

    totals.margen_promedio = totals.total_costo > 0 
      ? (totals.total_ganancia / totals.total_costo * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: result.rows,
      totals,
    });
  } catch (error) {
    logger.error('Error generating profit report:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar reporte de ganancias',
    });
  }
};
