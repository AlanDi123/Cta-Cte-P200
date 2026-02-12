/**
 * Sales Controller
 * Business logic for sales management
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';
import { generateIdempotencyKey } from '../middleware/idempotency.js';
import webSocketServer from '../utils/websocket.js';
import cacheManager, { CacheKeys, CacheTTL } from '../utils/cache.js';

/**
 * Generate idempotency key from request (wrapper for async import)
 */
const getIdempotencyKey = async (req, body) => {
  return generateIdempotencyKey(req, body);
};

/**
 * Create new sale with full concurrency protection
 */
export const createSale = async (req, res) => {
  const client = await pool.connect();
  let idempotency_key = null;
  
  try {
    const {
      cliente_id,
      turno_id,
      tipo_venta,
      items, // [{producto_id, cantidad, precio_unitario, descuento_porcentaje}]
      descuento = 0,
      tipo_comprobante = 'B',
      observaciones,
      pagos = [], // [{metodo, monto, referencia, banco, idempotency_key}]
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

    // Generate idempotency key for duplicate detection
    idempotency_key = await getIdempotencyKey(req, req.body);
    
    // Check if this sale already exists (idempotent operation)
    const existingSale = await client.query(
      'SELECT id, numero_venta, total, estado FROM ventas WHERE idempotency_key = $1',
      [idempotency_key]
    );
    
    if (existingSale.rows.length > 0) {
      const existing = existingSale.rows[0];
      logger.info(`Duplicate sale request detected, returning existing sale #${existing.numero_venta}`);
      
      // Return the existing sale (idempotent response)
      const saleDetails = await getSaleByIdInternal(client, existing.id);
      return res.status(200).json({
        success: true,
        data: saleDetails,
        message: 'Venta ya existente (duplicada)',
        isDuplicate: true,
      });
    }

    // Start transaction with SERIALIZABLE isolation for maximum consistency
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Set current user in session for audit triggers
    await client.query(`SET LOCAL app.current_user_id = '${req.user.id}'`);
    
    // Lock client for balance update (SELECT FOR UPDATE)
    const clientResult = await client.query(
      `SELECT nombre, saldo, limite_credito, version 
       FROM clientes 
       WHERE id = $1 AND activo = true
       FOR UPDATE`,
      [cliente_id]
    );

    if (clientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado o inactivo',
      });
    }

    const cliente = clientResult.rows[0];

    // Calculate totals and validate stock with locking
    let subtotal = 0;
    let ivaTotal = 0;
    const itemsConProducto = [];

    for (const item of items) {
      // Lock product for stock update (SELECT FOR UPDATE) - prevents race conditions
      const productResult = await client.query(
        `SELECT id, precio_venta, iva_porcentaje, stock_actual, stock_minimo,
                permite_venta_sin_stock, version
         FROM productos 
         WHERE id = $1 AND activo = true
         FOR UPDATE`,
        [item.producto_id]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Producto ${item.producto_id} no encontrado`);
      }

      const producto = productResult.rows[0];

      // Check available stock (accounting for concurrent reservations)
      const stockDisponibleResult = await client.query(
        'SELECT stock_disponible($1) as disponible',
        [item.producto_id]
      );
      const stockDisponible = stockDisponibleResult.rows[0].disponible;

      // Strict stock validation - prevents negative stock
      if (!producto.permite_venta_sin_stock && stockDisponible < item.cantidad) {
        throw new Error(
          `Stock insuficiente para producto ${item.producto_id}. ` +
          `Disponible: ${stockDisponible}, Solicitado: ${item.cantidad}`
        );
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

    // Check credit limit for credit sales with current locked balance
    if (tipo_venta === 'credito' && (cliente.saldo + saldo) > cliente.limite_credito) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Límite de crédito excedido',
        data: {
          saldo_actual: cliente.saldo,
          limite_credito: cliente.limite_credito,
          saldo_nuevo: parseFloat(cliente.saldo) + saldo,
          excedente: (parseFloat(cliente.saldo) + saldo) - cliente.limite_credito,
        },
      });
    }

    // Create sale with idempotency key and request metadata
    const request_ip = req.ip || req.connection.remoteAddress;
    const user_agent = req.get('user-agent');
    
    const saleResult = await client.query(
      `INSERT INTO ventas (
        cliente_id, usuario_id, turno_id, tipo_venta, tipo_comprobante,
        subtotal, descuento, iva, total, pagado, saldo, observaciones,
        idempotency_key, request_ip, user_agent,
        processing_started_at, processing_completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        cliente_id, req.user.id, turno_id, tipo_venta, tipo_comprobante,
        subtotal, descuento, ivaTotal, total, totalPagado, saldo, observaciones,
        idempotency_key, request_ip, user_agent
      ]
    );

    const venta = saleResult.rows[0];

    // Create sale details and update stock atomically
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

      // Update stock atomically (product is already locked with FOR UPDATE)
      const stockResult = await client.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [item.producto_id]
      );
      const stockAnterior = stockResult.rows[0].stock_actual;
      const stockNuevo = parseFloat(stockAnterior) - parseFloat(item.cantidad);
      
      // Prevent negative stock (double-check)
      if (stockNuevo < 0) {
        throw new Error(
          `Operación rechazada: stock negativo para producto ${item.producto_id}. ` +
          `Stock anterior: ${stockAnterior}, Cantidad solicitada: ${item.cantidad}`
        );
      }

      await client.query(
        'UPDATE productos SET stock_actual = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
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

    // Register payments with idempotency
    for (const pago of pagos) {
      // Generate payment idempotency key
      const pagoIdempotencyKey = pago.idempotency_key || 
        `${idempotency_key}-pago-${pago.metodo}-${pago.monto}`;
      
      // Check if payment already exists
      const existingPayment = await client.query(
        'SELECT id, metodo, monto FROM pagos WHERE idempotency_key = $1',
        [pagoIdempotencyKey]
      );
      
      let pagoId;
      if (existingPayment.rows.length > 0) {
        // Payment already exists - verify it matches
        const existing = existingPayment.rows[0];
        if (existing.metodo !== pago.metodo || parseFloat(existing.monto) !== parseFloat(pago.monto)) {
          throw new Error(
            `Payment idempotency conflict: existing payment (${existing.metodo}, ${existing.monto}) ` +
            `does not match attempted payment (${pago.metodo}, ${pago.monto})`
          );
        }
        pagoId = existing.id;
        logger.debug(`Payment already exists, skipping: ${pagoId}`);
      } else {
        // Insert new payment
        const pagoResult = await client.query(
          `INSERT INTO pagos (
            venta_id, cliente_id, turno_id, metodo, monto,
            referencia, banco, created_by, idempotency_key, request_ip
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id`,
          [
            venta.id, cliente_id, turno_id, pago.metodo, pago.monto,
            pago.referencia, pago.banco, req.user.id, pagoIdempotencyKey, request_ip
          ]
        );
        pagoId = pagoResult.rows[0].id;
      }

      // Only create cash movement if payment was newly inserted and there's a shift
      if (existingPayment.rows.length === 0 && turno_id) {
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

    // Update client account if credit sale (with locked balance)
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
      
      // Update client balance atomically
      await client.query(
        'UPDATE clientes SET saldo = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [saldoNuevo, cliente_id]
      );
    }

    // Commit transaction - all or nothing
    await client.query('COMMIT');

    logger.info(`Sale created: #${venta.numero_venta} - Total: ${total} - Cliente: ${cliente.nombre} - Idempotency: ${idempotency_key}`);

    // Invalidate relevant caches
    await Promise.all([
      cacheManager.delPattern('sales:*'),
      cacheManager.delPattern('dashboard:*'),
      ...itemsConProducto.map(item => cacheManager.del(CacheKeys.productStock(item.producto_id))),
      cacheManager.del(CacheKeys.clientBalance(cliente_id)),
    ]);

    // Broadcast real-time updates
    webSocketServer.emitNewSale({
      id: venta.id,
      numero_venta: venta.numero_venta,
      total: venta.total,
      cliente_nombre: cliente.nombre,
    });

    // Broadcast stock updates for affected products
    for (const item of itemsConProducto) {
      // Get updated stock from database
      const updatedStock = await client.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [item.producto_id]
      );
      
      webSocketServer.emitStockUpdate(item.producto_id, {
        stock_actual: parseFloat(updatedStock.rows[0].stock_actual),
      });
    }

    // Broadcast client balance update
    if (saldo > 0) {
      webSocketServer.emitClientBalanceUpdate(cliente_id, {
        saldo: parseFloat(cliente.saldo) + saldo,
      });
    }

    res.status(201).json({
      success: true,
      data: venta,
      message: 'Venta creada exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating sale:', error);
    
    // Check if it's a serialization error (concurrent transaction conflict)
    if (error.code === '40001' || error.code === '40P01') {
      return res.status(409).json({
        success: false,
        error: 'Conflicto de concurrencia detectado. Por favor, reintente la operación.',
        code: 'CONCURRENT_MODIFICATION',
        retryable: true,
      });
    }
    
    // Check if it's a duplicate key error
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Operación duplicada detectada.',
        code: 'DUPLICATE_OPERATION',
        retryable: false,
      });
    }
    
    // Check if it's a business validation error (stock, credit, etc.)
    if (error.message && (
      error.message.includes('stock insuficiente') ||
      error.message.includes('Stock insuficiente') ||
      error.message.includes('stock negativo') ||
      error.message.includes('Payment idempotency conflict')
    )) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'VALIDATION_ERROR',
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error al crear venta',
    });
  } finally {
    client.release();
  }
};

/**
 * Helper function to get sale by ID (internal use)
 */
const getSaleByIdInternal = async (client, id) => {
  // Get sale
  const saleResult = await client.query(
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
    return null;
  }

  const venta = saleResult.rows[0];

  // Get sale details
  const detailsResult = await client.query(
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
  const paymentsResult = await client.query(
    'SELECT * FROM pagos WHERE venta_id = $1 ORDER BY fecha',
    [id]
  );

  return {
    ...venta,
    items: detailsResult.rows,
    pagos: paymentsResult.rows,
  };
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
