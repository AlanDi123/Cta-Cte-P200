/**
 * Sales Controller
 * Business logic for sales management
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';

/**
 * Create new sale
 */
export const createSale = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      cliente_id,
      turno_id,
      tipo_venta,
      items, // [{producto_id, cantidad, precio_unitario, descuento_porcentaje}]
      descuento = 0,
      tipo_comprobante = 'B',
      observaciones,
      pagos = [], // [{metodo, monto, referencia, banco}]
    } = req.body;

    // Validation
    if (!cliente_id || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cliente e items son requeridos',
      });
    }

    if (!tipo_venta || !['contado', 'credito', 'parcial'].includes(tipo_venta)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de venta inválido',
      });
    }

    await client.query('BEGIN');

    // Verify client exists and has credit available if needed
    const clientResult = await client.query(
      'SELECT nombre, saldo, limite_credito FROM clientes WHERE id = $1 AND activo = true',
      [cliente_id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado o inactivo',
      });
    }

    const cliente = clientResult.rows[0];

    // Calculate totals
    let subtotal = 0;
    let ivaTotal = 0;
    const itemsConProducto = [];

    for (const item of items) {
      // Get product info
      const productResult = await client.query(
        'SELECT precio_venta, iva_porcentaje, stock_actual, permite_venta_sin_stock FROM productos WHERE id = $1 AND activo = true',
        [item.producto_id]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Producto ${item.producto_id} no encontrado`);
      }

      const producto = productResult.rows[0];

      // Check stock
      if (!producto.permite_venta_sin_stock && producto.stock_actual < item.cantidad) {
        throw new Error(`Stock insuficiente para producto ${item.producto_id}`);
      }

      const precioUnitario = item.precio_unitario || producto.precio_venta;
      const descuentoPorcentaje = item.descuento_porcentaje || 0;
      const subtotalItem = precioUnitario * item.cantidad * (1 - descuentoPorcentaje / 100);
      const ivaItem = subtotalItem * (producto.iva_porcentaje / 100);

      subtotal += subtotalItem;
      ivaTotal += ivaItem;

      itemsConProducto.push({
        ...item,
        precio_unitario: precioUnitario,
        iva_porcentaje: producto.iva_porcentaje,
        subtotal: subtotalItem,
      });
    }

    const total = subtotal + ivaTotal - descuento;

    // Calculate paid and balance
    const totalPagado = pagos.reduce((sum, pago) => sum + parseFloat(pago.monto), 0);
    const saldo = total - totalPagado;

    // Check credit limit for credit sales
    if (tipo_venta === 'credito' && (cliente.saldo + saldo) > cliente.limite_credito) {
      return res.status(400).json({
        success: false,
        error: 'Límite de crédito excedido',
        data: {
          saldo_actual: cliente.saldo,
          limite_credito: cliente.limite_credito,
          saldo_nuevo: cliente.saldo + saldo,
        },
      });
    }

    // Create sale
    const saleResult = await client.query(
      `INSERT INTO ventas (
        cliente_id, usuario_id, turno_id, tipo_venta, tipo_comprobante,
        subtotal, descuento, iva, total, pagado, saldo, observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        cliente_id, req.user.id, turno_id, tipo_venta, tipo_comprobante,
        subtotal, descuento, ivaTotal, total, totalPagado, saldo, observaciones
      ]
    );

    const venta = saleResult.rows[0];

    // Create sale details and update stock
    for (const item of itemsConProducto) {
      // Insert detail
      await client.query(
        `INSERT INTO ventas_detalle (
          venta_id, producto_id, cantidad, precio_unitario,
          descuento_porcentaje, iva_porcentaje, subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          venta.id, item.producto_id, item.cantidad, item.precio_unitario,
          item.descuento_porcentaje || 0, item.iva_porcentaje, item.subtotal
        ]
      );

      // Update stock
      const stockResult = await client.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [item.producto_id]
      );
      const stockAnterior = stockResult.rows[0].stock_actual;
      const stockNuevo = parseFloat(stockAnterior) - parseFloat(item.cantidad);

      await client.query(
        'UPDATE productos SET stock_actual = $1 WHERE id = $2',
        [stockNuevo, item.producto_id]
      );

      // Register stock movement
      await client.query(
        `INSERT INTO movimientos_stock (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          referencia_id, referencia_tipo, created_by
        ) VALUES ($1, 'venta', $2, $3, $4, $5, 'venta', $6)`,
        [item.producto_id, item.cantidad, stockAnterior, stockNuevo, venta.id, req.user.id]
      );
    }

    // Register payments
    for (const pago of pagos) {
      await client.query(
        `INSERT INTO pagos (
          venta_id, cliente_id, turno_id, metodo, monto,
          referencia, banco, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          venta.id, cliente_id, turno_id, pago.metodo, pago.monto,
          pago.referencia, pago.banco, req.user.id
        ]
      );

      // Register cash movement if there's an open shift
      if (turno_id) {
        await client.query(
          `INSERT INTO movimientos_caja (
            turno_id, tipo, monto, concepto, medio_pago,
            referencia_id, created_by
          ) VALUES ($1, 'venta', $2, $3, $4, $5, $6)`,
          [
            turno_id, pago.monto,
            `Venta #${venta.numero_venta} - ${cliente.nombre}`,
            pago.metodo, venta.id, req.user.id
          ]
        );
      }
    }

    // Update client account if credit sale
    if (saldo > 0) {
      const saldoAnterior = cliente.saldo;
      const saldoNuevo = parseFloat(saldoAnterior) + saldo;

      await client.query(
        `INSERT INTO cuenta_corriente (
          cliente_id, tipo, monto, saldo_anterior, saldo_nuevo,
          concepto, referencia_id, referencia_tipo, created_by
        ) VALUES ($1, 'venta', $2, $3, $4, $5, $6, 'venta', $7)`,
        [
          cliente_id, saldo, saldoAnterior, saldoNuevo,
          `Venta #${venta.numero_venta}`, venta.id, req.user.id
        ]
      );
    }

    // Log audit
    await logAudit('ventas', venta.id, 'INSERT', null, venta, req.user, req);

    await client.query('COMMIT');

    logger.info(`Sale created: #${venta.numero_venta} - Total: ${total} - Cliente: ${cliente.nombre}`);

    res.status(201).json({
      success: true,
      data: venta,
      message: 'Venta creada exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating sale:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al crear venta',
    });
  } finally {
    client.release();
  }
};

