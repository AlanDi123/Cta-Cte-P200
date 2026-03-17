/**
 * ============================================================================
 * AFIP AUTENTICACION - SISTEMA SOL & VERDE
 * ============================================================================
 * Autenticación con AFIP SDK REST API
 * Flujo: Obtener token/sign para un web service específico
 * ============================================================================
 */

/**
 * Obtiene autenticación para un web service específico
 * @param {string} wsid - 'wsfe' o 'ws_sr_padron_a13'
 * @returns {Object} {token, sign, cuit, environment}
 * @throws {Error} Si no hay certificado o falla autenticación
 */
function afipGetAuth(wsid) {
  // Verificar configuración
  var config = afipVerificarConfiguracion();
  
  if (!config.configurado) {
    throw new Error('AFIP no configurado: ' + config.error);
  }
  
  // Certificado es OBLIGATORIO para producción
  if (!config.tieneCertificado) {
    throw new Error('Se requiere certificado para operar con AFIP. Generar en Configuración > Facturación ARCA.');
  }
  
  var creds = afipGetCredentials();
  
  // Payload de autenticación
  var payload = {
    tax_id: creds.cuit,
    wsid: wsid,
    cert: creds.cert,
    key: creds.key
  };
  
  // Headers
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type': 'application/json'
  };
  
  // Request
  var response = afipFetch('/auth', payload, headers);
  
  if (!response.token || !response.sign) {
    throw new Error('Error de autenticación AFIP: no se recibieron token/sign');
  }
  
  return {
    token: response.token,
    sign: response.sign,
    cuit: creds.cuit,
    environment: AFIP_CONFIG.ENVIRONMENT
  };
}

/**
 * Realiza HTTP request a AFIP SDK
 * @param {string} endpoint - Endpoint relativo
 * @param {Object} payload - Payload del request
 * @param {Object} headers - Headers HTTP
 * @param {string} method - 'post' o 'get'
 * @returns {Object} Respuesta parseada
 * @throws {Error} Si falla el request
 */
function afipFetch(endpoint, payload, headers, method) {
  var url = AFIP_CONFIG.API_URL + endpoint;
  var httpMethod = method || 'post';
  
  var options = {
    method: httpMethod,
    contentType: 'application/json',
    headers: headers || {},
    muteHttpExceptions: true,
    timeout: AFIP_CONFIG.TIMEOUT_MS
  };
  
  if (payload && httpMethod === 'post') {
    options.payload = JSON.stringify(payload);
  }
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  
  // Manejar errores HTTP
  if (code === 401 || code === 403) {
    throw new Error('Access Token inválido o expirado (HTTP ' + code + ')');
  }
  
  if (code !== 200) {
    var errorMsg = 'Error AFIP (HTTP ' + code + ')';
    try {
      var errorData = JSON.parse(text);
      errorMsg += ': ' + (errorData.message || errorData.error || JSON.stringify(errorData));
    } catch (e) {
      errorMsg += ': ' + text.substring(0, 200);
    }
    throw new Error(errorMsg);
  }
  
  // Parsear respuesta
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Respuesta inválida de AFIP: ' + text.substring(0, 200));
  }
}

/**
 * Realiza request con retry para errores transitorios
 * @param {string} endpoint - Endpoint
 * @param {Object} payload - Payload
 * @param {Object} headers - Headers
 * @param {string} method - Método HTTP
 * @returns {Object} Respuesta
 */
function afipFetchConRetry(endpoint, payload, headers, method) {
  var maxIntentos = 3;
  var delayBaseMs = 1000;
  
  for (var intento = 1; intento <= maxIntentos; intento++) {
    try {
      return afipFetch(endpoint, payload, headers, method);
    } catch (error) {
      var msgLower = error.message.toLowerCase();
      var esReintentable = msgLower.indexOf('timeout') >= 0 ||
                           msgLower.indexOf('service unavailable') >= 0 ||
                           msgLower.indexOf('exceeded') >= 0;
      
      if (!esReintentable || intento === maxIntentos) {
        throw error;
      }
      
      var delayMs = delayBaseMs * Math.pow(2, intento - 1);
      Logger.log('[AFIP] Reintentando en ' + delayMs + 'ms (intento ' + intento + '/' + maxIntentos + ')');
      Utilities.sleep(delayMs);
    }
  }
}
