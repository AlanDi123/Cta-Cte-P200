import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';

/**
 * Dashboard Controller - KPIs and real-time metrics
 */

// Get Key Performance Indicators
export const getKPIs = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's sales
    const salesResult = await pool.query(
      `SELECT 
        COUNT(*) as total_ventas,
        COALESCE(SUM(monto_total), 0) as total_vendido,
        COALESCE(SUM(CASE WHEN tipo_venta = 'contado' THEN monto_total ELSE 0 END), 0) as ventas_contado,
        COALESCE(SUM(CASE WHEN tipo_venta = 'credito' THEN monto_total ELSE 0 END), 0) as ventas_credito
       FROM ventas
       WHERE created_at >= $1 AND estado = 'completada'`,
      [today]
    );

    // Get current cash balance (open shifts)
    const cashResult = await pool.query(
      `SELECT 
        COUNT(*) as cajas_abiertas,
        COALESCE(SUM(saldo_actual), 0) as saldo_total
       FROM turnos_caja
       WHERE estado = 'abierto'`
    );

    // Get critical stock count
    const stockResult = await pool.query(
      `SELECT COUNT(*) as productos_criticos
       FROM productos
       WHERE stock_actual <= stock_minimo AND activo = true`
    );

    // Get pending payments (cuenta corriente with balance > 0)
    const paymentsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT cliente_id) as clientes_con_saldo,
        COALESCE(SUM(saldo), 0) as saldo_total
       FROM clientes
       WHERE saldo > 0 AND activo = true`
    );

    // Get overdue payments
    const overdueResult = await pool.query(
      `SELECT COUNT(DISTINCT c.id) as clientes_morosos
       FROM clientes c
       INNER JOIN cuenta_corriente cc ON c.id = cc.cliente_id
       WHERE cc.saldo > 0 
         AND cc.fecha_vencimiento < CURRENT_DATE 
         AND c.activo = true`
    );

    res.json({
      success: true,
      data: {
        sales: {
          today_count: parseInt(salesResult.rows[0].total_ventas),
          today_total: parseFloat(salesResult.rows[0].total_vendido),
          cash_sales: parseFloat(salesResult.rows[0].ventas_contado),
          credit_sales: parseFloat(salesResult.rows[0].ventas_credito),
        },
        cash: {
          open_registers: parseInt(cashResult.rows[0].cajas_abiertas),
          total_balance: parseFloat(cashResult.rows[0].saldo_total),
        },
        stock: {
          critical_products: parseInt(stockResult.rows[0].productos_criticos),
        },
        payments: {
          clients_with_balance: parseInt(paymentsResult.rows[0].clientes_con_saldo),
          total_balance: parseFloat(paymentsResult.rows[0].saldo_total),
          overdue_clients: parseInt(overdueResult.rows[0].clientes_morosos),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting KPIs:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener indicadores',
    });
  }
};

// Get chart data
export const getCharts = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    }
    
    // Sales by day
    const salesByDay = await pool.query(
      `SELECT 
        DATE(created_at) as fecha,
        COUNT(*) as cantidad_ventas,
        COALESCE(SUM(monto_total), 0) as total
       FROM ventas
       WHERE created_at >= $1 AND estado = 'completada'
       GROUP BY DATE(created_at)
       ORDER BY fecha`,
      [startDate]
    );

    // Sales by product category
    const salesByCategory = await pool.query(
      `SELECT 
        c.nombre as categoria,
        COUNT(vd.id) as cantidad,
        COALESCE(SUM(vd.subtotal), 0) as total
       FROM ventas_detalle vd
       INNER JOIN productos p ON vd.producto_id = p.id
       INNER JOIN categorias c ON p.categoria_id = c.id
       INNER JOIN ventas v ON vd.venta_id = v.id
       WHERE v.created_at >= $1 AND v.estado = 'completada'
       GROUP BY c.nombre
       ORDER BY total DESC
       LIMIT 10`,
      [startDate]
    );

    // Top selling products
    const topProducts = await pool.query(
      `SELECT 
        p.nombre,
        SUM(vd.cantidad) as cantidad_vendida,
        COALESCE(SUM(vd.subtotal), 0) as total_ventas
       FROM ventas_detalle vd
       INNER JOIN productos p ON vd.producto_id = p.id
       INNER JOIN ventas v ON vd.venta_id = v.id
       WHERE v.created_at >= $1 AND v.estado = 'completada'
       GROUP BY p.id, p.nombre
       ORDER BY cantidad_vendida DESC
       LIMIT 10`,
      [startDate]
    );

    // Top clients
    const topClients = await pool.query(
      `SELECT 
        c.nombre,
        COUNT(v.id) as cantidad_compras,
        COALESCE(SUM(v.monto_total), 0) as total_compras
       FROM ventas v
       INNER JOIN clientes c ON v.cliente_id = c.id
       WHERE v.created_at >= $1 AND v.estado = 'completada'
       GROUP BY c.id, c.nombre
       ORDER BY total_compras DESC
       LIMIT 10`,
      [startDate]
    );

    res.json({
      success: true,
      data: {
        sales_by_day: salesByDay.rows,
        sales_by_category: salesByCategory.rows,
        top_products: topProducts.rows,
        top_clients: topClients.rows,
      },
    });
  } catch (error) {
    logger.error('Error getting charts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener datos para gráficos',
    });
  }
};
