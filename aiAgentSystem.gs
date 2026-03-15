/**
 * ============================================================================
 * AI AGENT SYSTEM - SISTEMA SOL & VERDE
 * ============================================================================
 * Sistema de Agente AI con interprete de acciones seguro
 * - Primary AI Agent: Analiza intención y genera acciones JSON
 * - Secondary Reasoning Agent: Interpreta slang/ambigüedad
 * - Action Interpreter: Ejecuta acciones validadas (whitelist)
 * - Audit Logger: Registra todas las operaciones
 * ============================================================================
 */

// ============================================================================
// CONFIGURACIÓN DEL SISTEMA AI
// ============================================================================

var AI_AGENT_CONFIG = {
  // Enable/Disable features
  ENABLED: true,
  ENABLED_LOGGING: true,
  DRY_RUN_MODE: false,  // Si true, solo analiza sin ejecutar
  
  // Límites de seguridad
  MAX_ACTIONS_PER_REQUEST: 10,
  MAX_AMOUNT_PER_ACTION: 10000000,  // $10M máximo por acción
  REQUIRE_CONFIRMATION_OVER: 1000000,  // Requiere confirmación sobre $1M
  
  // Acción permitidas (WHITELIST)
  ALLOWED_ACTIONS: [
    'add_charge',       // Agregar debe/cargo
    'add_payment',      // Agregar haber/pago
    'get_client_info',  // Obtener información de cliente
    'get_client_balance',  // Obtener saldo
    'list_clients',     // Listar clientes
    'analyze_system',   // Análisis del sistema (solo lectura)
    'detect_errors',    // Detección de errores (solo lectura)
    'get_movements',    // Obtener movimientos
    'search_client',    // Buscar cliente
    'help'              // Ayuda general
  ],
  
  // Modelos AI (usando Claude desde la configuración existente)
  PRIMARY_MODEL: 'claude-sonnet-4-20250514',
  REASONING_MODEL: null  // Usaremos reglas locales para el secondary agent
};

// ============================================================================
// SECONDARY REASONING AGENT (Slang/Ambiguity Interpreter)
// ============================================================================

/**
 * Agente secundario de razonamiento libre
 * Interpreta jerga argentina, lenguaje informal y ambigüedades
 * Usa reglas basadas en patrones (FREE, sin API externa)
 * 
 * @param {string} input - Texto del usuario
 * @returns {Object} Intención normalizada
 */
