/**
 * WebSocket Server
 * Real-time updates for multi-device synchronization
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import config from '../config.js';
import cacheManager from './cache.js';

class WebSocketServer {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  /**
   * Initialize WebSocket server
   * @param {Object} httpServer - HTTP server instance
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      // Connection options
      pingTimeout: 60000,
      pingInterval: 25000,
      // HTTP long-polling fallback
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, config.jwtSecret);
        socket.userId = decoded.id;
        socket.userRole = decoded.rol;
        socket.username = decoded.username;
        
        logger.info(`WebSocket client authenticated: ${socket.username}`);
        next();
      } catch (error) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('✓ WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;
    const username = socket.username;

    logger.info(`WebSocket connected: ${username} (${socket.id})`);

    // Store connected client
    this.connectedClients.set(socket.id, {
      userId,
      username,
      connectedAt: new Date(),
      rooms: new Set(),
    });

    // Send connection acknowledgment
    socket.emit('connected', {
      socketId: socket.id,
      userId,
      username,
      timestamp: new Date().toISOString(),
    });

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle room subscriptions
    socket.on('subscribe', (data) => {
      this.handleSubscribe(socket, data);
    });

    socket.on('unsubscribe', (data) => {
      this.handleUnsubscribe(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${username} (${socket.id}) - Reason: ${reason}`);
      this.connectedClients.delete(socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for ${username}:`, error);
    });

    // Send initial data sync
    this.sendInitialSync(socket);
  }

  /**
   * Handle room subscription
   */
  handleSubscribe(socket, data) {
    const { room } = data;
    
    if (!room) return;

    socket.join(room);
    
    const client = this.connectedClients.get(socket.id);
    if (client) {
      client.rooms.add(room);
    }

    logger.debug(`Client ${socket.username} subscribed to ${room}`);
    socket.emit('subscribed', { room });
  }

  /**
   * Handle room unsubscription
   */
  handleUnsubscribe(socket, data) {
    const { room } = data;
    
    if (!room) return;

    socket.leave(room);
    
    const client = this.connectedClients.get(socket.id);
    if (client) {
      client.rooms.delete(room);
    }

    logger.debug(`Client ${socket.username} unsubscribed from ${room}`);
    socket.emit('unsubscribed', { room });
  }

  /**
   * Send initial data sync to newly connected client
   */
  async sendInitialSync(socket) {
    try {
      // Send current shift status
      socket.emit('sync:shift', {
        status: 'ready',
        timestamp: new Date().toISOString(),
      });

      // Send connection count
      socket.emit('sync:connections', {
        count: this.connectedClients.size,
      });
    } catch (error) {
      logger.error('Error sending initial sync:', error);
    }
  }

  /**
   * Broadcast stock update
   */
  emitStockUpdate(productId, stockData) {
    if (!this.io) return;

    this.io.emit('stock:update', {
      productId,
      stock: stockData,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Stock update broadcast: Product ${productId}`);
  }

  /**
   * Broadcast new sale notification
   */
  emitNewSale(saleData) {
    if (!this.io) return;

    this.io.emit('sale:created', {
      sale: saleData,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`New sale broadcast: #${saleData.numero_venta}`);
  }

  /**
   * Broadcast cash register update
   */
  emitCajaUpdate(turnoId, cajaData) {
    if (!this.io) return;

    this.io.emit('caja:update', {
      turnoId,
      caja: cajaData,
      timestamp: new Date().toISOString(),
    });

    // Also send to turno-specific room
    this.io.to(`turno:${turnoId}`).emit('caja:turno:update', {
      turnoId,
      caja: cajaData,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Caja update broadcast: Turno ${turnoId}`);
  }

  /**
   * Broadcast client balance update
   */
  emitClientBalanceUpdate(clientId, balanceData) {
    if (!this.io) return;

    this.io.emit('client:balance:update', {
      clientId,
      balance: balanceData,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Client balance update broadcast: Client ${clientId}`);
  }

  /**
   * Send notification to specific user
   */
  emitToUser(userId, event, data) {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Event sent to user ${userId}: ${event}`);
  }

  /**
   * Send notification to specific room
   */
  emitToRoom(room, event, data) {
    if (!this.io) return;

    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Event sent to room ${room}: ${event}`);
  }

  /**
   * Broadcast system notification
   */
  emitSystemNotification(notification) {
    if (!this.io) return;

    this.io.emit('system:notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    logger.info(`System notification broadcast: ${notification.message}`);
  }

  /**
   * Get connected clients count
   */
  getConnectedCount() {
    return this.connectedClients.size;
  }

  /**
   * Get connected clients info
   */
  getConnectedClients() {
    return Array.from(this.connectedClients.values());
  }

  /**
   * Disconnect all clients (for graceful shutdown)
   */
  disconnectAll() {
    if (this.io) {
      this.io.disconnectSockets();
      logger.info('All WebSocket clients disconnected');
    }
  }
}

// Create singleton instance
const webSocketServer = new WebSocketServer();

export default webSocketServer;
