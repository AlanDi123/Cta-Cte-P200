import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Placeholder routes - to be implemented
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Users endpoint - to be implemented' });
});

export default router;
