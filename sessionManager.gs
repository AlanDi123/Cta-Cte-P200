/**
 * ============================================================================
 * SESSION MANAGER - SISTEMA SOL & VERDE
 * ============================================================================
 * Gestión de sesiones por usuario con PropertiesService
 * CRITICAL: Reemplaza AISessionContext global (que era compartido entre usuarios)
 * 
 * Uso correcto:
 *   var session = SessionManager.getSession(userId);
 *   SessionManager.updateSession(userId, context);
 * ============================================================================
 */

var SessionManager = {
  // TTL de sesión: 30 minutos (en milisegundos)
  SESSION_TTL: 30 * 60 * 1000,
  
  /**
   * Obtiene la sesión de un usuario desde PropertiesService
   * @param {string} userId - User identifier (email)
   * @returns {Object} Session context
   */
  getSession: function(userId) {
    if (!userId) {
      throw new Error('[SessionManager] userId es requerido');
    }
    
    try {
      var props = PropertiesService.getUserProperties();
      var sessionKey = 'ai_session_' + this._hashUserId(userId);
      var sessionData = props.getProperty(sessionKey);
      
      if (!sessionData) {
        // Sesión nueva
        return this._createNewSession(userId);
      }
      
      var session = JSON.parse(sessionData);
      
      // Verificar TTL
      if (new Date().getTime() - session.lastActivity > this.SESSION_TTL) {
        Logger.log('[SessionManager] Sesión expirada para usuario: ' + userId);
        return this._createNewSession(userId);
      }
      
      return session;
      
    } catch (e) {
      Logger.log('[SessionManager] Error al obtener sesión: ' + e.message);
      // Fallback: nueva sesión
      return this._createNewSession(userId);
    }
  },
  
  /**
   * Actualiza la sesión de un usuario en PropertiesService
   * @param {string} userId - User identifier
   * @param {Object} contextUpdate - Datos a actualizar
   */
  updateSession: function(userId, contextUpdate) {
    if (!userId) {
      throw new Error('[SessionManager] userId es requerido');
    }
    
    try {
      var session = this.getSession(userId);
      
      // Merge con datos existentes
      session = Object.assign(session, contextUpdate, {
        lastActivity: new Date().getTime()
      });
      
      var props = PropertiesService.getUserProperties();
      var sessionKey = 'ai_session_' + this._hashUserId(userId);
      props.setProperty(sessionKey, JSON.stringify(session));
      
      Logger.log('[SessionManager] Sesión actualizada para usuario: ' + userId);
      
    } catch (e) {
      Logger.log('[SessionManager] Error al actualizar sesión: ' + e.message);
      // Silent fail - session is optional
    }
  },
  
  /**
   * Limpia la sesión de un usuario
   * @param {string} userId - User identifier
   */
  clearSession: function(userId) {
    if (!userId) return;
    
    try {
      var props = PropertiesService.getUserProperties();
      var sessionKey = 'ai_session_' + this._hashUserId(userId);
      props.deleteProperty(sessionKey);
      Logger.log('[SessionManager] Sesión limpiada para usuario: ' + userId);
    } catch (e) {
      Logger.log('[SessionManager] Error al limpiar sesión: ' + e.message);
    }
  },
  
  /**
   * Crea una nueva sesión
   * @param {string} userId - User identifier
   * @returns {Object} Nueva sesión
   */
  _createNewSession: function(userId) {
    return {
      userId: userId,
      sessionId: userId + '_' + new Date().getTime(),
      createdAt: new Date().getTime(),
      lastActivity: new Date().getTime(),
      
      // Context memory
      lastResolvedClient: null,
      lastResolvedClientId: null,
      lastActionType: null,
      lastAmounts: [],
      pendingConfirmation: null,
      lastUserIntent: null,
      
      // Statistics
      interactionCount: 0,
      confirmedClients: {}
    };
  },
  
  /**
   * Hash simple para userId (para usar en property names)
   * @param {string} userId - User identifier
   * @returns {string} Hash safe para property names
   */
  _hashUserId: function(userId) {
    // Simple hash: eliminar caracteres inválidos para property names
    return userId.replace(/[^a-zA-Z0-9_]/g, '_');
  },
  
  /**
   * Helper: Actualiza contexto después de una acción exitosa
   * @param {string} userId - User identifier
   * @param {Object} actionData - Acción ejecutada
   */
  updateAfterAction: function(userId, actionData) {
    var updates = {
      interactionCount: (this.getSession(userId).interactionCount || 0) + 1
    };
    
    if (actionData.client) {
      updates.lastResolvedClient = actionData.client;
    }
    
    if (actionData.type) {
      updates.lastActionType = actionData.type;
    }
    
    if (actionData.amount) {
      var lastAmounts = this.getSession(userId).lastAmounts || [];
      lastAmounts.unshift(actionData.amount);
      if (lastAmounts.length > 5) {
        lastAmounts = lastAmounts.slice(0, 5);
      }
      updates.lastAmounts = lastAmounts;
    }
    
    updates.pendingConfirmation = null;
    
    this.updateSession(userId, updates);
  },
  
  /**
   * Helper: Marca cliente como confirmado en sesión
   * @param {string} userId - User identifier
   * @param {string} clientName - Nombre del cliente
   */
  confirmClient: function(userId, clientName) {
    var session = this.getSession(userId);
    var confirmedClients = session.confirmedClients || {};
    
    var clientKey = clientName.toUpperCase();
    confirmedClients[clientKey] = {
      confirmedAt: new Date().getTime(),
      usageCount: (confirmedClients[clientKey] || {}).usageCount || 0 + 1
    };
    
    this.updateSession(userId, {
      lastResolvedClient: clientName,
      confirmedClients: confirmedClients
    });
  }
};