function secondaryReasoningAgent(input) {
  // VALIDACIÓN DE SEGURIDAD: Sanitizar input
  if (!input || typeof input !== 'string') {
    return {
      normalized: '',
      intent: 'unknown',
      confidence: 0,
      entities: {},  // DEFENSIVE: Initialize as empty object
      notes: []  // DEFENSIVE: Initialize as empty array
    };
  }
  
  // Sanitizar: eliminar tags HTML, scripts, y caracteres peligrosos
  var sanitizedInput = String(input)
    .replace(/<[^>]*>/g, '')  // Eliminar HTML tags
    .replace(/javascript:/gi, '')  // Eliminar javascript: protocol
    .replace(/on\w+\s*=/gi, '')  // Eliminar event handlers (onclick=, etc.)
    .trim();
  
  // Validar longitud máxima (previene DoS)
  if (sanitizedInput.length > 1000) {
    return {
      normalized: '',
      intent: 'unknown',
      confidence: 0,
      entities: {},
      notes: ['Input demasiado largo (máximo 1000 caracteres)']
    };
  }
  
  var texto = sanitizedInput.toLowerCase();
  var result = {
    normalized: texto,
    intent: 'unknown',
    confidence: 0,
    entities: {},  // DEFENSIVE: Always an object
    notes: []  // DEFENSIVE: Always an array
  };
  
  // =========================================================================
  // PATRONES DE JERGA ARGENTINA / LENGUAJE INFORMAL
  // =========================================================================
  
  // 1. CARGOS / DEBE
  if (texto.match(/cargar|agregar|sumar|poner|meter|darle|cagarme|fiar/)) {
    result.intent = 'add_charge';
    result.confidence = 0.8;
    result.notes.push('Detectada intención de cargo');
    
    // Extraer monto (patrones: $1000, 1000 pesos, mil, 1k)
    var montoMatch = texto.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)?/i);
    if (montoMatch) {
      var monto = parseFloat(montoMatch[1].replace(',', '.'));
      if (texto.includes('mil') || texto.includes('k')) {
        monto *= 1000;
      }
      result.entities.monto = monto;
    }
    
    // Extraer cliente (después de "a", "para", "de")
    var clienteMatch = texto.match(/(?:a|para|de)\s+([a-záéíóúñ\s]+)/i);
    if (clienteMatch) {
      result.entities.cliente = clienteMatch[1].trim().toUpperCase();
    }
  }
  
  // 2. PAGOS / HABER
  if (texto.match(/pagar|abonar|cancelar|pagó|pago|depositar|transferir/)) {
    result.intent = 'add_payment';
    result.confidence = 0.85;
    result.notes.push('Detectada intención de pago');
    
    var montoMatch = texto.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)?/i);
    if (montoMatch) {
      var monto = parseFloat(montoMatch[1].replace(',', '.'));
      if (texto.includes('mil') || texto.includes('k')) {
        monto *= 1000;
      }
      result.entities.monto = monto;
    }
    
    var clienteMatch = texto.match(/(?:a|para|de)\s+([a-záéíóúñ\s]+)/i);
    if (clienteMatch) {
      result.entities.cliente = clienteMatch[1].trim().toUpperCase();
    }
  }
  
  // 3. CONSULTA DE SALDO
  if (texto.match(/cuanto debe|cuanto hay|saldo|debe|deuda|a deber/)) {
    result.intent = 'get_client_balance';
    result.confidence = 0.9;
    result.notes.push('Consulta de saldo');
    
    var clienteMatch = texto.match(/(?:de|para|a)\s+([a-záéíóúñ\s]+)/i);
    if (clienteMatch) {
      result.entities.cliente = clienteMatch[1].trim().toUpperCase();
    }
  }
  
  // 4. INFORMACIÓN DE CLIENTE
  if (texto.match(/ver cliente|buscar cliente|datos de|info de|información de/)) {
    result.intent = 'get_client_info';
    result.confidence = 0.85;
    result.notes.push('Consulta de información de cliente');
    
    var clienteMatch = texto.match(/(?:de|para|a)\s+([a-záéíóúñ\s]+)/i);
    if (clienteMatch) {
      result.entities.cliente = clienteMatch[1].trim().toUpperCase();
    }
  }
  
  // 5. LISTAR CLIENTES
  if (texto.match(/lista de clientes|todos los clientes|mostrar clientes/)) {
    result.intent = 'list_clients';
    result.confidence = 0.95;
    result.notes.push('Listado de clientes');
  }
  
  // 6. ANÁLISIS DEL SISTEMA
  if (texto.match(/analizar|revisar|verificar|chequear|diagnosticar|find errors/)) {
    result.intent = 'analyze_system';
    result.confidence = 0.9;
    result.notes.push('Análisis del sistema solicitado');
  }
  
  // 7. MOVIMIENTOS / HISTORIAL
  if (texto.match(/movimientos|historial|últimos movimientos|extracto/)) {
    result.intent = 'get_movements';
    result.confidence = 0.85;
    result.notes.push('Consulta de movimientos');
    
    var clienteMatch = texto.match(/(?:de|para|a)\s+([a-záéíóúñ\s]+)/i);
    if (clienteMatch) {
      result.entities.cliente = clienteMatch[1].trim().toUpperCase();
    }
  }
  
  // 8. AYUDA
  if (texto.match(/ayuda|help|qué podés|qué puedes|comandos/)) {
    result.intent = 'help';
    result.confidence = 0.95;
    result.notes.push('Solicitud de ayuda');
  }
  
  // =========================================================================
  // EXPRESIONES ARGENTINAS ESPECÍFICAS
  // =========================================================================
  
  // "Me cagué" = quiero que me carguen un fiado
  if (texto.includes('me cagué') || texto.includes('cagame')) {
    result.intent = 'add_charge';
    result.confidence = 0.75;
    result.notes.push('Expresión coloquial argentina detectada (cargo)');
  }
  
  // "Fiado" = cargo a cuenta
  if (texto.includes('fiado') || texto.includes('anotame')) {
    result.intent = 'add_charge';
    result.confidence = 0.8;
    result.notes.push('Término "fiado" detectado');
  }
  
  // "Zafar" = pagar, cancelar deuda
  if (texto.includes('zafar') || texto.includes('me saque')) {
    result.intent = 'add_payment';
    result.confidence = 0.7;
    result.notes.push('Expresión coloquial detectada (pago)');
  }
  
  return result;
}

// ============================================================================
// PRIMARY AI AGENT (Analiza intención y genera acciones JSON)
// ============================================================================

/**
 * Agente AI primario que analiza la intención del usuario
 * y genera acciones estructuradas en formato JSON
 * 
 * @param {string} userInput - Input del usuario (ya normalizado)
 * @param {Object} contexto - Contexto adicional (cliente actual, sesión, etc.)
 * @returns {Object} Estructura de acciones JSON
 */
