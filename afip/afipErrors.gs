/**
 * ============================================================================
 * AFIP ERRORES - SISTEMA SOL & VERDE
 * ============================================================================
 * Manejo estandarizado de errores de AFIP
 * ============================================================================
 */

/**
 * Códigos de error comunes de AFIP
 */
var AFIP_ERROR_CODES = {
  // Errores de autenticación
  AUTH_INVALID_TOKEN: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_CERT_EXPIRED: 1001,
  
  // Errores de validación
  VALIDATION_INVALID_CUIT: 2001,
  VALIDATION_INVALID_CBTE: 2002,
  VALIDATION_DATE_RANGE: 2003,
  VALIDATION_IMPORTS: 2004,
  
  // Errores de negocio
  BUSINESS_CUIT_NOT_FOUND: 3001,
  BUSINESS_NO_DATA: 3002,
  BUSINESS_REJECTED: 3003,
  
  // Errores de sistema
  SYSTEM_TIMEOUT: 5001,
  SYSTEM_UNAVAILABLE: 5002,
  SYSTEM_QUOTA: 5003
};

/**
 * Clasifica un error de AFIP
 * @param {Error|string} error
 * @returns {Object} {code, category, message, retryable}
 */
function afipClasificarError(error) {
  var message = error.message || String(error);
  var msgLower = message.toLowerCase();
  
  // Autenticación
  if (msgLower.indexOf('token') >= 0 || msgLower.indexOf('401') >= 0) {
    return {
      code: AFIP_ERROR_CODES.AUTH_INVALID_TOKEN,
      category: 'AUTH',
      message: 'Token de acceso inválido o expirado',
      retryable: false
    };
  }
  
  if (msgLower.indexOf('certificado') >= 0 || msgLower.indexOf('403') >= 0) {
    return {
      code: AFIP_ERROR_CODES.AUTH_CERT_EXPIRED,
      category: 'AUTH',
      message: 'Certificado expirado o inválido',
      retryable: false
    };
  }
  
  // Validación
  if (msgLower.indexOf('cuit') >= 0 && msgLower.indexOf('inválido') >= 0) {
    return {
      code: AFIP_ERROR_CODES.VALIDATION_INVALID_CUIT,
      category: 'VALIDATION',
      message: 'CUIT inválido',
      retryable: false
    };
  }
  
  if (msgLower.indexOf('fecha') >= 0 || msgLower.indexOf('día') >= 0) {
    return {
      code: AFIP_ERROR_CODES.VALIDATION_DATE_RANGE,
      category: 'VALIDATION',
      message: 'Fecha fuera de rango válido',
      retryable: false
    };
  }
  
  // Negocio
  if (msgLower.indexOf('no existe') >= 0 || msgLower.indexOf('no encontrado') >= 0) {
    return {
      code: AFIP_ERROR_CODES.BUSINESS_CUIT_NOT_FOUND,
      category: 'BUSINESS',
      message: 'CUIT no encontrado en padrón',
      retryable: false
    };
  }
  
  if (msgLower.indexOf('rechaz') >= 0) {
    return {
      code: AFIP_ERROR_CODES.BUSINESS_REJECTED,
      category: 'BUSINESS',
      message: 'Comprobante rechazado por AFIP',
      retryable: false
    };
  }
  
  // Sistema (reintentables)
  if (msgLower.indexOf('timeout') >= 0) {
    return {
      code: AFIP_ERROR_CODES.SYSTEM_TIMEOUT,
      category: 'SYSTEM',
      message: 'Timeout de conexión',
      retryable: true
    };
  }
  
  if (msgLower.indexOf('unavailable') >= 0 || msgLower.indexOf('disponible') >= 0) {
    return {
      code: AFIP_ERROR_CODES.SYSTEM_UNAVAILABLE,
      category: 'SYSTEM',
      message: 'Servicio no disponible temporalmente',
      retryable: true
    };
  }
  
  // Desconocido
  return {
    code: 9999,
    category: 'UNKNOWN',
    message: message,
    retryable: false
  };
}

/**
 * Formatea error para mostrar al usuario
 * @param {Error} error
 * @returns {string} Mensaje amigable
 */
function afipFormatearErrorUsuario(error) {
  var clasificacion = afipClasificarError(error);
  
  switch (clasificacion.category) {
    case 'AUTH':
      return 'Error de autenticación con AFIP. Verificá el certificado en Configuración.';
    
    case 'VALIDATION':
      return 'Error de validación: ' + clasificacion.message;
    
    case 'BUSINESS':
      return 'AFIP rechazó la operación: ' + clasificacion.message;
    
    case 'SYSTEM':
      return 'Error temporal de AFIP. Intentá en unos minutos.';
    
    default:
      return 'Error al conectar con AFIP: ' + clasificacion.message.substring(0, 100);
  }
}

/**
 * Registra error para auditoría
 * @param {string} operacion
 * @param {Error} error
 * @param {Object} contexto
 */
function afipRegistrarError(operacion, error, contexto) {
  var clasificacion = afipClasificarError(error);
  
  Logger.log('[AFIP ERROR] Operación: ' + operacion);
  Logger.log('[AFIP ERROR] Categoría: ' + clasificacion.category);
  Logger.log('[AFIP ERROR] Código: ' + clasificacion.code);
  Logger.log('[AFIP ERROR] Mensaje: ' + clasificacion.message);
  Logger.log('[AFIP ERROR] Detalle: ' + error.message);
  
  if (contexto) {
    Logger.log('[AFIP ERROR] Contexto: ' + JSON.stringify(contexto).substring(0, 200));
  }
}
