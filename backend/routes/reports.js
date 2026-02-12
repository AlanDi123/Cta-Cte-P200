import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  salesReport,
  cashReport,
  stockReport,
  clientsReport,
  profitReport,
  salesBySalespersonReport,
  exportSalesPDF,
  exportSalesExcel,
} from '../controllers/reportController.js';

const router = express.Router();

// All reports routes require authentication
router.use(authenticate);

// Sales report
router.get('/sales', salesReport);

// Sales by salesperson
router.get('/sales/by-salesperson', salesBySalespersonReport);

// Cash report
router.get('/cash', cashReport);

// Stock report
router.get('/stock', stockReport);

// Clients report
router.get('/clients', clientsReport);

// Profit report
router.get('/profit', profitReport);

// Export endpoints
router.get('/sales/export/pdf', exportSalesPDF);
router.get('/sales/export/excel', exportSalesExcel);

export default router;
