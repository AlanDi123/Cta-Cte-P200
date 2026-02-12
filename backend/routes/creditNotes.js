import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  createCreditNote,
  applyCreditNote,
  cancelCreditNote,
  getAllCreditNotes,
  getCreditNoteById,
} from '../controllers/creditNotesController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// List all credit notes
router.get('/', getAllCreditNotes);

// Get specific credit note
router.get('/:id', getCreditNoteById);

// Create credit note (requires admin or accounting role)
router.post('/', authorize(['dueño', 'administrativo', 'contabilidad']), createCreditNote);

// Apply credit note (requires admin or accounting role)
router.post('/:id/apply', authorize(['dueño', 'administrativo', 'contabilidad']), applyCreditNote);

// Cancel credit note (requires admin role)
router.post('/:id/cancel', authorize(['dueño']), cancelCreditNote);

export default router;