function primaryAIAgent(userInput, contexto) {
  contexto = contexto || {};
  
  // Primero pasar por el secondary reasoning agent
  var interpretacion = secondaryReasoningAgent(userInput);
  
  // Si no se detectó intención clara, retornar ayuda
  if (interpretacion.confidence < 0.5) {
    return {
      success: true,
      actions: [],
      message: 'No entendí bien tu consulta. Podés pedirme que:\n' +
               '- Cargue un fiado ("cargar $5000 a Juan Perez")\n' +
               '- Registre un pago ("pagó María Gómez $10000")\n' +
               '- Consulte saldo ("cuanto debe Pedro")\n' +
               '- Liste clientes ("mostrar clientes")\n' +
               '- Analice el sistema ("revisar si hay errores")',
      interpretacion: interpretacion
    };
  }
  
  // Generar acciones basadas en la intención
  var acciones = [];
  
  switch (interpretacion.intent) {
    case 'add_charge':
      if (interpretacion.entities.cliente && interpretacion.entities.monto) {
        acciones.push({
          type: 'add_charge',
          client: interpretacion.entities.cliente,
          amount: interpretacion.entities.monto,
          obs: 'Cargo desde AI Chat: ' + userInput.substring(0, 50)
        });
      } else {
        return {
          success: false,
          actions: [],
          message: 'Para cargar un fiado necesito:\n' +
                   '- Nombre del cliente\n' +
                   '- Monto a cargar\n\n' +
                   'Ejemplo: "cargar $5000 a Juan Perez"',
          interpretacion: interpretacion
        };
      }
      break;
      
    case 'add_payment':
      if (interpretacion.entities.cliente && interpretacion.entities.monto) {
        acciones.push({
          type: 'add_payment',
          client: interpretacion.entities.cliente,
          amount: interpretacion.entities.monto,
          obs: 'Pago desde AI Chat: ' + userInput.substring(0, 50)
        });
      } else {
        return {
          success: false,
          actions: [],
          message: 'Para registrar un pago necesito:\n' +
                   '- Nombre del cliente\n' +
                   '- Monto del pago\n\n' +
                   'Ejemplo: "pagó María Gómez $10000"',
          interpretacion: interpretacion
        };
      }
      break;
      
    case 'get_client_balance':
      if (interpretacion.entities.cliente) {
        acciones.push({
          type: 'get_client_balance',
          client: interpretacion.entities.cliente
        });
      } else {
        return {
          success: false,
          actions: [],
          message: 'Para consultar saldo necesito el nombre del cliente.\n\n' +
                   'Ejemplo: "cuanto debe Juan Perez"',
          interpretacion: interpretacion
        };
      }
      break;
      
    case 'get_client_info':
      if (interpretacion.entities.cliente) {
        acciones.push({
          type: 'get_client_info',
          client: interpretacion.entities.cliente
        });
      }
      break;
      
    case 'list_clients':
      acciones.push({
        type: 'list_clients'
      });
      break;
      
    case 'analyze_system':
      acciones.push({
        type: 'analyze_system'
      });
      break;
      
    case 'get_movements':
      if (interpretacion.entities.cliente) {
        acciones.push({
          type: 'get_movements',
          client: interpretacion.entities.cliente
        });
      } else {
        acciones.push({
          type: 'get_movements',
          limit: 10  // Últimos 10 movimientos
        });
      }
      break;
      
    case 'help':
      return {
        success: true,
        actions: [],
        message: '🤖 **Asistente AI Sol & Verde**\n\n' +
                 'Puedo ayudarte con:\n\n' +
                 '📌 **Cargas y Pagos**\n' +
                 '  • "cargar $5000 a Juan Perez"\n' +
                 '  • "pagó María Gómez $10000"\n' +
                 '  • "anotame $2000 en el fiado"\n\n' +
                 '📌 **Consultas**\n' +
                 '  • "cuanto debe Pedro"\n' +
                 '  • "ver cliente Juan Perez"\n' +
                 '  • "movimientos de María"\n\n' +
                 '📌 **Sistema**\n' +
                 '  • "analizar el sistema"\n' +
                 '  • "revisar si hay errores"\n' +
                 '  • "lista de clientes"\n\n' +
                 '✍️ Escribí naturalmente, entiendo jerga argentina.',
        interpretacion: interpretacion
      };
      
    default:
      return {
        success: false,
        actions: [],
        message: 'No entendí bien lo que querés hacer. Probá con:\n' +
                 '"cargar $5000 a Juan Perez"\n' +
                 '"pagó María Gómez $10000"\n' +
                 '"cuanto debe Pedro"',
        interpretacion: interpretacion
      };
  }
  
  // Validar cantidad de acciones
  if (acciones.length > AI_AGENT_CONFIG.MAX_ACTIONS_PER_REQUEST) {
    return {
      success: false,
      actions: [],
      message: 'Demasiadas acciones solicitadas. Máximo ' + 
               AI_AGENT_CONFIG.MAX_ACTIONS_PER_REQUEST + ' por consulta.',
      interpretacion: interpretacion
    };
  }
  
  return {
    success: true,
    actions: acciones,
    message: 'Entendí: ' + interpretacion.notes.join(', '),
    interpretacion: interpretacion
  };
}

