/**
 * ============================================================================
 * AFIP PADRON - SISTEMA SOL & VERDE
 * ============================================================================
 * Consulta de CUIT en padrón AFIP (ws_sr_padron_a13)
 * Devuelve datos CRUDOS de AFIP - sin heurísticas
 * ============================================================================
 */

/**
 * Consulta datos de un CUIT en el padrón AFIP
 * @param {string} cuit - CUIT a consultar (con o sin guiones)
 * @returns {Object} {
 *   encontrado: boolean,
 *   cuit: string,
 *   razonSocial: string,
 *   tipoPersona: string,
 *   domicilio: string,
 *   impuestos: Array,
 *   categorias: Array,
 *   estadoClave: string,
 *   rawResponse: Object
 * }
 * @throws {Error} Si falla autenticación o conexión
 */
function afipConsultarCUIT(cuit) {
  // Limpiar CUIT
  var cuitLimpio = String(cuit).replace(/[-\s]/g, '');
  
  // Validar formato
  if (!/^\d{11}$/.test(cuitLimpio)) {
    return {
      encontrado: false,
      error: 'CUIT inválido',
      mensaje: 'El CUIT debe tener 11 dígitos numéricos',
      cuit: cuitLimpio
    };
  }
  
  // Validar checksum (algoritmo módulo 11)
  if (typeof validarCUIT === 'function') {
    var validacion = validarCUIT(cuitLimpio);
    if (!validacion.valido) {
      return {
        encontrado: false,
        error: 'CUIT inválido',
        mensaje: validacion.error,
        cuit: cuitLimpio
      };
    }
  }
  
  // Autenticar
  var auth = afipGetAuth(AFIP_CONFIG.WS.PADRON_A13);
  
  // Payload de consulta
  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,  // REQUERIDO
    method: 'getPersona',
    wsid: AFIP_CONFIG.WS.PADRON_A13,
    params: {
      token: auth.token,
      sign: auth.sign,
      cuitRepresentada: auth.cuit,
      idPersona: cuitLimpio
    }
  };
  
  // Agregar certificado si existe
  var creds = afipGetCredentials();
  if (creds.cert && creds.key) {
    payload.cert = creds.cert;
    payload.key = creds.key;
  }
  
  // Headers
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type': 'application/json'
  };
  
  // Request con retry
  var resultado = afipFetchConRetry('/requests', payload, headers);
  
  // Log para debugging
  Logger.log('[AFIP PADRON] CUIT ' + cuitLimpio + ' - Respuesta: ' + JSON.stringify(resultado).substring(0, 500));
  
  // Parsear respuesta
  return afipParsearRespuestaPadron(resultado, cuitLimpio);
}

/**
 * Parsea respuesta del padrón AFIP
 * @param {Object} resultado - Respuesta raw de AFIP
 * @param {string} cuitLimpio - CUIT consultado
 * @returns {Object} Datos parseados
 */
function afipParsearRespuestaPadron(resultado, cuitLimpio) {
  // Buscar estructura de persona
  var persona = resultado.personaReturn || resultado.persona || resultado.data || null;
  
  if (!persona) {
    // Respuesta vacía = sin datos públicos
    if (resultado && Object.keys(resultado).length > 0 && !resultado.errors) {
      return {
        encontrado: true,
        cuit: cuitLimpio,
        razonSocial: 'SIN DATOS PUBLICOS',
        tipoPersona: '',
        domicilio: '',
        impuestos: [],
        categorias: [],
        estadoClave: 'ACTIVO',
        mensaje: 'CUIT válido pero AFIP no devuelve datos públicos',
        rawResponse: resultado
      };
    }
    
    return {
      encontrado: false,
      error: 'CUIT no encontrado',
      mensaje: 'El CUIT no existe en el padrón de AFIP',
      cuit: cuitLimpio,
      rawResponse: resultado
    };
  }
  
  // Obtener datosGenerales
  var datosGenerales = persona.datosGenerales || persona;
  
  // Extraer campos documentados
  var razonSocial = datosGenerales.razonSocial || '';
  var tipoPersona = datosGenerales.tipoPersona || '';
  var estadoClave = datosGenerales.estadoClave || 'ACTIVO';
  
  // Domicilio fiscal
  var domicilio = '';
  if (datosGenerales.domicilioFiscal) {
    var partes = [
      datosGenerales.domicilioFiscal.direccion || '',
      datosGenerales.domicilioFiscal.localidad || '',
      datosGenerales.domicilioFiscal.descripcionProvincia || ''
    ].filter(function(p) { return p.trim(); });
    domicilio = partes.join(', ');
  }
  
  // Impuestos
  var impuestos = [];
  if (persona.datosRegimenGeneral && persona.datosRegimenGeneral.impuesto) {
    var impuestosRaw = persona.datosRegimenGeneral.impuesto;
    impuestos = Array.isArray(impuestosRaw) ? impuestosRaw : [impuestosRaw];
  }
  
  // Categorías
  var categorias = persona.categorias || [];
  
  // Determinar condición IVA según impuestos
  var condicionIVA = afipDeterminarCondicionIVA(impuestos, persona);
  
  return {
    encontrado: true,
    cuit: cuitLimpio,
    razonSocial: razonSocial,
    tipoPersona: tipoPersona,
    domicilio: domicilio,
    impuestos: impuestos,
    categorias: categorias,
    condicionIVA: condicionIVA,
    estadoClave: estadoClave,
    rawResponse: resultado
  };
}

/**
 * Determina condición IVA según impuestos AFIP
 * @param {Array} impuestos - Lista de impuestos
 * @param {Object} persona - Persona completa
 * @returns {string} 'RI', 'M', 'CF', etc.
 */
function afipDeterminarCondicionIVA(impuestos, persona) {
  // IDs AFIP: 30=IVA, 32=Ganancias, 20=Monotributo
  var esRI = impuestos.some(function(imp) {
    var id = Number(imp.idImpuesto || imp.id || 0);
    return id === 30 || id === 32;
  });
  
  var esMonotributo = (persona.datosMonotributo && persona.datosMonotributo.categoriaMonotributo) ||
                      impuestos.some(function(imp) {
                        var id = Number(imp.idImpuesto || imp.id || 0);
                        return id === 20;
                      });
  
  if (esRI) return 'RI';
  if (esMonotributo) return 'M';
  return 'CF';
}
