/**
 * Authentication Routes
 */
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../database/connection.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/v1/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son requeridos',
      });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 AND status = $2',
      [username, 'activo']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña incorrectos',
      });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña incorrectos',
      });
    }

    // Update last login
    await pool.query(
      'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, rol: user.rol },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiresIn }
    );

    logger.info(`User logged in: ${username}`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          rol: user.rol,
        },
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión',
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * User logout (client-side token removal)
 */
router.post('/logout', authenticate, async (req, res) => {
  // In a JWT-based auth, logout is mainly client-side
  // But we can log it for audit purposes
  logger.info(`User logged out: ${req.user.username}`);
  
  res.json({
    success: true,
    message: 'Sesión cerrada exitosamente',
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    // Generate new token
    const token = jwt.sign(
      { userId: req.user.id, username: req.user.username, rol: req.user.rol },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiresIn }
    );

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al refrescar token',
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      nombre: req.user.nombre,
      apellido: req.user.apellido,
      rol: req.user.rol,
    },
  });
});

/**
 * POST /api/v1/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva son requeridas',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres',
      });
    }

    // Get current user with password
    const result = await pool.query(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta',
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, req.user.id]
    );

    logger.info(`Password changed for user: ${req.user.username}`);

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente',
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar contraseña',
    });
  }
});

export default router;
