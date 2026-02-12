/**
 * Client Routes
 */
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientAccountStatement,
  getOverdueClients,
} from '../controllers/clientController.js';

const router = express.Router();

// All client routes require authentication
router.use(authenticate);

// Public routes (all authenticated users)
router.get('/', getAllClients);
router.get('/overdue', getOverdueClients);
router.get('/:id', getClientById);
router.get('/:id/cuenta-corriente', getClientAccountStatement);

// Protected routes (requires dueño or administrativo role)
router.post('/', authorize('dueño', 'administrativo', 'vendedor'), createClient);
router.put('/:id', authorize('dueño', 'administrativo'), updateClient);
router.delete('/:id', authorize('dueño'), deleteClient);

export default router;