// ============================================================================
// ACTION INTERPRETER (Ejecuta acciones validadas - WHITELIST)
// ============================================================================

/**
 * Interprete seguro de acciones
 * Solo ejecuta acciones en la whitelist
 * Valida todos los parámetros antes de ejecutar
 * 
 * @param {Array} acciones - Array de acciones JSON
 * @param {string} usuario - Email del usuario (para auditoría)
 * @returns {Object} Resultados de la ejecución
 */
function actionInterpreter(acciones, usuario) {
  usuario = usuario || Session.getActiveUser().getEmail();
  
  // DEFENSIVE: Initialize resultados with guaranteed structure
  var resultados = {
    exitosas: 0,
    fallidas: 0,
    detalles: [],  // DEFENSIVE: Always an array
    errores: []    // DEFENSIVE: Always an array
  };
  
  // DEFENSIVE: Validate acciones is an array
  if (!Array.isArray(acciones) || acciones.length === 0) {
    resultados.mensaje = 'No hay acciones para ejecutar';
    return resultados;
  }
  
  for (var i = 0; i < acciones.length; i++) {
    var accion = acciones[i];
    
    // DEFENSIVE: Validate action structure
    if (!accion || typeof accion !== 'object') {
      var resultadoInvalido = {
        indice: i,
        tipo: 'unknown',
        exitosa: false,
        mensaje: 'Acción inválida',
        datos: null,
        errores: ['La acción no es un objeto válido']
      };
      resultados.fallidas++;
      resultados.detalles.push(resultadoInvalido);
      resultados.errores.push(resultadoInvalido);
      continue;
    }
    
    var resultado = {
      indice: i,
      tipo: accion.type || 'unknown',
      exitosa: false,
      mensaje: '',
      datos: null,
      errores: []  // DEFENSIVE: Always an array
    };
    
    // VALIDAR QUE LA ACCIÓN ESTÉ EN LA WHITELIST
    if (AI_AGENT_CONFIG.ALLOWED_ACTIONS.indexOf(accion.type) === -1) {
      resultado.mensaje = 'Acción no permitida: ' + accion.type;
      resultado.errores.push('Acción no está en la whitelist');
      resultados.fallidas++;
      resultados.detalles.push(resultado);
      resultados.errores.push(resultado);
      continue;
    }
    
    // MODO DRY-RUN: Solo analizar, no ejecutar
    if (AI_AGENT_CONFIG.DRY_RUN_MODE) {
      resultado.mensaje = '[DRY-RUN] Acción simulada: ' + accion.type;
      resultado.exitosa = true;
      resultados.exitosas++;
      resultados.detalles.push(resultado);
      continue;
    }
    
    // EJECUTAR ACCIÓN
    try {
      switch (accion.type) {
        case 'add_charge':
          resultado = ejecutarAddCharge(accion, usuario, resultado);
          break;
          
        case 'add_payment':
          resultado = ejecutarAddPayment(accion, usuario, resultado);
          break;
          
        case 'get_client_balance':
          resultado = ejecutarGetClientBalance(accion, usuario, resultado);
          break;
          
        case 'get_client_info':
          resultado = ejecutarGetClientInfo(accion, usuario, resultado);
          break;
          
        case 'list_clients':
          resultado = ejecutarListClients(accion, usuario, resultado);
          break;
          
        case 'analyze_system':
          resultado = ejecutarAnalyzeSystem(accion, usuario, resultado);
          break;
          
        case 'get_movements':
          resultado = ejecutarGetMovements(accion, usuario, resultado);
          break;
          
        default:
          resultado.mensaje = 'Acción no implementada: ' + accion.type;
          resultado.errores.push('No hay implementación para esta acción');
          resultados.fallidas++;
      }
      
      if (resultado.exitosa) {
        resultados.exitosas++;
      } else {
        resultados.fallidas++;
      }
      
      resultados.detalles.push(resultado);
      
    } catch (e) {
      resultado.exitosa = false;
      resultado.mensaje = 'Error interno: ' + e.message;
      resultado.errores.push(e.message);
      resultados.fallidas++;
      resultados.detalles.push(resultado);
      resultados.errores.push(resultado);
    }
  }
  
  return resultados;
}

