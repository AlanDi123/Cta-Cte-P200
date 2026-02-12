/**
 * Backup Routes
 * API routes for backup management
 */

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { backupLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import {
  createBackup,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  getBackupStats
} from '../controllers/backupController.js';

const router = express.Router();

// All backup routes require authentication
router.use(authenticate);

// Backup operations with rate limiting
router.post('/create', backupLimiter, authorize(['dueño', 'administrativo']), createBackup);
router.get('/list', authorize(['dueño', 'administrativo', 'contabilidad']), listBackups);
router.get('/stats', authorize(['dueño', 'administrativo']), getBackupStats);
router.get('/download/:filename', strictLimiter, authorize(['dueño', 'administrativo']), downloadBackup);
router.delete('/:filename', strictLimiter, authorize(['dueño']), deleteBackup);
router.post('/restore', strictLimiter, authorize(['dueño']), restoreBackup);

export default router;
