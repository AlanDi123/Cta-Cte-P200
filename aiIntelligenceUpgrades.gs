/**
 * ============================================================================
 * AI AGENT INTELLIGENCE UPGRADES - SISTEMA SOL & VERDE
 * ============================================================================
 * UPGRADE V2.0 - 5 Intelligence Features (ADDITIVE ONLY)
 * 
 * Features:
 * 1. Session Context Memory (Temporal)
 * 2. Action Preview / Explain Mode
 * 3. Client Recognition with Context Scoring
 * 4. Human Error & Outlier Detection
 * 5. Proactive Assistive Suggestions (Non-Executing)
 * 
 * ALL CHANGES ARE ADDITIVE - NO BREAKING CHANGES
 * ============================================================================
 */

// ============================================================================
// 1️⃣ SESSION CONTEXT MEMORY (TEMPORAL)
// ============================================================================

/**
 * Session context memory - TEMPORARY, IN-MEMORY ONLY
 * Exists ONLY during the chat session
 * NOT persisted to Sheets
 * NOT global across users
 * Cleared when session ends
 * 
 * @type {Object}
 */
var AISessionContext = {
  // Session identifier (per user)
  sessionId: null,
  sessionStart: null,
  
  // Context memory
  lastResolvedClient: null,      // Last client name resolved
  lastResolvedClientId: null,    // Last client ID if available
  lastActionType: null,          // Last action executed
  lastAmounts: [],               // Recent amounts (for corrections)
  pendingConfirmation: null,     // Pending confirmation data
  lastUserIntent: null,          // Last interpreted intent
  
  // Session statistics
  interactionCount: 0,
  confirmedClients: {},          // Map of confirmed client mappings
  
  /**
   * Initialize or reset session context
   * @param {string} userId - User identifier (email)
   */
  init: function(userId) {
    this.sessionId = userId + '_' + new Date().getTime();
    this.sessionStart = new Date();
    this.interactionCount = 0;
    this.lastResolvedClient = null;
    this.lastResolvedClientId = null;
    this.lastActionType = null;
    this.lastAmounts = [];
    this.pendingConfirmation = null;
    this.lastUserIntent = null;
    this.confirmedClients = {};
    
    Logger.log('[AI Session] Initialized: ' + this.sessionId + ' for user: ' + userId);
  },
  
  /**
   * Update context after successful action
   * @param {Object} actionData - Action that was executed
   */
  updateAfterAction: function(actionData) {
    this.interactionCount++;
    
    if (actionData.client) {
      this.lastResolvedClient = actionData.client;
    }
    
    if (actionData.type) {
      this.lastActionType = actionData.type;
    }
    
    if (actionData.amount) {
      // Keep last 5 amounts for context
      this.lastAmounts.unshift(actionData.amount);
      if (this.lastAmounts.length > 5) {
        this.lastAmounts = this.lastAmounts.slice(0, 5);
      }
    }
    
    this.pendingConfirmation = null;
  },
  
  /**
   * Mark client as confirmed in this session
   * @param {string} userInput - User input that confirmed
   * @param {string} clientName - Resolved client name
   */
  confirmClient: function(userInput, clientName) {
    this.confirmedClients[clientName.toUpperCase()] = {
      confirmedAt: new Date(),
      userInput: userInput,
      usageCount: (this.confirmedClients[clientName.toUpperCase()] || {}).usageCount || 0 + 1
    };
    this.lastResolvedClient = clientName;
  },
  
  /**
   * Get session context summary for debugging
   * @returns {Object}
   */
  getSummary: function() {
    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      interactionCount: this.interactionCount,
      lastResolvedClient: this.lastResolvedClient,
      lastActionType: this.lastActionType,
      lastAmounts: this.lastAmounts,
      hasPendingConfirmation: !!this.pendingConfirmation,
      confirmedClientsCount: Object.keys(this.confirmedClients).length
    };
  }
};

// ============================================================================
// 2️⃣ ACTION PREVIEW / EXPLAIN MODE
// ============================================================================

/**
 * Generate human-readable action preview for confirmation
 * 
 * @param {Array} actions - Array of proposed actions
 * @param {Object} context - Session context
 * @returns {Object} Preview with summary and risk assessment
 */