// ============================================================================
// IMPLEMENTACIÓN DE ACCIONES
// ============================================================================

/**
 * Ejecuta acción: add_charge
 * CON ERROR BOUNDARIES - Aísla errores de AI de lógica de negocio
 */
function ejecutarAddCharge(accion, usuario, resultado) {
  try {
    // VALIDACIÓN 1: Validar monto
    var validacionMonto = validarMonto(accion.amount, 0);
    if (!validacionMonto.valido) {
      resultado.mensaje = 'Monto inválido: ' + validacionMonto.error;
      resultado.errores.push(validacionMonto.error);
      return resultado;
    }
    
    // VALIDACIÓN 2: Validar cliente
    var validacionCliente = validarNombreCliente(accion.client);
    if (!validacionCliente.valido) {
      resultado.mensaje = 'Cliente inválido: ' + validacionCliente.error;
      resultado.errores.push(validacionCliente.error);
      return resultado;
    }
    
    // VALIDACIÓN 3: Verificar límite
    if (validacionMonto.valor > AI_AGENT_CONFIG.MAX_AMOUNT_PER_ACTION) {
      resultado.mensaje = 'Monto excede el límite permitido ($' + 
                         AI_AGENT_CONFIG.MAX_AMOUNT_PER_ACTION + ')';
      resultado.errores.push('Monto demasiado alto');
      return resultado;
    }
    
    // VALIDACIÓN 4: Verificar que el cliente existe (ERROR BOUNDARY)
    var clienteInfo;
    try {
      clienteInfo = ClientesRepository.buscarPorNombre(validacionCliente.valor);
    } catch (repoError) {
      // ERROR BOUNDARY: Error de repositorio no debe propagarse
      Logger.log('[AI Error Boundary] ClienteRepository error: ' + repoError.message);
      resultado.mensaje = 'Error al verificar cliente. Intente nuevamente.';
      resultado.errores.push('Error interno de verificación');
      return resultado;
    }
    
    if (!clienteInfo) {
      resultado.mensaje = 'Cliente no encontrado: ' + validacionCliente.valor;
      resultado.errores.push('El cliente no existe en el sistema');
      return resultado;
    }
    
    // EJECUCIÓN: Try-catch para aislar errores
    try {
      var movimientoData = {
        cliente: validacionCliente.valor,
        tipo: CONFIG.TIPOS_MOVIMIENTO.DEBE,
        monto: validacionMonto.valor,
        obs: accion.obs || 'Cargo desde AI Agent'
      };
      
      var registrado = MovimientosRepository.registrar(movimientoData);
      
      resultado.exitosa = true;
      resultado.mensaje = 'Cargo registrado exitosamente';
      resultado.datos = {
        id: registrado.id,
        cliente: registrado.cliente,
        monto: registrado.monto,
        saldoPost: registrado.saldoPost
      };
      
    } catch (execError) {
      // ERROR BOUNDARY: Capturar error de ejecución pero no propagar
      Logger.log('[AI Error Boundary] Ejecución fallida: ' + execError.message);
      resultado.mensaje = 'Error al registrar cargo: ' + execError.message;
      resultado.errores.push(execError.message);
    }
    
  } catch (outerError) {
    // ERROR BOUNDARY: Capturar cualquier error no manejado
    Logger.log('[AI Error Boundary] Error no capturado en ejecutarAddCharge: ' + outerError.message);
    resultado.mensaje = 'Error interno inesperado';
    resultado.errores.push('Error de sistema');
  }
  
  return resultado;
}

/**
 * Ejecuta acción: add_payment
 */
function ejecutarAddPayment(accion, usuario, resultado) {
  // Validar monto
  var validacionMonto = validarMonto(accion.amount, 0);
  if (!validacionMonto.valido) {
    resultado.mensaje = 'Monto inválido: ' + validacionMonto.error;
    resultado.errores.push(validacionMonto.error);
    return resultado;
  }
  
  // Validar cliente
  var validacionCliente = validarNombreCliente(accion.client);
  if (!validacionCliente.valido) {
    resultado.mensaje = 'Cliente inválido: ' + validacionCliente.error;
    resultado.errores.push(validacionCliente.error);
    return resultado;
  }
  
  // Verificar límite
  if (validacionMonto.valor > AI_AGENT_CONFIG.MAX_AMOUNT_PER_ACTION) {
    resultado.mensaje = 'Monto excede el límite permitido';
    resultado.errores.push('Monto demasiado alto');
    return resultado;
  }
  
  // Ejecutar usando función existente del sistema
  try {
    var movimientoData = {
      cliente: validacionCliente.valor,
      tipo: CONFIG.TIPOS_MOVIMIENTO.HABER,
      monto: validacionMonto.valor,
      obs: accion.obs || 'Pago desde AI Agent'
    };
    
    var registrado = MovimientosRepository.registrar(movimientoData);
    
    resultado.exitosa = true;
    resultado.mensaje = 'Pago registrado exitosamente';
    resultado.datos = {
      id: registrado.id,
      cliente: registrado.cliente,
      monto: registrado.monto,
      saldoPost: registrado.saldoPost
    };
    
  } catch (e) {
    resultado.mensaje = 'Error al registrar pago: ' + e.message;
    resultado.errores.push(e.message);
  }
  
  return resultado;
}

