/**
 * Sales Controller Integration Tests
 */
import request from 'supertest';
import app from '../server.js';
import { pool } from '../database/connection.js';

describe('Sales Controller - Concurrency Tests', () => {
  let authToken;
  let testClient;
  let testProduct;
  let testUser;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      `INSERT INTO usuarios (username, email, password_hash, nombre, apellido, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['testuser', 'test@test.com', 'hashedpass', 'Test', 'User', 'vendedor']
    );
    testUser = userResult.rows[0];

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'testuser', password: 'password' });
    
    authToken = loginRes.body.token;

    // Create test client
    const clientResult = await pool.query(
      `INSERT INTO clientes (nombre, limite_credito)
       VALUES ($1, $2)
       RETURNING id`,
      ['Test Client', 10000]
    );
    testClient = clientResult.rows[0];

    // Create test product
    const productResult = await pool.query(
      `INSERT INTO productos (codigo, nombre, precio_venta, stock_actual, stock_minimo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['PROD001', 'Test Product', 100, 50, 10]
    );
    testProduct = productResult.rows[0];
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM ventas WHERE cliente_id = $1', [testClient.id]);
    await pool.query('DELETE FROM productos WHERE id = $1', [testProduct.id]);
    await pool.query('DELETE FROM clientes WHERE id = $1', [testClient.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [testUser.id]);
    await pool.end();
  });

  describe('POST /api/v1/sales - Idempotency', () => {
    it('should create sale on first request', async () => {
      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'contado',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: 5,
            precio_unitario: 100,
          },
        ],
        idempotency_key: 'test-idempotency-key-001',
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.total).toBe(500);
    });

    it('should return existing sale on duplicate request', async () => {
      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'contado',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: 5,
            precio_unitario: 100,
          },
        ],
        idempotency_key: 'test-idempotency-key-001', // Same key
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isDuplicate).toBe(true);
    });
  });

  describe('POST /api/v1/sales - Stock Validation', () => {
    it('should reject sale with insufficient stock', async () => {
      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'contado',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: 1000, // More than available
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/stock insuficiente/i);
    });

    it('should prevent negative stock', async () => {
      // Get current stock
      const stockResult = await pool.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [testProduct.id]
      );
      const currentStock = stockResult.rows[0].stock_actual;

      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'contado',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: currentStock + 1, // Exceed stock
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/stock/i);

      // Verify stock is unchanged
      const afterResult = await pool.query(
        'SELECT stock_actual FROM productos WHERE id = $1',
        [testProduct.id]
      );
      expect(afterResult.rows[0].stock_actual).toBe(currentStock);
    });
  });

  describe('POST /api/v1/sales - Credit Limit', () => {
    it('should reject sale exceeding credit limit', async () => {
      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'credito',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: 200, // $20,000 total, exceeds $10,000 limit
            precio_unitario: 100,
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/crédito excedido/i);
    });

    it('should accept sale within credit limit', async () => {
      const saleData = {
        cliente_id: testClient.id,
        tipo_venta: 'credito',
        items: [
          {
            producto_id: testProduct.id,
            cantidad: 10, // $1,000 total, within $10,000 limit
            precio_unitario: 100,
          },
        ],
        idempotency_key: 'test-credit-sale-001',
      };

      const res = await request(app)
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${authToken}`)
        .send(saleData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });
});
