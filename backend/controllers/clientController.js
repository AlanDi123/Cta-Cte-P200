/**
 * Client Controller
 * Business logic for client management
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';

/**
 * Get all clients with pagination and filters
 */
export const getAllClients = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      tipo = '',
      activo = 'true',
      orderBy = 'nombre',
      order = 'ASC',
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    // Filter by active status
    if (activo !== 'all') {
      conditions.push(`activo = $${paramCount}`);
      params.push(activo === 'true');
      paramCount++;
    }

    // Search filter
    if (search) {
      conditions.push(`(
        nombre ILIKE $${paramCount} OR 
        razon_social ILIKE $${paramCount} OR 
        cuit ILIKE $${paramCount} OR 
        codigo ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // Filter by client type
    if (tipo) {
      conditions.push(`tipo_cliente = $${paramCount}`);
      params.push(tipo);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM clientes ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const validOrderBy = ['nombre', 'codigo', 'saldo', 'limite_credito', 'created_at'].includes(orderBy) ? orderBy : 'nombre';
    const validOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        id, codigo, nombre, razon_social, cuit, condicion_fiscal, tipo_cliente,
        telefono, email, domicilio_fiscal, ciudad, provincia, codigo_postal,
        limite_credito, saldo, descuento_porcentaje, observaciones, activo,
        created_at, updated_at
       FROM clientes
       ${whereClause}
       ORDER BY ${validOrderBy} ${validOrder}
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
    logger.error('Error getting clients:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener clientes',
    });
  }
};

/**
 * Get single client by ID
 */
export const getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM clientes WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error getting client:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cliente',
    });
  }
};

/**
 * Create new client
 */
export const createClient = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      codigo,
      nombre,
      razon_social,
      cuit,
      condicion_fiscal = 'consumidor_final',
      tipo_cliente = 'minorista',
      telefono,
      email,
      domicilio_fiscal,
      ciudad,
      provincia,
      codigo_postal,
      limite_credito = 50000,
      descuento_porcentaje = 0,
      observaciones,
    } = req.body;

    // Validation
    if (!nombre) {
      return res.status(400).json({
        success: false,
        error: 'El nombre del cliente es requerido',
      });
    }

    await client.query('BEGIN');

    // Generate codigo if not provided
    let clientCodigo = codigo;
    if (!clientCodigo) {
      const countResult = await client.query('SELECT COUNT(*) FROM clientes');
      const count = parseInt(countResult.rows[0].count) + 1;
      clientCodigo = `CLI${String(count).padStart(4, '0')}`;
    }

    const result = await client.query(
      `INSERT INTO clientes (
        codigo, nombre, razon_social, cuit, condicion_fiscal, tipo_cliente,
        telefono, email, domicilio_fiscal, ciudad, provincia, codigo_postal,
        limite_credito, saldo, descuento_porcentaje, observaciones,
        created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
      RETURNING *`,
      [
        clientCodigo, nombre.toUpperCase(), razon_social, cuit, condicion_fiscal, tipo_cliente,
        telefono, email, domicilio_fiscal, ciudad, provincia, codigo_postal,
        limite_credito, 0, descuento_porcentaje, observaciones,
        req.user.id
      ]
    );

    const newClient = result.rows[0];

    // Log audit
    await logAudit('clientes', newClient.id, 'INSERT', null, newClient, req.user, req);

    await client.query('COMMIT');

    logger.info(`Client created: ${newClient.codigo} - ${newClient.nombre}`);

    res.status(201).json({
      success: true,
      data: newClient,
      message: 'Cliente creado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        error: 'Ya existe un cliente con ese código o CUIT',
      });
    }

    logger.error('Error creating client:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear cliente',
    });
  } finally {
    client.release();
  }
};

/**
 * Update client
 */
export const updateClient = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const updates = req.body;

    // Get current data for audit
    const currentResult = await client.query(
      'SELECT * FROM clientes WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }

    const currentData = currentResult.rows[0];

    await client.query('BEGIN');

    // Build update query
    const allowedFields = [
      'nombre', 'razon_social', 'cuit', 'condicion_fiscal', 'tipo_cliente',
      'telefono', 'email', 'domicilio_fiscal', 'ciudad', 'provincia', 'codigo_postal',
      'limite_credito', 'descuento_porcentaje', 'observaciones', 'activo'
    ];

    const updateFields = [];
    const params = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        params.push(key === 'nombre' ? updates[key].toUpperCase() : updates[key]);
        paramCount++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos válidos para actualizar',
      });
    }

    // Add updated_by
    updateFields.push(`updated_by = $${paramCount}`);
    params.push(req.user.id);
    paramCount++;

    // Add id for WHERE clause
    params.push(id);

    const result = await client.query(
      `UPDATE clientes 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    const updatedClient = result.rows[0];

    // Log audit
    await logAudit('clientes', id, 'UPDATE', currentData, updatedClient, req.user, req);

    await client.query('COMMIT');

    logger.info(`Client updated: ${updatedClient.codigo} - ${updatedClient.nombre}`);

    res.json({
      success: true,
      data: updatedClient,
      message: 'Cliente actualizado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating client:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar cliente',
    });
  } finally {
    client.release();
  }
};

/**
 * Delete client (soft delete)
 */
export const deleteClient = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Get current data
    const currentResult = await client.query(
      'SELECT * FROM clientes WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }

    const currentData = currentResult.rows[0];

    await client.query('BEGIN');

    // Soft delete
    await client.query(
      'UPDATE clientes SET activo = false, updated_by = $1 WHERE id = $2',
      [req.user.id, id]
    );

    // Log audit
    await logAudit('clientes', id, 'DELETE', currentData, null, req.user, req);

    await client.query('COMMIT');

    logger.info(`Client deactivated: ${currentData.codigo} - ${currentData.nombre}`);

    res.json({
      success: true,
      message: 'Cliente desactivado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting client:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar cliente',
    });
  } finally {
    client.release();
  }
};

