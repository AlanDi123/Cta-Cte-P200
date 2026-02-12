/**
 * Idempotency Middleware Tests
 */
import {
  generateIdempotencyKey,
  validateIdempotencyKey,
} from '../middleware/idempotency.js';

describe('Idempotency Middleware', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate consistent key for same request', () => {
      const req = {
        user: { id: 'user-123' },
        path: '/api/v1/sales',
        method: 'POST',
      };
      
      const body = {
        cliente_id: 'client-456',
        items: [
          { producto_id: 'prod-1', cantidad: 5 },
        ],
      };

      const key1 = generateIdempotencyKey(req, body);
      const key2 = generateIdempotencyKey(req, body);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different keys for different requests', () => {
      const req1 = {
        user: { id: 'user-123' },
        path: '/api/v1/sales',
        method: 'POST',
      };
      
      const req2 = {
        user: { id: 'user-456' },
        path: '/api/v1/sales',
        method: 'POST',
      };

      const body = {
        cliente_id: 'client-456',
        items: [{ producto_id: 'prod-1', cantidad: 5 }],
      };

      const key1 = generateIdempotencyKey(req1, body);
      const key2 = generateIdempotencyKey(req2, body);

      expect(key1).not.toBe(key2);
    });

    it('should use client-provided key if valid', () => {
      const req = {
        user: { id: 'user-123' },
        path: '/api/v1/sales',
        method: 'POST',
      };
      
      const body = {
        idempotency_key: 'custom-key-12345',
        cliente_id: 'client-456',
      };

      const key = generateIdempotencyKey(req, body);
      expect(key).toBe('custom-key-12345');
    });
  });

  describe('validateIdempotencyKey', () => {
    it('should accept valid keys', () => {
      expect(validateIdempotencyKey('valid-key-123')).toBe(true);
      expect(validateIdempotencyKey('a'.repeat(64))).toBe(true);
    });

    it('should reject invalid keys', () => {
      expect(validateIdempotencyKey(null)).toBe(false);
      expect(validateIdempotencyKey('')).toBe(false);
      expect(validateIdempotencyKey('short')).toBe(false);
      expect(validateIdempotencyKey('a'.repeat(101))).toBe(false);
      expect(validateIdempotencyKey(123)).toBe(false);
    });
  });
});