function generateActionPreview(actions, context) {
  if (!actions || actions.length === 0) {
    return {
      explain_action: true,
      summary: 'No hay acciones para ejecutar',
      risk_level: 'none',
      requires_confirmation: false,
      proposed_actions: []
    };
  }
  
  var preview = {
    explain_action: true,
    summary: '',
    risk_level: 'low',
    requires_confirmation: false,
    proposed_actions: [],
    warnings: []
  };
  
  var totalAmount = 0;
  var actionDescriptions = [];
  
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    var desc = '';
    
    switch (action.type) {
      case 'add_charge':
        desc = '📌 Cargar $' + formatNumber(action.amount) + ' a ' + action.client;
        totalAmount += action.amount || 0;
        break;
        
      case 'add_payment':
        desc = '💰 Registrar pago de $' + formatNumber(action.amount) + ' de ' + action.client;
        totalAmount += action.amount || 0;
        break;
        
      case 'reverse_last_movement':
        desc = '↩️ Revertir último movimiento de ' + action.client;
        preview.risk_level = 'medium';
        preview.warnings.push('Esta acción es reversible pero afecta el historial');
        break;
        
      case 'get_client_balance':
        desc = '📊 Consultar saldo de ' + action.client;
        break;
        
      case 'get_client_info':
        desc = '👤 Ver información de ' + action.client;
        break;
        
      default:
        desc = '⚙️ ' + action.type + ' para ' + (action.client || 'sistema');
    }
    
    actionDescriptions.push(desc);
    
    // Check if confirmation is required
    if (action.amount && action.amount > AI_AGENT_CONFIG.REQUIRE_CONFIRMATION_OVER) {
      preview.requires_confirmation = true;
      preview.risk_level = 'high';
      preview.warnings.push('Monto elevado requiere confirmación');
    }
  }
  
  // Build summary
  if (actions.length === 1) {
    preview.summary = actionDescriptions[0];
  } else {
    preview.summary = 'Se ejecutarán ' + actions.length + ' acciones:\n' + 
                      actionDescriptions.map(function(d, i) { return (i + 1) + '. ' + d; }).join('\n');
  }
  
  // Add total amount if applicable
  if (totalAmount > 0) {
    preview.summary += '\n\n💵 Total: $' + formatNumber(totalAmount);
  }
  
  // Add warnings
  if (preview.warnings.length > 0) {
    preview.summary += '\n\n⚠️ ' + preview.warnings.join('\n⚠️ ');
  }
  
  // Multi-step actions require confirmation
  if (actions.length > 1) {
    preview.requires_confirmation = true;
    if (preview.risk_level === 'low') {
      preview.risk_level = 'medium';
    }
  }
  
  preview.proposed_actions = actions;
  
  return preview;
}

/**
 * Format number for display (Argentine format)
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
  if (!num && num !== 0) return '0';
  return Number(num).toLocaleString('es-AR', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 2 
  });
}

// ============================================================================
// 3️⃣ CLIENT RECOGNITION WITH CONTEXT SCORING
// ============================================================================

/**
 * Enhanced client recognition with contextual scoring
 * 
 * @param {string} clientInput - Client name input from user
 * @param {Array} allClients - All clients from database
 * @param {Object} sessionContext - Current session context
 * @returns {Object} Recognition result with confidence scoring
 */
