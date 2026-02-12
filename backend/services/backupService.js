/**
 * Backup Service
 * Handles automatic database backups for data protection
 * Supports manual and scheduled backups
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

// Configuration
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'solverdepos';
const DB_USER = process.env.DB_USER || 'postgres';
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS) || 30; // Keep last 30 backups

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir() {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    logger.info(`Created backup directory: ${BACKUP_DIR}`);
  }
}

/**
 * Generate backup filename
 * Format: backup_YYYY-MM-DD_HH-mm-ss.sql
 */
function generateBackupFilename() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .split('.')[0];
  
  return `backup_${timestamp}.sql`;
}

/**
 * Create database backup using pg_dump
 * @param {object} options - Backup options
 * @param {string} options.filename - Custom filename (optional)
 * @param {boolean} options.compress - Whether to compress backup (default: true)
 * @returns {Promise<object>} Backup result
 */
export async function createBackup(options = {}) {
  const {
    filename = generateBackupFilename(),
    compress = true
  } = options;
  
  try {
    await ensureBackupDir();
    
    const backupPath = path.join(BACKUP_DIR, filename);
    const finalPath = compress ? `${backupPath}.gz` : backupPath;
    
    logger.info(`Starting database backup: ${filename}`);
    
    // Build pg_dump command
    const dumpCommand = [
      'pg_dump',
      `-h ${DB_HOST}`,
      `-p ${DB_PORT}`,
      `-U ${DB_USER}`,
      `-d ${DB_NAME}`,
      '--no-owner',
      '--no-acl',
      '-F c', // Custom format (allows parallel restore)
      `-f ${backupPath}`
    ].join(' ');
    
    // Execute backup
    const startTime = Date.now();
    await execAsync(dumpCommand, {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }
    });
    
    // Compress if requested
    if (compress) {
      await execAsync(`gzip ${backupPath}`);
    }
    
    const duration = Date.now() - startTime;
    
    // Get file size
    const stats = await fs.stat(finalPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    const result = {
      success: true,
      filename: path.basename(finalPath),
      path: finalPath,
      size: `${sizeInMB} MB`,
      duration: `${(duration / 1000).toFixed(2)}s`,
      timestamp: new Date().toISOString()
    };
    
    logger.info(`Backup completed successfully: ${result.filename} (${result.size} in ${result.duration})`);
    
    // Clean old backups
    await cleanOldBackups();
    
    return result;
  } catch (error) {
    logger.error('Backup failed:', error);
    throw new Error(`Error creating backup: ${error.message}`);
  }
}

/**
 * List all available backups
 * @returns {Promise<array>} List of backups
 */
