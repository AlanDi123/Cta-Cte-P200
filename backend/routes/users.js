import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Get all users
router.get('/', authorize('administrativo'), getAllUsers);

// Get single user
router.get('/:id', authorize('administrativo'), getUser);

// Create user (only dueño and administrativo)
router.post('/', authorize('administrativo'), createUser);

// Update user
router.put('/:id', authorize('administrativo'), updateUser);

// Delete user (soft delete)
router.delete('/:id', authorize('dueño'), deleteUser);

export default router;