function recognizeClientWithContext(clientInput, allClients, sessionContext) {
  var result = {
    recognized: false,
    client: null,
    confidence: 0,
    confidence_level: 'low',  // low, medium, high
    matches: [],
    requires_confirmation: false,
    message: ''
  };
  
  if (!clientInput || !allClients || allClients.length === 0) {
    result.message = 'No se proporcionó nombre de cliente o no hay clientes cargados';
    return result;
  }
  
  var inputNorm = normalizarString(clientInput);
  
  // =========================================================================
  // SCORING SYSTEM
  // =========================================================================
  
  var scoredMatches = [];
  
  for (var i = 0; i < allClients.length; i++) {
    var client = allClients[i];
    var clientNorm = normalizarString(client.nombre);
    var score = 0;
    var matchType = 'none';
    
    // 1. Exact match (highest priority)
    if (clientNorm === inputNorm) {
      score = 100;
      matchType = 'exact';
    }
    // 2. Starts with match
    else if (clientNorm.startsWith(inputNorm)) {
      score = 80;
      matchType = 'starts_with';
    }
    // 3. Contains match
    else if (clientNorm.includes(inputNorm)) {
      score = 60;
      matchType = 'contains';
    }
    // 4. Fuzzy match
    else {
      var fuzzyScore = calcularScoreFuzzy(inputNorm, clientNorm);
      if (fuzzyScore >= 65) {
        score = fuzzyScore;
        matchType = 'fuzzy';
      }
    }
    
    // Skip if no match
    if (score === 0) continue;
    
    // =======================================================================
    // CONTEXTUAL BONUS
    // =======================================================================
    
    // Bonus: Last resolved client in session (+15 points)
    if (sessionContext && sessionContext.lastResolvedClient && 
        clientNorm === normalizarString(sessionContext.lastResolvedClient)) {
      score += 15;
      matchType += ' (recent)';
    }
    
    // Bonus: Confirmed client in session (+20 points)
    if (sessionContext && sessionContext.confirmedClients[clientNorm]) {
      score += 20;
      matchType += ' (confirmed)';
    }
    
    // Bonus: Frequently used in session (+5 points per use, max +15)
    if (sessionContext && sessionContext.confirmedClients[clientNorm]) {
      var usageCount = sessionContext.confirmedClients[clientNorm].usageCount || 0;
      score += Math.min(usageCount * 5, 15);
    }
    
    scoredMatches.push({
      client: client,
      score: score,
      matchType: matchType
    });
  }
  
  // Sort by score descending
  scoredMatches.sort(function(a, b) { return b.score - a.score; });
  
  // =========================================================================
  // DECISION LOGIC
  // =========================================================================
  
  if (scoredMatches.length === 0) {
    result.message = 'No se encontró ningún cliente que coincida con "' + clientInput + '"';
    return result;
  }
  
  var bestMatch = scoredMatches[0];
  result.matches = scoredMatches.slice(0, 5);  // Top 5 matches
  
  // High confidence: exact match or score >= 90
  if (bestMatch.score >= 90 || bestMatch.matchType.indexOf('exact') !== -1) {
    result.recognized = true;
    result.client = bestMatch.client;
    result.confidence = bestMatch.score;
    result.confidence_level = 'high';
    result.requires_confirmation = false;
    result.message = 'Cliente reconocido: ' + bestMatch.client.nombre + ' (confianza: ' + bestMatch.score + '%)';
  }
  // Medium confidence: score 70-89
  else if (bestMatch.score >= 70) {
    result.recognized = true;
    result.client = bestMatch.client;
    result.confidence = bestMatch.score;
    result.confidence_level = 'medium';
    result.requires_confirmation = true;
    result.message = '¿Te referís a ' + bestMatch.client.nombre + '? (confianza: ' + bestMatch.score + '%)';
    
    // If there are close alternatives, mention them
    if (scoredMatches.length > 1 && scoredMatches[1].score >= 60) {
      result.message += '\nOtras opciones: ' + scoredMatches.slice(1, 3).map(function(m) {
        return m.client.nombre + ' (' + m.score + '%)';
      }).join(', ');
    }
  }
  // Low confidence: score < 70
  else {
    result.recognized = false;
    result.client = null;
    result.confidence = bestMatch.score;
    result.confidence_level = 'low';
    result.requires_confirmation = true;
    result.message = 'No estoy seguro. ¿Te referís a alguno de estos?\n' + 
                     scoredMatches.slice(0, 3).map(function(m, i) {
                       return (i + 1) + '. ' + m.client.nombre + ' (' + m.score + '%)';
                     }).join('\n');
  }
  
  return result;
}

// ============================================================================
// 4️⃣ HUMAN ERROR & OUTLIER DETECTION
// ============================================================================

/**
 * Detect potential human errors in amounts
 * 
 * @param {number} amount - Amount to validate
 * @param {string} clientName - Client name for historical comparison
 * @param {Object} sessionContext - Session context
 * @returns {Object} Detection result with warnings
 */
