/**
 * Backup Routes
 * API routes for backup management
 */

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
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

// Backup operations
router.post('/create', authorize(['dueño', 'administrativo']), createBackup);
router.get('/list', authorize(['dueño', 'administrativo', 'contabilidad']), listBackups);
router.get('/stats', authorize(['dueño', 'administrativo']), getBackupStats);
router.get('/download/:filename', authorize(['dueño', 'administrativo']), downloadBackup);
router.delete('/:filename', authorize(['dueño']), deleteBackup);
router.post('/restore', authorize(['dueño']), restoreBackup);

export default router;
