/**
 * Database Migration Script
 * Creates initial admin user and sample data
 */
import bcrypt from 'bcrypt';
import { pool } from '../database/connection.js';
import config from '../config.js';
import logger from '../utils/logger.js';

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    logger.info('Starting database migration...');
    
    // Create default admin user
    const adminPassword = await bcrypt.hash('admin123', config.security.bcryptRounds);
    
    const adminResult = await client.query(`
      INSERT INTO usuarios (username, email, password_hash, nombre, apellido, rol, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `, ['admin', 'admin@solverde.com', adminPassword, 'Administrador', 'Sistema', 'dueño', 'activo']);
    
    if (adminResult.rows.length > 0) {
      logger.info('✓ Admin user created - username: admin, password: admin123');
    } else {
      logger.info('✓ Admin user already exists');
    }
    
    // Create sample vendor user
    const vendorPassword = await bcrypt.hash('vendedor123', config.security.bcryptRounds);
    
    const vendorResult = await client.query(`
      INSERT INTO usuarios (username, email, password_hash, nombre, apellido, rol, status, comision_porcentaje)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `, ['vendedor1', 'vendedor@solverde.com', vendorPassword, 'Juan', 'Pérez', 'vendedor', 'activo', 5.0]);
    
    if (vendorResult.rows.length > 0) {
      logger.info('✓ Sample vendor created - username: vendedor1, password: vendedor123');
    }
    
    // Insert sample categories if not exist
    await client.query(`
      INSERT INTO categorias (nombre, codigo, descripcion)
      VALUES 
        ('Verduras de Hoja', 'VH', 'Lechuga, espinaca, acelga, etc.'),
        ('Verduras de Fruto', 'VF', 'Tomate, pimiento, berenjena, etc.'),
        ('Verduras de Raíz', 'VR', 'Zanahoria, remolacha, rabanito, etc.'),
        ('Hortalizas', 'HO', 'Cebolla, ajo, puerro, etc.'),
        ('Frutas', 'FR', 'Manzana, banana, naranja, etc.'),
        ('Otros', 'OT', 'Productos varios')
      ON CONFLICT (nombre) DO NOTHING
    `);
    logger.info('✓ Categories initialized');
    
    // Get admin user ID for created_by
    const adminUser = await client.query(
      'SELECT id FROM usuarios WHERE username = $1',
      ['admin']
    );
    const adminId = adminUser.rows[0]?.id;
    
    // Insert sample products
    if (adminId) {
      const categoriesResult = await client.query(
        'SELECT id, codigo FROM categorias'
      );
      const categories = {};
      categoriesResult.rows.forEach(cat => {
        categories[cat.codigo] = cat.id;
      });
      
      await client.query(`
        INSERT INTO productos (codigo, nombre, descripcion, categoria_id, unidad_medida, precio_compra, precio_venta, precio_mayorista, stock_actual, stock_minimo, iva_porcentaje, created_by)
        VALUES
          ('VH001', 'Lechuga', 'Lechuga criolla', $1, 'unidad', 150, 250, 220, 100, 20, 10.5, $7),
          ('VH002', 'Espinaca', 'Espinaca fresca', $1, 'kg', 200, 350, 300, 50, 10, 10.5, $7),
          ('VF001', 'Tomate', 'Tomate perita', $2, 'kg', 180, 300, 270, 200, 30, 10.5, $7),
          ('VF002', 'Pimiento', 'Pimiento morrón', $2, 'kg', 220, 380, 340, 80, 15, 10.5, $7),
          ('VR001', 'Zanahoria', 'Zanahoria fresca', $3, 'kg', 120, 220, 190, 150, 25, 10.5, $7),
          ('VR002', 'Remolacha', 'Remolacha', $3, 'kg', 100, 200, 170, 100, 20, 10.5, $7),
          ('HO001', 'Cebolla', 'Cebolla blanca', $4, 'kg', 80, 150, 130, 300, 50, 10.5, $7),
          ('HO002', 'Ajo', 'Ajo colorado', $4, 'kg', 400, 650, 580, 50, 10, 10.5, $7),
          ('FR001', 'Manzana', 'Manzana roja', $5, 'kg', 180, 320, 280, 120, 20, 10.5, $7),
          ('FR002', 'Banana', 'Banana ecuador', $5, 'kg', 120, 230, 200, 180, 30, 10.5, $7)
        ON CONFLICT (codigo) DO NOTHING
      `, [categories.VH, categories.VF, categories.VR, categories.HO, categories.FR, categories.OT, adminId]);
      
      logger.info('✓ Sample products created');
    }
    
    // Insert sample clients
    if (adminId) {
      await client.query(`
        INSERT INTO clientes (codigo, nombre, razon_social, cuit, condicion_fiscal, tipo_cliente, telefono, email, limite_credito, saldo, created_by)
        VALUES
          ('CLI001', 'SUPERMERCADO EL SOL', 'El Sol S.A.', '30-12345678-9', 'responsable_inscripto', 'supermercado', '1145678901', 'compras@elsol.com', 500000, 0, $1),
          ('CLI002', 'VERDULERÍA LA ESQUINA', 'La Esquina SRL', '30-23456789-0', 'responsable_inscripto', 'minorista', '1156789012', 'laesquina@email.com', 200000, 0, $1),
          ('CLI003', 'RESTAURANT LA COCINA', 'La Cocina Restaurant', '30-34567890-1', 'responsable_inscripto', 'restaurante', '1167890123', 'lacocina@email.com', 300000, 0, $1),
          ('CLI004', 'CONSUMIDOR FINAL', NULL, NULL, 'consumidor_final', 'minorista', NULL, NULL, 0, 0, $1)
        ON CONFLICT (codigo) DO NOTHING
      `, [adminId]);
      
      logger.info('✓ Sample clients created');
    }
    
    await client.query('COMMIT');
    logger.info('✅ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => {
    logger.info('Database migration finished');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration error:', error);
    process.exit(1);
  });
