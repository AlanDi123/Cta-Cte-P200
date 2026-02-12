/**
 * Product Controller
 * Business logic for product management
 */
import { pool } from '../database/connection.js';
import logger from '../utils/logger.js';
import { logAudit } from '../middleware/audit.js';

/**
 * Get all products with pagination and filters
 */
export const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      categoria = '',
      activo = 'true',
      stock_critico = 'false',
      orderBy = 'nombre',
      order = 'ASC',
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 1;

    // Filter by active status
    if (activo !== 'all') {
      conditions.push(`p.activo = $${paramCount}`);
      params.push(activo === 'true');
      paramCount++;
    }

    // Search filter
    if (search) {
      conditions.push(`(
        p.nombre ILIKE $${paramCount} OR 
        p.codigo ILIKE $${paramCount} OR 
        p.codigo_barras ILIKE $${paramCount} OR
        p.descripcion ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // Filter by category
    if (categoria) {
      conditions.push(`p.categoria_id = $${paramCount}`);
      params.push(categoria);
      paramCount++;
    }

    // Filter by critical stock
    if (stock_critico === 'true') {
      conditions.push('p.stock_actual <= p.stock_minimo');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM productos p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data with category name
    const validOrderBy = ['nombre', 'codigo', 'precio_venta', 'stock_actual', 'created_at'].includes(orderBy) ? orderBy : 'nombre';
    const validOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT 
        p.id, p.codigo, p.codigo_barras, p.nombre, p.descripcion,
        p.categoria_id, c.nombre as categoria_nombre,
        p.unidad_medida, p.precio_compra, p.precio_venta, p.precio_mayorista,
        p.margen_porcentaje, p.iva_porcentaje,
        p.stock_actual, p.stock_minimo, p.stock_maximo,
        p.permite_venta_sin_stock, p.activo, p.imagen_url,
        p.created_at, p.updated_at,
        CASE 
          WHEN p.stock_actual <= p.stock_minimo THEN 'CRÍTICO'
          WHEN p.stock_actual <= p.stock_minimo * 1.5 THEN 'BAJO'
          ELSE 'OK'
        END as estado_stock
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ${whereClause}
       ORDER BY p.${validOrderBy} ${validOrder}
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
    logger.error('Error getting products:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos',
    });
  }
};

/**
 * Get single product by ID
 */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        p.*,
        c.nombre as categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error getting product:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener producto',
    });
  }
};

/**
 * Create new product
 */
export const createProduct = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const {
      codigo,
      codigo_barras,
      nombre,
      descripcion,
      categoria_id,
      unidad_medida = 'unidad',
      precio_compra = 0,
      precio_venta,
      precio_mayorista,
      margen_porcentaje,
      iva_porcentaje = 21,
      stock_actual = 0,
      stock_minimo = 0,
      stock_maximo,
      permite_venta_sin_stock = false,
      imagen_url,
    } = req.body;

    // Validation
    if (!codigo || !nombre || !precio_venta) {
      return res.status(400).json({
        success: false,
        error: 'Código, nombre y precio de venta son requeridos',
      });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO productos (
        codigo, codigo_barras, nombre, descripcion, categoria_id,
        unidad_medida, precio_compra, precio_venta, precio_mayorista,
        margen_porcentaje, iva_porcentaje,
        stock_actual, stock_minimo, stock_maximo,
        permite_venta_sin_stock, imagen_url, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        codigo, codigo_barras, nombre.toUpperCase(), descripcion, categoria_id,
        unidad_medida, precio_compra, precio_venta, precio_mayorista,
        margen_porcentaje, iva_porcentaje,
        stock_actual, stock_minimo, stock_maximo,
        permite_venta_sin_stock, imagen_url, req.user.id
      ]
    );

    const newProduct = result.rows[0];

    // Log audit
    await logAudit('productos', newProduct.id, 'INSERT', null, newProduct, req.user, req);

    await client.query('COMMIT');

    logger.info(`Product created: ${newProduct.codigo} - ${newProduct.nombre}`);

    res.status(201).json({
      success: true,
      data: newProduct,
      message: 'Producto creado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({
        success: false,
        error: 'Ya existe un producto con ese código o código de barras',
      });
    }

    logger.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear producto',
    });
  } finally {
    client.release();
  }
};

/**
 * Update product
 */
export const updateProduct = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const updates = req.body;

    // Get current data for audit
    const currentResult = await client.query(
      'SELECT * FROM productos WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
      });
    }

    const currentData = currentResult.rows[0];

    await client.query('BEGIN');

    // Build update query
    const allowedFields = [
      'codigo_barras', 'nombre', 'descripcion', 'categoria_id',
      'unidad_medida', 'precio_compra', 'precio_venta', 'precio_mayorista',
      'margen_porcentaje', 'iva_porcentaje',
      'stock_minimo', 'stock_maximo',
      'permite_venta_sin_stock', 'activo', 'imagen_url'
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
      `UPDATE productos 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    const updatedProduct = result.rows[0];

    // Log audit
    await logAudit('productos', id, 'UPDATE', currentData, updatedProduct, req.user, req);

    await client.query('COMMIT');

    logger.info(`Product updated: ${updatedProduct.codigo} - ${updatedProduct.nombre}`);

    res.json({
      success: true,
      data: updatedProduct,
      message: 'Producto actualizado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar producto',
    });
  } finally {
    client.release();
  }
};