/**
 * Ejecuta acción: get_client_balance
 * FIX: Retorna datos inmediatamente, no pide cliente nuevamente
 */
function ejecutarGetClientBalance(accion, usuario, resultado) {
  // VALIDACIÓN 1: Validar cliente
  var validacionCliente = validarNombreCliente(accion.client);
  if (!validacionCliente.valido) {
    resultado.mensaje = 'Cliente inválido: ' + validacionCliente.error;
    resultado.errores.push('Cliente no proporcionado correctamente');
    return resultado;
  }

  // VALIDACIÓN 2: Buscar cliente (UNA SOLA VEZ)
  var clienteInfo;
  try {
    clienteInfo = ClientesRepository.buscarPorNombre(validacionCliente.valor);
  } catch (repoError) {
    Logger.log('[AI Error Boundary] Error al buscar cliente: ' + repoError.message);
    resultado.mensaje = 'Error al buscar cliente en el sistema';
    resultado.errores.push('Error interno de búsqueda');
    return resultado;
  }

  // VALIDACIÓN 3: Verificar existencia
  if (!clienteInfo) {
    resultado.mensaje = '❌ Cliente no encontrado: ' + validacionCliente.valor;
    resultado.errores.push('El cliente "' + validacionCliente.valor + '" no existe en el sistema');
    resultado.datos = {
      clienteBuscado: validacionCliente.valor,
      existe: false
    };
    return resultado;
  }

  // EJECUCIÓN: Retornar datos INMEDIATAMENTE
  resultado.exitosa = true;
  resultado.mensaje = '💰 Saldo de ' + clienteInfo.cliente.nombre + ':\n\n**$' + formatearMonto(clienteInfo.cliente.saldo) + '**';
  resultado.datos = {
    cliente: clienteInfo.cliente.nombre,
    saldo: clienteInfo.cliente.saldo,
    saldoFormateado: formatearMonto(clienteInfo.cliente.saldo),
    limite: clienteInfo.cliente.limite,
    disponible: clienteInfo.cliente.limite - clienteInfo.cliente.saldo
  };

  return resultado;
}

/**
 * Ejecuta acción: get_client_info
 * FIX: Retorna datos inmediatamente, no pide cliente nuevamente
 */
function ejecutarGetClientInfo(accion, usuario, resultado) {
  // VALIDACIÓN 1: Validar cliente
  var validacionCliente = validarNombreCliente(accion.client);
  if (!validacionCliente.valido) {
    resultado.mensaje = 'Cliente inválido: ' + validacionCliente.error;
    resultado.errores.push('Cliente no proporcionado correctamente');
    return resultado;
  }

  // VALIDACIÓN 2: Buscar cliente (UNA SOLA VEZ)
  var clienteInfo;
  try {
    clienteInfo = ClientesRepository.buscarPorNombre(validacionCliente.valor);
  } catch (repoError) {
    Logger.log('[AI Error Boundary] Error al buscar cliente: ' + repoError.message);
    resultado.mensaje = 'Error al buscar cliente en el sistema';
    resultado.errores.push('Error interno de búsqueda');
    return resultado;
  }

  // VALIDACIÓN 3: Verificar existencia
  if (!clienteInfo) {
    resultado.mensaje = '❌ Cliente no encontrado: ' + validacionCliente.valor;
    resultado.errores.push('El cliente "' + validacionCliente.valor + '" no existe en el sistema');
    resultado.datos = {
      clienteBuscado: validacionCliente.valor,
      existe: false
    };
    return resultado;
  }

  // EJECUCIÓN: Retornar datos INMEDIATAMENTE
  resultado.exitosa = true;
  resultado.mensaje = '👤 Información de ' + clienteInfo.cliente.nombre + ':\n\n' +
    '📞 Teléfono: ' + (clienteInfo.cliente.tel || 'N/A') + '\n' +
    '📧 Email: ' + (clienteInfo.cliente.email || 'N/A') + '\n' +
    '💰 Saldo: $' + formatearMonto(clienteInfo.cliente.saldo) + '\n' +
    '📊 Límite: $' + formatearMonto(clienteInfo.cliente.limite) + '\n' +
    '✅ Disponible: $' + formatearMonto(clienteInfo.cliente.limite - clienteInfo.cliente.saldo);
  resultado.datos = clienteInfo.cliente;

  return resultado;
}

