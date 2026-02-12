/**
 * Product Routes
 */
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCriticalStock,
  adjustStock,
  getCategories,
} from '../controllers/productController.js';

const router = express.Router();

// All product routes require authentication
router.use(authenticate);

// Public routes (all authenticated users)
router.get('/', getAllProducts);
router.get('/categories', getCategories);
router.get('/stock/critical', getCriticalStock);
router.get('/:id', getProductById);

// Protected routes
router.post('/', authorize('dueño', 'administrativo'), createProduct);
router.put('/:id', authorize('dueño', 'administrativo'), updateProduct);
router.delete('/:id', authorize('dueño'), deleteProduct);
router.post('/:id/adjust-stock', authorize('dueño', 'administrativo'), adjustStock);

export default router;
