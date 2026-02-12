import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getKPIs, getCharts } from '../controllers/dashboardController.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get KPIs
router.get('/kpis', getKPIs);

// Get chart data
router.get('/charts', getCharts);

export default router;
