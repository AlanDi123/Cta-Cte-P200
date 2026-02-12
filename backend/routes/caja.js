/**
 * Cash Register (Caja) Routes
 */
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { cajaLimiter } from '../middleware/rateLimiter.js';
import {
  openShift,
  closeShift,
  getCurrentShift,
  registerMovement,
  getShiftMovements,
  getCashRegisters,
  getShiftHistory,
  forceCloseShift,
} from '../controllers/cajaController.js';

const router = express.Router();

// All caja routes require authentication
router.use(authenticate);

// Cash register operations with rate limiting
router.get('/registers', getCashRegisters);
router.post('/open', cajaLimiter, openShift);
router.post('/close', cajaLimiter, closeShift);
router.post('/force-close', cajaLimiter, authorize(['dueño', 'administrativo']), forceCloseShift);
router.get('/current', getCurrentShift);
router.post('/movement', cajaLimiter, registerMovement);
router.get('/shifts/:id/movements', getShiftMovements);
router.get('/shifts/history', getShiftHistory);

export default router;