/**
 * Ejecuta acción: list_clients
 */
function ejecutarListClients(accion, usuario, resultado) {
  try {
    var clientes = ClientesRepository.obtenerTodos();
    
    resultado.exitosa = true;
    resultado.mensaje = 'Lista obtenida: ' + clientes.length + ' clientes';
    resultado.datos = {
      total: clientes.length,
      clientes: clientes.slice(0, 50)  // Máximo 50 para no saturar
    };
    
  } catch (e) {
    resultado.mensaje = 'Error al listar clientes: ' + e.message;
    resultado.errores.push(e.message);
  }
  
  return resultado;
}

/**
 * Ejecuta acción: analyze_system (SOLO LECTURA)
 */
function ejecutarAnalyzeSystem(accion, usuario, resultado) {
  try {
    var analisis = {
      timestamp: new Date().toISOString(),
      hojas: [],
      posiblesErrores: [],
      recomendaciones: []
    };
    
    // Verificar hojas existentes
    var ss = getSpreadsheet();
    var hojasExistentes = ss.getSheets().map(function(h) { return h.getName(); });
    
    var hojasRequeridas = [
      CONFIG.HOJAS.CLIENTES,
      CONFIG.HOJAS.MOVIMIENTOS
    ];
    
    for (var i = 0; i < hojasRequeridas.length; i++) {
      var nombre = hojasRequeridas[i];
      if (hojasExistentes.indexOf(nombre) === -1) {
        analisis.posiblesErrores.push('Hoja requerida no existe: ' + nombre);
      } else {
        analisis.hojas.push(nombre);
      }
    }
    
    // Verificar clientes sin nombre
    var clientesData = ClientesRepository.obtenerTodos();
    var clientesSinNombre = 0;
    for (var j = 0; j < clientesData.length; j++) {
      if (!clientesData[j].nombre || clientesData[j].nombre.trim() === '') {
        clientesSinNombre++;
      }
    }
    
    if (clientesSinNombre > 0) {
      analisis.posiblesErrores.push(clientesSinNombre + ' clientes sin nombre válido');
      analisis.recomendaciones.push('Revisar y completar nombres de clientes');
    }
    
    resultado.exitosa = true;
    resultado.mensaje = 'Análisis completado';
    resultado.datos = analisis;
    
  } catch (e) {
    resultado.mensaje = 'Error en análisis: ' + e.message;
    resultado.errores.push(e.message);
  }
  
  return resultado;
}

/**
 * Ejecuta acción: get_movements
 */
function ejecutarGetMovements(accion, usuario, resultado) {
  try {
    var movimientos = [];
    
    if (accion.client) {
      var validacionCliente = validarNombreCliente(accion.client);
      if (validacionCliente.valido) {
        movimientos = MovimientosRepository.obtenerPorCliente(validacionCliente.valor);
      }
    } else if (accion.limit) {
      movimientos = MovimientosRepository.obtenerRecientes(accion.limit);
    }
    
    resultado.exitosa = true;
    resultado.mensaje = 'Movimientos obtenidos: ' + movimientos.length;
    resultado.datos = {
      total: movimientos.length,
      movimientos: movimientos.slice(0, 50)  // Máximo 50
    };
    
  } catch (e) {
    resultado.mensaje = 'Error al obtener movimientos: ' + e.message;
    resultado.errores.push(e.message);
  }
  
  return resultado;
}

// ============================================================================
// AUDIT LOGGER (Registro de auditoría)
// ============================================================================

/**
 * Registra operación de AI en el log de auditoría
 * @param {string} userInput - Input original del usuario
 * @param {Object} interpretacion - Interpretación del secondary agent
 * @param {Array} acciones - Acciones generadas
 * @param {Object} resultados - Resultados de la ejecución
 * @param {string} usuario - Email del usuario
 */