/**
 * Get all sales with pagination
 */
export const getAllSales = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      cliente_id,
      usuario_id,
      tipo_venta,
      estado = 'completada',
      desde,
      hasta,
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (cliente_id) {
      conditions.push(`v.cliente_id = $${paramCount}`);
      params.push(cliente_id);
      paramCount++;
    }

    if (usuario_id) {
      conditions.push(`v.usuario_id = $${paramCount}`);
      params.push(usuario_id);
      paramCount++;
    }

    if (tipo_venta) {
      conditions.push(`v.tipo_venta = $${paramCount}`);
      params.push(tipo_venta);
      paramCount++;
    }

    if (estado !== 'all') {
      conditions.push(`v.estado = $${paramCount}`);
      params.push(estado);
      paramCount++;
    }

    if (desde) {
      conditions.push(`v.fecha >= $${paramCount}`);
      params.push(desde);
      paramCount++;
    }

    if (hasta) {
      conditions.push(`v.fecha <= $${paramCount}`);
      params.push(hasta);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ventas v ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get data
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        v.*,
        c.nombre as cliente_nombre,
        u.nombre || ' ' || u.apellido as vendedor_nombre
       FROM ventas v
       JOIN clientes c ON v.cliente_id = c.id
       JOIN usuarios u ON v.usuario_id = u.id
       ${whereClause}
       ORDER BY v.fecha DESC
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
    logger.error('Error getting sales:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener ventas',
    });
  }
};

/**
 * Get single sale by ID with details
 */
