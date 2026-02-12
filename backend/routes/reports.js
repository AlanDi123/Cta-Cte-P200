import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  salesReport,
  cashReport,
  stockReport,
  clientsReport,
  profitReport,
} from '../controllers/reportController.js';

const router = express.Router();

// All reports routes require authentication
router.use(authenticate);

// Sales report
router.get('/sales', salesReport);

// Cash report
router.get('/cash', cashReport);

// Stock report
router.get('/stock', stockReport);

// Clients report
router.get('/clients', clientsReport);

// Profit report
router.get('/profit', profitReport);

export default router;
