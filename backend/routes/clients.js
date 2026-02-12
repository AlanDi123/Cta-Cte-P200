import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Clients endpoint - to be implemented' });
});

export default router;