export const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get sale
    const saleResult = await pool.query(
      `SELECT 
        v.*,
        c.nombre as cliente_nombre,
        c.cuit as cliente_cuit,
        u.nombre || ' ' || u.apellido as vendedor_nombre
       FROM ventas v
       JOIN clientes c ON v.cliente_id = c.id
       JOIN usuarios u ON v.usuario_id = u.id
       WHERE v.id = $1`,
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Venta no encontrada',
      });
    }

    const venta = saleResult.rows[0];

    // Get sale details
    const detailsResult = await pool.query(
      `SELECT 
        vd.*,
        p.codigo as producto_codigo,
        p.nombre as producto_nombre,
        p.unidad_medida
       FROM ventas_detalle vd
       JOIN productos p ON vd.producto_id = p.id
       WHERE vd.venta_id = $1`,
      [id]
    );

    // Get payments
    const paymentsResult = await pool.query(
      'SELECT * FROM pagos WHERE venta_id = $1 ORDER BY fecha',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...venta,
        items: detailsResult.rows,
        pagos: paymentsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Error getting sale:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener venta',
    });
  }
};

/**
 * Cancel sale
 */
export const cancelSale = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    await client.query('BEGIN');

    // Get sale
    const saleResult = await client.query(
      'SELECT * FROM ventas WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Venta no encontrada',
      });
    }

    const venta = saleResult.rows[0];

    if (venta.estado === 'cancelada') {
      return res.status(400).json({
        success: false,
        error: 'La venta ya está cancelada',
      });
    }

    // Restore stock
    const detailsResult = await client.query(
      'SELECT producto_id, cantidad FROM ventas_detalle WHERE venta_id = $1',
      [id]
    );

    for (const item of detailsResult.rows) {
      const stockResult = await client.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [item.producto_id]
      );
      const stockAnterior = stockResult.rows[0].stock_actual;
      const stockNuevo = parseFloat(stockAnterior) + parseFloat(item.cantidad);

      await client.query(
        'UPDATE productos SET stock_actual = $1 WHERE id = $2',
        [stockNuevo, item.producto_id]
      );

      // Register stock movement
      await client.query(
        `INSERT INTO movimientos_stock (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          referencia_id, referencia_tipo, motivo, created_by
        ) VALUES ($1, 'devolucion', $2, $3, $4, $5, 'venta_cancelada', $6, $7)`,
        [item.producto_id, item.cantidad, stockAnterior, stockNuevo, id, motivo, req.user.id]
      );
    }

    // Update sale status
    await client.query(
      'UPDATE ventas SET estado = $1, observaciones = $2 WHERE id = $3',
      ['cancelada', (venta.observaciones || '') + ` | CANCELADA: ${motivo}`, id]
    );

    // Reverse account movement if exists
    if (venta.saldo > 0) {
      const clientResult = await client.query(
        'SELECT saldo FROM clientes WHERE id = $1',
        [venta.cliente_id]
      );
      const saldoAnterior = clientResult.rows[0].saldo;
      const saldoNuevo = parseFloat(saldoAnterior) - venta.saldo;

      await client.query(
        `INSERT INTO cuenta_corriente (
          cliente_id, tipo, monto, saldo_anterior, saldo_nuevo,
          concepto, referencia_id, referencia_tipo, created_by
        ) VALUES ($1, 'nota_credito', $2, $3, $4, $5, $6, 'venta_cancelada', $7)`,
        [
          venta.cliente_id, venta.saldo, saldoAnterior, saldoNuevo,
          `Cancelación venta #${venta.numero_venta}`, id, req.user.id
        ]
      );
    }

    await client.query('COMMIT');

    logger.info(`Sale cancelled: #${venta.numero_venta} - Motivo: ${motivo}`);

    res.json({
      success: true,
      message: 'Venta cancelada exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error cancelling sale:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cancelar venta',
    });
  } finally {
    client.release();
  }
};

export default {
  createSale,
  getAllSales,
  getSaleById,
  cancelSale,
};
