/**
 * Sales Routes
 */
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createSale,
  getAllSales,
  getSaleById,
  cancelSale,
} from '../controllers/salesController.js';

const router = express.Router();

// All sales routes require authentication
router.use(authenticate);

// Sales operations
router.get('/', getAllSales);
router.get('/:id', getSaleById);
router.post('/', createSale);
router.post('/:id/cancel', authorize('dueño', 'administrativo'), cancelSale);

export default router;
