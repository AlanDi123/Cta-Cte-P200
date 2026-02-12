/**
 * Credit Notes Controller
 * Handle credit notes (notas de crédito) for returns and adjustments
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { generateIdempotencyKey } from '../middleware/idempotency.js';
import webSocketServer from '../utils/websocket.js';
import cacheManager, { CacheKeys } from '../utils/cache.js';

/**
 * Create credit note
 */
export const createCreditNote = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      cliente_id,
      venta_id,
      tipo,
      monto,
      motivo,
      observaciones,
      productos = [], // [{producto_id, cantidad, precio_unitario, motivo}]
    } = req.body;

    // Validation
    if (!cliente_id || !tipo || !monto || !motivo) {
      return res.status(400).json({
        success: false,
        error: 'Cliente, tipo, monto y motivo son requeridos',
      });
    }

    if (monto <= 0) {
      return res.status(400).json({
        success: false,
        error: 'El monto debe ser mayor a cero',
      });
    }

    // Generate idempotency key
    const idempotency_key = generateIdempotencyKey(req, req.body);

    // Check for duplicate
    const existing = await client.query(
      'SELECT id, numero FROM notas_credito WHERE idempotency_key = $1',
      [idempotency_key]
    );

    if (existing.rows.length > 0) {
      logger.info(`Duplicate credit note request, returning existing #${existing.rows[0].numero}`);
      
      const existingNote = await client.query(
        'SELECT * FROM notas_credito WHERE id = $1',
        [existing.rows[0].id]
      );
      
      return res.status(200).json({
        success: true,
        data: existingNote.rows[0],
        message: 'Nota de crédito ya existente',
        isDuplicate: true,
      });
    }

    await client.query('BEGIN');

    // Verify client exists
    const clientResult = await client.query(
      'SELECT id, nombre, saldo FROM clientes WHERE id = $1 AND activo = true',
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

    // If related to a sale, verify it exists
    if (venta_id) {
      const saleResult = await client.query(
        'SELECT id, numero_venta FROM ventas WHERE id = $1 AND cliente_id = $2',
        [venta_id, cliente_id]
      );

      if (saleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Venta no encontrada o no pertenece al cliente',
        });
      }
    }

    // Create credit note
    const noteResult = await client.query(
      `INSERT INTO notas_credito (
        cliente_id, venta_id, tipo, monto, motivo, observaciones,
        created_by, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [cliente_id, venta_id, tipo, monto, motivo, observaciones, req.user.id, idempotency_key]
    );

    const nota = noteResult.rows[0];

    // Add product details if provided
    for (const producto of productos) {
      await client.query(
        `INSERT INTO notas_credito_detalle (
          nota_credito_id, producto_id, cantidad, precio_unitario, subtotal, motivo
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          nota.id,
          producto.producto_id,
          producto.cantidad,
          producto.precio_unitario,
          producto.cantidad * producto.precio_unitario,
          producto.motivo
        ]
      );
    }

    await client.query('COMMIT');

    logger.info(`Credit note created: #${nota.numero} - Cliente: ${cliente.nombre} - Monto: $${monto}`);

    // Invalidate cache
    await cacheManager.del(CacheKeys.clientBalance(cliente_id));

    res.status(201).json({
      success: true,
      data: nota,
      message: 'Nota de crédito creada exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating credit note:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Nota de crédito duplicada',
        code: 'DUPLICATE_CREDIT_NOTE',
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error al crear nota de crédito',
    });
  } finally {
    client.release();
  }
};

/**
 * Apply credit note to client balance
 */
export const applyCreditNote = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Get credit note
    const noteResult = await client.query(
      'SELECT * FROM notas_credito WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (noteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Nota de crédito no encontrada',
      });
    }

    const nota = noteResult.rows[0];

    if (nota.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Nota de crédito ya fue ${nota.estado}`,
      });
    }

    // Apply credit note using database function
    await client.query(
      'SELECT aplicar_nota_credito($1, $2)',
      [id, req.user.id]
    );

    await client.query('COMMIT');

    // Get updated credit note
    const updatedNote = await client.query(
      'SELECT * FROM notas_credito WHERE id = $1',
      [id]
    );

    logger.info(`Credit note applied: #${nota.numero} - Monto: $${nota.monto}`);

    // Invalidate cache and broadcast update
    await cacheManager.del(CacheKeys.clientBalance(nota.cliente_id));
    webSocketServer.emitClientBalanceUpdate(nota.cliente_id, {
      action: 'credit_note_applied',
      monto: nota.monto,
    });

    res.json({
      success: true,
      data: updatedNote.rows[0],
      message: 'Nota de crédito aplicada exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error applying credit note:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al aplicar nota de crédito',
    });
  } finally {
    client.release();
  }
};

/**
 * Cancel credit note
 */
export const cancelCreditNote = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT anular_nota_credito($1)',
      [id]
    );

    logger.info(`Credit note cancelled: ${id}`);

    res.json({
      success: true,
      message: 'Nota de crédito anulada exitosamente',
    });
  } catch (error) {
    logger.error('Error cancelling credit note:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al anular nota de crédito',
    });
  }
};

/**
 * Get all credit notes
 */
export const getAllCreditNotes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      cliente_id,
      estado,
      tipo,
      desde,
      hasta,
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (cliente_id) {
      conditions.push(`nc.cliente_id = $${paramCount}`);
      params.push(cliente_id);
      paramCount++;
    }

    if (estado) {
      conditions.push(`nc.estado = $${paramCount}`);
      params.push(estado);
      paramCount++;
    }

    if (tipo) {
      conditions.push(`nc.tipo = $${paramCount}`);
      params.push(tipo);
      paramCount++;
    }

    if (desde) {
      conditions.push(`nc.fecha_emision >= $${paramCount}`);
      params.push(desde);
      paramCount++;
    }

    if (hasta) {
      conditions.push(`nc.fecha_emision <= $${paramCount}`);
      params.push(hasta);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notas_credito nc ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get data
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        nc.*,
        c.nombre as cliente_nombre,
        u.nombre || ' ' || u.apellido as creado_por_nombre,
        v.numero_venta
       FROM notas_credito nc
       JOIN clientes c ON nc.cliente_id = c.id
       LEFT JOIN usuarios u ON nc.created_by = u.id
       LEFT JOIN ventas v ON nc.venta_id = v.id
       ${whereClause}
       ORDER BY nc.fecha_emision DESC
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
    logger.error('Error getting credit notes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener notas de crédito',
    });
  }
};

/**
 * Get credit note by ID
 */
export const getCreditNoteById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        nc.*,
        c.nombre as cliente_nombre,
        c.cuit as cliente_cuit,
        u.nombre || ' ' || u.apellido as creado_por_nombre,
        v.numero_venta
       FROM notas_credito nc
       JOIN clientes c ON nc.cliente_id = c.id
       LEFT JOIN usuarios u ON nc.created_by = u.id
       LEFT JOIN ventas v ON nc.venta_id = v.id
       WHERE nc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nota de crédito no encontrada',
      });
    }

    // Get details
    const detailsResult = await pool.query(
      `SELECT 
        ncd.*,
        p.codigo as producto_codigo,
        p.nombre as producto_nombre
       FROM notas_credito_detalle ncd
       LEFT JOIN productos p ON ncd.producto_id = p.id
       WHERE ncd.nota_credito_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        detalles: detailsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Error getting credit note:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener nota de crédito',
    });
  }
};

export default {
  createCreditNote,
  applyCreditNote,
  cancelCreditNote,
  getAllCreditNotes,
  getCreditNoteById,
};