function auditLogAI(userInput, interpretacion, acciones, resultados, usuario) {
  if (!AI_AGENT_CONFIG.ENABLED_LOGGING) return;
  
  var entrada = {
    timestamp: new Date().toISOString(),
    usuario: usuario || Session.getActiveUser().getEmail(),
    userInput: userInput,
    interpretacion: interpretacion,
    accionesSolicitadas: acciones.length,
    accionesExitosas: resultados.exitosas,
    accionesFallidas: resultados.fallidas,
    detalles: resultados.detalles
  };
  
  // Guardar en PropertiesService para auditoría futura
  try {
    var props = PropertiesService.getScriptProperties();
    var logExistente = props.getProperty('AI_AUDIT_LOG');
    var logArray = logExistente ? JSON.parse(logExistente) : [];
    
    // Mantener últimos 100 registros
    logArray.unshift(entrada);
    if (logArray.length > 100) {
      logArray = logArray.slice(0, 100);
    }
    
    props.setProperty('AI_AUDIT_LOG', JSON.stringify(logArray));
    
    Logger.log('[AI AUDIT] Usuario: ' + entrada.usuario + 
               ' | Input: ' + userInput.substring(0, 50) + 
               ' | Acciones: ' + acciones.length);
    
  } catch (e) {
    Logger.log('[AI AUDIT ERROR] No se pudo guardar el log: ' + e.message);
  }
}

// ============================================================================
// API PÚBLICA PARA EL FRONTEND
// ============================================================================

/**
 * Endpoint principal para el chatbot AI
 * @param {Object} data - { message: string, contexto: object }
 * @returns {Object} Respuesta estructurada
 */
function procesarConsultaAI(data) {
  try {
    if (!AI_AGENT_CONFIG.ENABLED) {
      return {
        success: false,
        error: 'El asistente AI está deshabilitado'
      };
    }
    
    if (!data || !data.message) {
      return {
        success: false,
        error: 'Mensaje no proporcionado'
      };
    }
    
    var usuario = Session.getActiveUser().getEmail();
    var userInput = data.message;
    var contexto = data.contexto || {};
    
    Logger.log('[AI CHAT] Usuario: ' + usuario + ' | Mensaje: ' + userInput);
    
    // Paso 1: Primary AI Agent genera acciones
    var respuestaAI = primaryAIAgent(userInput, contexto);
    
    // Si no hay acciones (solo mensaje informativo), retornar
    if (!respuestaAI.actions || respuestaAI.actions.length === 0) {
      return {
        success: true,
        message: respuestaAI.message,
        actions: [],
        dryRun: AI_AGENT_CONFIG.DRY_RUN_MODE
      };
    }
    
    // Paso 2: Action Interpreter ejecuta acciones
    var resultados = actionInterpreter(respuestaAI.actions, usuario);
    
    // Paso 3: Audit log
    auditLogAI(userInput, respuestaAI.interpretacion, respuestaAI.actions, resultados, usuario);
    
    // Paso 4: Construir respuesta para el usuario
    var respuestaUsuario = construirRespuestaUsuario(resultados, respuestaAI.message);
    
    return {
      success: true,
      message: respuestaUsuario,
      actions: respuestaAI.actions,
      resultados: resultados,
      dryRun: AI_AGENT_CONFIG.DRY_RUN_MODE
    };
    
  } catch (e) {
    Logger.log('[AI CHAT ERROR] ' + e.message);
    return {
      success: false,
      error: 'Error interno del AI Agent: ' + e.message
    };
  }
}

/**
 * Construye respuesta legible para el usuario
 */
function construirRespuestaUsuario(resultados, mensajePrevio) {
  var lineas = [];
  
  if (mensajePrevio) {
    lineas.push(mensajePrevio);
    lineas.push('');
  }
  
  lineas.push('📊 **Resultados:**');
  lineas.push('✅ Exitosas: ' + resultados.exitosas);
  
  if (resultados.fallidas > 0) {
    lineas.push('❌ Fallidas: ' + resultados.fallidas);
  }
  
  // Agregar detalles de cada acción
  for (var i = 0; i < resultados.detalles.length; i++) {
    var det = resultados.detalles[i];
    if (det.exitosa) {
      lineas.push('  ✓ ' + det.tipo + ': ' + det.mensaje);
    } else {
      lineas.push('  ✗ ' + det.tipo + ': ' + det.mensaje);
    }
  }
  
  return lineas.join('\n');
}

/**
 * Obtiene el log de auditoría de AI (para admin)
 * @param {number} limite - Cantidad de registros a devolver
 * @returns {Array} Log de auditoría
 */
function obtenerAuditLogAI(limite) {
  limite = limite || 50;
  
  try {
    var props = PropertiesService.getScriptProperties();
    var logExistente = props.getProperty('AI_AUDIT_LOG');
    
    if (!logExistente) {
      return [];
    }
    
    var logArray = JSON.parse(logExistente);
    return logArray.slice(0, limite);
    
  } catch (e) {
    Logger.log('[AI AUDIT] Error al obtener log: ' + e.message);
    return [];
  }
}
