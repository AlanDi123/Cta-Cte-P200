/**
 * Backup Controller
 * API endpoints for backup management
 */

import backupService from '../services/backupService.js';
import logger from '../utils/logger.js';
import { ForbiddenError, ApplicationError } from '../middleware/errorHandler.js';

/**
 * Create a manual backup
 * POST /api/v1/backup/create
 */
export const createBackup = async (req, res, next) => {
  try {
    // Only admin/owner can create backups
    if (!['dueño', 'administrativo'].includes(req.user.rol)) {
      throw new ForbiddenError('Solo administradores pueden crear backups');
    }

    const { compress = true } = req.body;

    const result = await backupService.createBackup({ compress });

    logger.info(`Manual backup created by ${req.user.username}: ${result.filename}`);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Backup creado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all backups
 * GET /api/v1/backup/list
 */
export const listBackups = async (req, res, next) => {
  try {
    // Only admin/owner can list backups
    if (!['dueño', 'administrativo', 'contabilidad'].includes(req.user.rol)) {
      throw new ForbiddenError('No tiene permisos para ver backups');
    }

    const backups = await backupService.listBackups();

    res.json({
      success: true,
      data: backups,
      total: backups.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download a backup file
 * GET /api/v1/backup/download/:filename
 */
export const downloadBackup = async (req, res, next) => {
  try {
    // Only admin/owner can download backups
    if (!['dueño', 'administrativo'].includes(req.user.rol)) {
      throw new ForbiddenError('Solo administradores pueden descargar backups');
    }

    const { filename } = req.params;

    const backupPath = await backupService.getBackupPath(filename);

    logger.info(`Backup download initiated by ${req.user.username}: ${filename}`);

    res.download(backupPath, filename, (error) => {
      if (error) {
        logger.error(`Error downloading backup ${filename}:`, error);
        if (!res.headersSent) {
          next(new ApplicationError('Error al descargar backup', 500));
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a backup
 * DELETE /api/v1/backup/:filename
 */
export const deleteBackup = async (req, res, next) => {
  try {
    // Only owner can delete backups
    if (req.user.rol !== 'dueño') {
      throw new ForbiddenError('Solo el dueño puede eliminar backups');
    }

    const { filename } = req.params;

    const result = await backupService.deleteBackup(filename);

    logger.warn(`Backup deleted by ${req.user.username}: ${filename}`);

    res.json({
      success: true,
      data: result,
      message: 'Backup eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore from backup
 * POST /api/v1/backup/restore
 */
export const restoreBackup = async (req, res, next) => {
  try {
    // Only owner can restore backups
    if (req.user.rol !== 'dueño') {
      throw new ForbiddenError('Solo el dueño puede restaurar backups');
    }

    const { filename, confirm } = req.body;

    if (!filename) {
      throw new ApplicationError('Nombre de archivo requerido', 400);
    }

    if (!confirm || confirm !== 'CONFIRMO_RESTAURAR') {
      throw new ApplicationError(
        'Debe confirmar la restauración enviando confirm: "CONFIRMO_RESTAURAR"',
        400
      );
    }

    logger.warn(`DATABASE RESTORE INITIATED by ${req.user.username} from ${filename}`);

    const result = await backupService.restoreBackup(filename);

    logger.warn(`Database restored successfully from ${filename}`);

    res.json({
      success: true,
      data: result,
      message: 'Base de datos restaurada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get backup statistics
 * GET /api/v1/backup/stats
 */
export const getBackupStats = async (req, res, next) => {
  try {
    // Only admin/owner can view stats
    if (!['dueño', 'administrativo'].includes(req.user.rol)) {
      throw new ForbiddenError('No tiene permisos para ver estadísticas de backup');
    }

    const stats = await backupService.getBackupStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  getBackupStats
};