function detectHumanError(amount, clientName, sessionContext) {
  var result = {
    is_outlier: false,
    risk_level: 'low',  // low, medium, high
    warnings: [],
    requires_confirmation: false,
    message: ''
  };
  
  if (!amount || amount <= 0) {
    result.warnings.push('Monto inválido');
    result.is_outlier = true;
    result.risk_level = 'high';
    return result;
  }
  
  // =========================================================================
  // CHECK 1: Amount much larger than recent session amounts
  // =========================================================================
  
  if (sessionContext && sessionContext.lastAmounts && sessionContext.lastAmounts.length > 0) {
    var avgRecent = 0;
    for (var i = 0; i < sessionContext.lastAmounts.length; i++) {
      avgRecent += sessionContext.lastAmounts[i];
    }
    avgRecent = avgRecent / sessionContext.lastAmounts.length;
    
    // If amount is > 10x the recent average
    if (amount > avgRecent * 10 && avgRecent > 0) {
      result.is_outlier = true;
      result.risk_level = 'high';
      result.requires_confirmation = true;
      result.warnings.push('⚠️ Este monto es ' + Math.round(amount / avgRecent) + ' veces mayor a los recientes ($' + formatNumber(avgRecent) + ' promedio)');
      result.message = '¿Estás seguro del monto? Podría ser un error (ej: cero extra)';
    }
    // If amount is > 5x the recent average
    else if (amount > avgRecent * 5 && avgRecent > 0) {
      result.risk_level = 'medium';
      result.requires_confirmation = true;
      result.warnings.push('⚠️ Este monto es ' + Math.round(amount / avgRecent) + ' veces mayor a los recientes');
    }
  }
  
  // =========================================================================
  // CHECK 2: Unusual round numbers (potential extra zeros)
  // =========================================================================
  
  // Check for suspiciously round amounts
  var amountStr = amount.toString();
  if (amount >= 10000 && amountStr.match(/^[\d]0000+$/)) {
    // Amounts like 10000, 50000, 100000, etc.
    result.warnings.push('⚠️ Monto muy redondo ($' + formatNumber(amount) + ') - verificar ceros');
    if (result.risk_level === 'low') {
      result.risk_level = 'medium';
    }
  }
  
  // =========================================================================
  // CHECK 3: Absolute threshold warnings
  // =========================================================================
  
  if (amount > 1000000) {
    result.warnings.push('⚠️ Monto elevado ($' + formatNumber(amount) + ') requiere confirmación');
    result.risk_level = 'high';
    result.requires_confirmation = true;
  }
  
  // Build message
  if (result.warnings.length > 0) {
    result.message = result.message || 'Verificación de monto:\n' + result.warnings.join('\n');
  }
  
  return result;
}

/**
 * Get client historical average for comparison (read-only)
 * 
 * @param {string} clientName - Client name
 * @returns {Object} Historical data (read-only)
 */
function getClientHistoricalAverage(clientName) {
  var historical = {
    averageAmount: 0,
    transactionCount: 0,
    maxAmount: 0,
    lastAmount: 0,
    available: false
  };
  
  try {
    // Try to get movements for this client
    if (typeof MovimientosRepository !== 'undefined') {
      var movimientos = MovimientosRepository.obtenerPorCliente(clientName);
      
      if (movimientos && movimientos.length > 0) {
        var total = 0;
        var max = 0;
        
        for (var i = 0; i < movimientos.length; i++) {
          var monto = movimientos[i].monto || 0;
          total += monto;
          if (monto > max) max = monto;
        }
        
        historical.averageAmount = total / movimientos.length;
        historical.transactionCount = movimientos.length;
        historical.maxAmount = max;
        historical.lastAmount = movimientos[0].monto || 0;
        historical.available = true;
      }
    }
  } catch (e) {
    Logger.log('[AI Error Detection] No se pudo obtener histórico: ' + e.message);
    // Return empty historical silently - this is a non-critical feature
  }
  
  return historical;
}

// ============================================================================
// 5️⃣ PROACTIVE ASSISTIVE SUGGESTIONS (NON-EXECUTING)
// ============================================================================

/**
 * Generate proactive, safe suggestions based on context
 * 
 * @param {Object} lastAction - Last action executed
 * @param {Object} sessionContext - Session context
 * @param {string} clientName - Current client being discussed
 * @returns {Array} Array of safe suggestions
 */
