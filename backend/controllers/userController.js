import { pool } from '../database/connection.js';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import config from '../config.js';

/**
 * User Controller - Complete user management CRUD operations
 */

// Get all users with pagination and filters
export const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      rol = '',
      status = 'activo',
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
      SELECT id, username, email, nombre, apellido, rol, status, 
             telefono, comision_porcentaje, ultimo_login, created_at
      FROM usuarios
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Search filter
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (nombre ILIKE $${paramCount} OR apellido ILIKE $${paramCount} OR username ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      paramCount++;
    }

    // Role filter
    if (rol) {
      params.push(rol);
      query += ` AND rol = $${paramCount}`;
      paramCount++;
    }

    // Status filter
    if (status && status !== 'all') {
      params.push(status);
      query += ` AND status = $${paramCount}`;
      paramCount++;
    }

    // Get total count
    const countResult = await pool.query(
      query.replace('SELECT id, username, email, nombre, apellido, rol, status, telefono, comision_porcentaje, ultimo_login, created_at', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    params.push(limit, offset);
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios',
    });
  }
};

// Get single user
export const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, username, email, nombre, apellido, rol, status, 
              telefono, comision_porcentaje, ultimo_login, created_at, updated_at
       FROM usuarios
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuario',
    });
  }
};

// Create new user
export const createUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      username,
      email,
      password,
      nombre,
      apellido,
      rol = 'vendedor',
      telefono,
      comision_porcentaje = 0,
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !nombre || !apellido) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos requeridos deben ser completados',
      });
    }

    // Check if username or email already exists
    const existingUser = await client.query(
      'SELECT id FROM usuarios WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de usuario o email ya existe',
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, config.security.bcryptRounds);

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO usuarios 
       (username, email, password_hash, nombre, apellido, rol, telefono, comision_porcentaje, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, email, nombre, apellido, rol, status, telefono, comision_porcentaje, created_at`,
      [username, email, password_hash, nombre, apellido, rol, telefono, comision_porcentaje, req.user.id]
    );

    await client.query('COMMIT');

    logger.info(`User created: ${username} by ${req.user.username}`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Usuario creado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear usuario',
    });
  } finally {
    client.release();
  }
};

// Update user
export const updateUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      email,
      nombre,
      apellido,
      rol,
      status,
      telefono,
      comision_porcentaje,
      password,
    } = req.body;

    // Check if user exists
    const userCheck = await client.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    await client.query('BEGIN');

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (nombre !== undefined) {
      updates.push(`nombre = $${paramCount++}`);
      values.push(nombre);
    }
    if (apellido !== undefined) {
      updates.push(`apellido = $${paramCount++}`);
      values.push(apellido);
    }
    if (rol !== undefined) {
      updates.push(`rol = $${paramCount++}`);
      values.push(rol);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (telefono !== undefined) {
      updates.push(`telefono = $${paramCount++}`);
      values.push(telefono);
    }
    if (comision_porcentaje !== undefined) {
      updates.push(`comision_porcentaje = $${paramCount++}`);
      values.push(comision_porcentaje);
    }
    if (password) {
      const password_hash = await bcrypt.hash(password, config.security.bcryptRounds);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(password_hash);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`updated_by = $${paramCount++}`);
    values.push(req.user.id);
    values.push(id);

    const result = await client.query(
      `UPDATE usuarios 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, username, email, nombre, apellido, rol, status, telefono, comision_porcentaje, updated_at`,
      values
    );

    await client.query('COMMIT');

    logger.info(`User updated: ${id} by ${req.user.username}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Usuario actualizado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar usuario',
    });
  } finally {
    client.release();
  }
};

// Delete user (soft delete by setting status to 'inactivo')
export const deleteUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Cannot delete yourself
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'No puedes eliminar tu propio usuario',
      });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE usuarios 
       SET status = 'inactivo', updated_at = CURRENT_TIMESTAMP, updated_by = $1
       WHERE id = $2
       RETURNING id, username`,
      [req.user.id, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
    }

    await client.query('COMMIT');

    logger.info(`User deleted: ${result.rows[0].username} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar usuario',
    });
  } finally {
    client.release();
  }
};