/**
 * Delete product (soft delete)
 */
export const deleteProduct = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    // Get current data
    const currentResult = await client.query(
      'SELECT * FROM productos WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
      });
    }

    const currentData = currentResult.rows[0];

    await client.query('BEGIN');

    // Soft delete
    await client.query(
      'UPDATE productos SET activo = false, updated_by = $1 WHERE id = $2',
      [req.user.id, id]
    );

    // Log audit
    await logAudit('productos', id, 'DELETE', currentData, null, req.user, req);

    await client.query('COMMIT');

    logger.info(`Product deactivated: ${currentData.codigo} - ${currentData.nombre}`);

    res.json({
      success: true,
      message: 'Producto desactivado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar producto',
    });
  } finally {
    client.release();
  }
};

/**
 * Get products with critical stock
 */
export const getCriticalStock = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.id, p.codigo, p.nombre, p.unidad_medida,
        p.stock_actual, p.stock_minimo,
        c.nombre as categoria_nombre,
        (p.stock_minimo - p.stock_actual) as faltante
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.stock_actual <= p.stock_minimo
         AND p.activo = true
       ORDER BY (p.stock_minimo - p.stock_actual) DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error getting critical stock:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener stock crítico',
    });
  }
};

/**
 * Adjust product stock manually
 */
export const adjustStock = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { cantidad, motivo = 'Ajuste manual' } = req.body;

    if (cantidad === undefined || cantidad === null) {
      return res.status(400).json({
        success: false,
        error: 'La cantidad es requerida',
      });
    }

    await client.query('BEGIN');

    // Get current stock
    const productResult = await client.query(
      'SELECT stock_actual, nombre FROM productos WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
      });
    }

    const stockAnterior = productResult.rows[0].stock_actual;
    const stockNuevo = parseFloat(stockAnterior) + parseFloat(cantidad);

    // Update stock
    await client.query(
      'UPDATE productos SET stock_actual = $1 WHERE id = $2',
      [stockNuevo, id]
    );

    // Register movement
    await client.query(
      `INSERT INTO movimientos_stock (
        producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
        motivo, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        cantidad > 0 ? 'ajuste' : 'ajuste',
        Math.abs(cantidad),
        stockAnterior,
        stockNuevo,
        motivo,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    logger.info(`Stock adjusted for product ${id}: ${stockAnterior} -> ${stockNuevo}`);

    res.json({
      success: true,
      message: 'Stock ajustado exitosamente',
      data: {
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        cantidad_ajustada: cantidad,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adjusting stock:', error);
    res.status(500).json({
      success: false,
      error: 'Error al ajustar stock',
    });
  } finally {
    client.release();
  }
};

/**
 * Get all categories
 */
export const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categorias WHERE activo = true ORDER BY nombre'
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener categorías',
    });
  }
};

export default {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCriticalStock,
  adjustStock,
  getCategories,
};