/**
 * Get client account statement (cuenta corriente)
 */
export const getClientAccountStatement = async (req, res) => {
  try {
    const { id } = req.params;
    const { desde, hasta } = req.query;

    // Verify client exists
    const clientResult = await pool.query(
      'SELECT nombre, saldo, limite_credito FROM clientes WHERE id = $1',
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado',
      });
    }

    const client = clientResult.rows[0];

    // Build date filter
    const conditions = ['cliente_id = $1'];
    const params = [id];
    let paramCount = 2;

    if (desde) {
      conditions.push(`fecha >= $${paramCount}`);
      params.push(desde);
      paramCount++;
    }

    if (hasta) {
      conditions.push(`fecha <= $${paramCount}`);
      params.push(hasta);
      paramCount++;
    }

    // Get movements
    const movementsResult = await pool.query(
      `SELECT 
        id, tipo, monto, saldo_anterior, saldo_nuevo,
        concepto, fecha, vencimiento, created_at
       FROM cuenta_corriente
       WHERE ${conditions.join(' AND ')}
       ORDER BY fecha DESC, created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: {
        cliente: {
          nombre: client.nombre,
          saldo_actual: client.saldo,
          limite_credito: client.limite_credito,
          credito_disponible: client.limite_credito - client.saldo,
        },
        movimientos: movementsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Error getting account statement:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cuenta corriente',
    });
  }
};

/**
 * Get clients with overdue debt
 */
export const getOverdueClients = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT
        c.id, c.codigo, c.nombre, c.telefono, c.saldo, c.limite_credito,
        cc.vencimiento,
        DATE_PART('day', CURRENT_DATE - cc.vencimiento) as dias_vencido
       FROM clientes c
       INNER JOIN cuenta_corriente cc ON c.id = cc.cliente_id
       WHERE cc.vencimiento < CURRENT_DATE
         AND cc.tipo IN ('debe', 'venta')
         AND c.saldo > 0
         AND c.activo = true
       ORDER BY dias_vencido DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error getting overdue clients:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener clientes con deuda vencida',
    });
  }
};

export default {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientAccountStatement,
  getOverdueClients,
};