function generateProactiveSuggestions(lastAction, sessionContext, clientName) {
  var suggestions = [];
  
  // Only generate suggestions if we have context
  if (!lastAction || !clientName) {
    return suggestions;
  }
  
  // =======================================================================
  // SUGGESTION 1: After adding a charge, suggest viewing balance
  // =======================================================================
  
  if (lastAction.type === 'add_charge') {
    suggestions.push({
      type: 'suggestion',
      priority: 'medium',
      text: '¿Querés ver el saldo actualizado de ' + clientName + '?',
      safe_action: 'get_client_balance',
      safe_params: { client: clientName },
      non_executing: true
    });
    
    suggestions.push({
      type: 'suggestion',
      priority: 'low',
      text: '¿Querés ver los últimos movimientos de ' + clientName + '?',
      safe_action: 'get_movements',
      safe_params: { client: clientName, limit: 5 },
      non_executing: true
    });
  }
  
  // =======================================================================
  // SUGGESTION 2: After adding a payment, suggest viewing history
  // =======================================================================
  
  if (lastAction.type === 'add_payment') {
    suggestions.push({
      type: 'suggestion',
      priority: 'medium',
      text: '¿Querés ver el historial completo de ' + clientName + '?',
      safe_action: 'get_client_info',
      safe_params: { client: clientName },
      non_executing: true
    });
  }
  
  // =======================================================================
  // SUGGESTION 3: If client has high balance, suggest review
  // =======================================================================
  
  if (sessionContext && sessionContext.lastResolvedClient) {
    try {
      var clientInfo = ClientesRepository.buscarPorNombre(sessionContext.lastResolvedClient);
      if (clientInfo && clientInfo.cliente && clientInfo.cliente.saldo > 500000) {
        suggestions.push({
          type: 'suggestion',
          priority: 'low',
          text: '💡 ' + sessionContext.lastResolvedClient + ' tiene un saldo elevado ($' + formatNumber(clientInfo.cliente.saldo) + '). ¿Querés revisar su estado de cuenta?',
          safe_action: 'get_movements',
          safe_params: { client: sessionContext.lastResolvedClient, limit: 10 },
          non_executing: true
        });
      }
    } catch (e) {
      // Silent fail - suggestions are optional
    }
  }
  
  // =======================================================================
  // SUGGESTION 4: General session-based suggestions
  // =======================================================================
  
  if (sessionContext && sessionContext.interactionCount > 5) {
    suggestions.push({
      type: 'suggestion',
      priority: 'low',
      text: '📊 Llevás ' + sessionContext.interactionCount + ' operaciones en esta sesión. ¿Querés ver un resumen?',
      safe_action: 'analyze_system',
      safe_params: {},
      non_executing: true
    });
  }
  
  return suggestions;
}

// ============================================================================
// INTEGRATION: ENHANCED PROCESAR CONSULTA AI
// ============================================================================

/**
 * Enhanced version of procesarConsultaAI with all 5 intelligence features
 * This is an ADDITIVE wrapper - does not replace existing function
 * 
 * @param {Object} data - { message: string, contexto: object, userId: string }
 * @returns {Object} Enhanced response with all intelligence features
 */
function procesarConsultaAI_Enhanced(data) {
  var userId = data.userId || Session.getActiveUser().getEmail();
  
  // Initialize session context if not exists
  if (!AISessionContext.sessionId || AISessionContext.sessionId.indexOf(userId) === -1) {
    AISessionContext.init(userId);
  }
  
  // Call original function
  var originalResponse = procesarConsultaAI(data);
  
  // Enhance response with intelligence features
  if (originalResponse.success && originalResponse.actions && originalResponse.actions.length > 0) {
    
    // FEATURE 2: Add action preview for confirmation
    var preview = generateActionPreview(originalResponse.actions, AISessionContext);
    
    if (preview.requires_confirmation && !originalResponse.confirmed) {
      // Return preview instead of executing
      return {
        success: true,
        requires_confirmation: true,
        preview: preview,
        message: '⚠️ Confirmación requerida:\n\n' + preview.summary,
        actions: originalResponse.actions
      };
    }
    
    // FEATURE 4: Check for human errors
    for (var i = 0; i < originalResponse.actions.length; i++) {
      var action = originalResponse.actions[i];
      if (action.amount) {
        var errorCheck = detectHumanError(action.amount, action.client, AISessionContext);
        if (errorCheck.requires_confirmation) {
          return {
            success: true,
            requires_confirmation: true,
            warning: errorCheck.message,
            warnings: errorCheck.warnings,
            message: '⚠️ ' + errorCheck.message,
            actions: originalResponse.actions
          };
        }
      }
    }
    
    // Update session context after successful action
    for (var j = 0; j < originalResponse.actions.length; j++) {
      AISessionContext.updateAfterAction(originalResponse.actions[j]);
    }
    
    // FEATURE 5: Add proactive suggestions
    var lastAction = originalResponse.actions[originalResponse.actions.length - 1];
    var suggestions = generateProactiveSuggestions(
      lastAction, 
      AISessionContext, 
      lastAction.client || AISessionContext.lastResolvedClient
    );
    
    if (suggestions.length > 0) {
      originalResponse.suggestions = suggestions;
      originalResponse.message += '\n\n💡 ' + suggestions.map(function(s) { return s.text; }).join('\n💡 ');
    }
  }
  
  return originalResponse;
}
