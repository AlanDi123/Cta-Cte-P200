/**
 * Sol & Verde POS - Backend Server
 * Version: 3.0.0
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import config from './config.js';
import { pool, closePool } from './database/connection.js';
import logger from './utils/logger.js';
import cacheManager from './utils/cache.js';
import webSocketServer from './utils/websocket.js';
import jobQueueManager from './utils/jobQueue.js';
import { initializeJobProcessors } from './services/jobProcessors.js';
import { initializeScheduledTasks } from './services/scheduledTasks.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import productRoutes from './routes/products.js';
import saleRoutes from './routes/sales.js';
import cajaRoutes from './routes/caja.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = config.port;

// ============================================================================
// INITIALIZE SERVICES
// ============================================================================

// Initialize Redis cache
cacheManager.connect().catch(err => {
  logger.error('Failed to connect to Redis:', err);
  logger.warn('Continuing without cache...');
});

// Initialize WebSocket server
webSocketServer.initialize(httpServer);

// Initialize background job processors
initializeJobProcessors();

// Initialize scheduled tasks (cron jobs)
initializeScheduledTasks();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
}));

// CORS
app.use(cors(config.cors));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.',
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Static files (uploads, frontend)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ============================================================================
// API ROUTES
// ============================================================================

const API_PREFIX = `/api/${config.apiVersion}`;

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '3.0.0',
  });
});

// API routes
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/clients`, clientRoutes);
app.use(`${API_PREFIX}/products`, productRoutes);
app.use(`${API_PREFIX}/sales`, saleRoutes);
app.use(`${API_PREFIX}/caja`, cajaRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);

// Legacy API compatibility (for Google Apps Script migration)
app.get('/api/legacy/exportData', async (req, res) => {
  try {
    // Export data in legacy format for migration
    const clientes = await pool.query('SELECT * FROM clientes WHERE activo = true');
    const productos = await pool.query('SELECT * FROM productos WHERE activo = true');
    
    res.json({
      success: true,
      data: {
        version: '3.0.0',
        fechaBackup: new Date().toISOString(),
        clientes: clientes.rows,
        productos: productos.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error exporting legacy data:', error);
    res.status(500).json({
      success: false,
      error: 'Error al exportar datos',
    });
  }
});

// API documentation
app.get(`${API_PREFIX}/docs`, (req, res) => {
  res.json({
    version: '3.0.0',
    name: 'Sol & Verde POS API',
    description: 'API REST para Sistema POS Mayorista',
    endpoints: {
      auth: {
        'POST /auth/login': 'Iniciar sesión',
        'POST /auth/logout': 'Cerrar sesión',
        'POST /auth/refresh': 'Refrescar token',
      },
      users: {
        'GET /users': 'Listar usuarios',
        'GET /users/:id': 'Obtener usuario',
        'POST /users': 'Crear usuario',
        'PUT /users/:id': 'Actualizar usuario',
        'DELETE /users/:id': 'Eliminar usuario',
      },
      clients: {
        'GET /clients': 'Listar clientes',
        'GET /clients/:id': 'Obtener cliente',
        'POST /clients': 'Crear cliente',
        'PUT /clients/:id': 'Actualizar cliente',
        'GET /clients/:id/cuenta-corriente': 'Ver cuenta corriente',
      },
      products: {
        'GET /products': 'Listar productos',
        'GET /products/:id': 'Obtener producto',
        'POST /products': 'Crear producto',
        'PUT /products/:id': 'Actualizar producto',
        'GET /products/stock/critical': 'Stock crítico',
      },
      sales: {
        'GET /sales': 'Listar ventas',
        'GET /sales/:id': 'Obtener venta',
        'POST /sales': 'Crear venta',
        'POST /sales/:id/cancel': 'Cancelar venta',
      },
      caja: {
        'POST /caja/open': 'Abrir turno',
        'POST /caja/close': 'Cerrar turno',
        'GET /caja/current': 'Turno actual',
        'POST /caja/movement': 'Registrar movimiento',
      },
      reports: {
        'GET /reports/sales': 'Reporte de ventas',
        'GET /reports/cash': 'Reporte de caja',
        'GET /reports/stock': 'Reporte de stock',
        'GET /reports/clients': 'Reporte de clientes',
      },
      dashboard: {
        'GET /dashboard/kpis': 'Indicadores clave',
        'GET /dashboard/charts': 'Datos para gráficos',
      },
    },
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: config.nodeEnv === 'production' ? 
      'Error interno del servidor' : 
      err.message,
    ...(config.nodeEnv !== 'production' && { stack: err.stack }),
  });
});

// ============================================================================
// SERVER START
// ============================================================================

httpServer.listen(PORT, () => {
  logger.info(`🚀 Sol & Verde POS Server running on port ${PORT}`);
  logger.info(`📍 Environment: ${config.nodeEnv}`);
  logger.info(`📡 API: http://localhost:${PORT}/api/${config.apiVersion}`);
  logger.info(`📊 Health: http://localhost:${PORT}/health`);
  logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  // Stop accepting new connections
  httpServer.close(async () => {
    // Disconnect WebSocket clients
    webSocketServer.disconnectAll();
    
    // Close job queues
    await jobQueueManager.close();
    
    // Close database pool
    await closePool();
    
    // Close Redis connection
    await cacheManager.disconnect();
    
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  httpServer.close(async () => {
    webSocketServer.disconnectAll();
    await jobQueueManager.close();
    await closePool();
    await cacheManager.disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

export default app;