export async function listBackups() {
  try {
    await ensureBackupDir();
    
    const files = await fs.readdir(BACKUP_DIR);
    const backups = [];
    
    for (const file of files) {
      if (file.startsWith('backup_') && (file.endsWith('.sql') || file.endsWith('.sql.gz'))) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);
        
        backups.push({
          filename: file,
          path: filePath,
          size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    }
    
    // Sort by creation date (newest first)
    backups.sort((a, b) => b.created - a.created);
    
    return backups;
  } catch (error) {
    logger.error('Error listing backups:', error);
    throw new Error(`Error listing backups: ${error.message}`);
  }
}

/**
 * Delete old backups to keep only MAX_BACKUPS
 */
async function cleanOldBackups() {
  try {
    const backups = await listBackups();
    
    if (backups.length <= MAX_BACKUPS) {
      return;
    }
    
    // Delete oldest backups
    const toDelete = backups.slice(MAX_BACKUPS);
    
    for (const backup of toDelete) {
      await fs.unlink(backup.path);
      logger.info(`Deleted old backup: ${backup.filename}`);
    }
    
    logger.info(`Cleaned ${toDelete.length} old backups`);
  } catch (error) {
    logger.error('Error cleaning old backups:', error);
  }
}

/**
 * Restore database from backup
 * @param {string} filename - Backup filename
 * @returns {Promise<object>} Restore result
 */
export async function restoreBackup(filename) {
  try {
    const backupPath = path.join(BACKUP_DIR, filename);
    
    // Check if backup exists
    await fs.access(backupPath);
    
    logger.warn(`Starting database restore from: ${filename}`);
    logger.warn('WARNING: This will overwrite the current database!');
    
    // Decompress if needed
    let restorePath = backupPath;
    if (filename.endsWith('.gz')) {
      const decompressedPath = backupPath.replace('.gz', '');
      await execAsync(`gunzip -c ${backupPath} > ${decompressedPath}`);
      restorePath = decompressedPath;
    }
    
    // Build pg_restore command
    const restoreCommand = [
      'pg_restore',
      `-h ${DB_HOST}`,
      `-p ${DB_PORT}`,
      `-U ${DB_USER}`,
      `-d ${DB_NAME}`,
      '--clean', // Drop existing objects
      '--if-exists',
      '--no-owner',
      '--no-acl',
      restorePath
    ].join(' ');
    
    // Execute restore
    const startTime = Date.now();
    await execAsync(restoreCommand, {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }
    });
    
    const duration = Date.now() - startTime;
    
    // Clean up decompressed file if it was created
    if (restorePath !== backupPath) {
      await fs.unlink(restorePath);
    }
    
    const result = {
      success: true,
      filename,
      duration: `${(duration / 1000).toFixed(2)}s`,
      timestamp: new Date().toISOString()
    };
    
    logger.info(`Database restored successfully from ${filename} in ${result.duration}`);
    
    return result;
  } catch (error) {
    logger.error('Restore failed:', error);
    throw new Error(`Error restoring backup: ${error.message}`);
  }
}

/**
 * Download backup file
 * @param {string} filename - Backup filename
 * @returns {Promise<string>} Path to backup file
 */
export async function getBackupPath(filename) {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  // Verify file exists
  await fs.access(backupPath);
  
  return backupPath;
}

/**
 * Delete a specific backup
 * @param {string} filename - Backup filename
 * @returns {Promise<object>} Delete result
 */
export async function deleteBackup(filename) {
  try {
    const backupPath = path.join(BACKUP_DIR, filename);
    
    // Verify file exists
    await fs.access(backupPath);
    
    // Delete file
    await fs.unlink(backupPath);
    
    logger.info(`Backup deleted: ${filename}`);
    
    return {
      success: true,
      filename,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error deleting backup ${filename}:`, error);
    throw new Error(`Error deleting backup: ${error.message}`);
  }
}

/**
 * Schedule automatic backups
 * @param {object} cron - Node-cron instance
 * @param {string} schedule - Cron schedule (default: daily at 2 AM)
 */
export function scheduleBackups(cron, schedule = '0 2 * * *') {
  if (!cron) {
    logger.warn('Cron not available, automatic backups not scheduled');
    return null;
  }
  
  const task = cron.schedule(schedule, async () => {
    logger.info('Starting scheduled backup...');
    try {
      await createBackup();
    } catch (error) {
      logger.error('Scheduled backup failed:', error);
    }
  });
  
  logger.info(`Automatic backups scheduled: ${schedule}`);
  
  return task;
}

/**
 * Get backup statistics
 * @returns {Promise<object>} Backup statistics
 */
export async function getBackupStats() {
  try {
    const backups = await listBackups();
    
    const totalSize = backups.reduce((sum, backup) => {
      return sum + parseFloat(backup.size);
    }, 0);
    
    return {
      totalBackups: backups.length,
      totalSize: `${totalSize.toFixed(2)} MB`,
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
      newestBackup: backups.length > 0 ? backups[0].created : null,
      backupDir: BACKUP_DIR,
      maxBackups: MAX_BACKUPS
    };
  } catch (error) {
    logger.error('Error getting backup stats:', error);
    throw new Error(`Error getting backup stats: ${error.message}`);
  }
}

export default {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getBackupPath,
  scheduleBackups,
  getBackupStats
};
