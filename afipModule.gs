// ============================================================================
// MÓDULO AFIP/ARCA — SISTEMA SOL & VERDE
// ARCHIVO RAÍZ (sin subcarpetas — GAS V8 no soporta subdirectorios)
// Contenido: Config + Auth + Errors + Padron + Factura
// ============================================================================

// ─── SECCIÓN 1: CONFIGURACIÓN ───────────────────────────────────────────────

var AFIP_CONFIG = {
  API_URL:     'https://app.afipsdk.com/api/v1/afip',
  ENVIRONMENT: 'prod',
  TIMEOUT_MS:  30000,
  WS: {
    FE:        'wsfe',
    PADRON_A13: 'ws_sr_padron_a13'
  },
  CBTE_TIPOS: {
    FACTURA_A:    1,
    NOTA_CREDITO_A: 3,
    FACTURA_B:    6,
    NOTA_CREDITO_B: 8
  },
  DOC_TIPOS: {
    CUIT:             80,
    DNI:              96,
    CONSUMIDOR_FINAL: 99
  },
  CONCEPTO: { PRODUCTOS: 1, SERVICIOS: 2, AMBOS: 3 },
  MONEDA:   { PESOS: 'PES', DOLARES: 'DOL' },
  HOJA_FACTURAS: 'FACTURAS_EMITIDAS'
};

function afipGetEmisorConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    CUIT:           props.getProperty('EMISOR_CUIT')           || '',
    RAZON_SOCIAL:   props.getProperty('EMISOR_RAZON_SOCIAL')   || '',
    NOMBRE_FANTASIA: props.getProperty('EMISOR_NOMBRE_FANTASIA') || '',
    DOMICILIO:      props.getProperty('EMISOR_DOMICILIO')      || '',
    INGRESOS_BRUTOS: props.getProperty('EMISOR_IIBB')         || '',
    CONDICION_IVA:  props.getProperty('EMISOR_CONDICION_IVA') || 'Responsable Inscripto'
  };
}

function afipGetCredentials() {
  var props = PropertiesService.getScriptProperties();
  return {
    accessToken: props.getProperty('AFIP_ACCESS_TOKEN') || '',
    puntoVenta:  parseInt(props.getProperty('AFIP_PUNTO_VENTA') || '1'),
    cuit:        props.getProperty('AFIP_CUIT') || '',
    cert:        props.getProperty('AFIP_CERT') || '',
    key:         props.getProperty('AFIP_KEY')  || ''
  };
}

function afipTieneCertificado() {
  var creds = afipGetCredentials();
  return !!(creds.cert && creds.cert.length > 50 && creds.key && creds.key.length > 50);
}

function afipVerificarConfiguracion() {
  var creds  = afipGetCredentials();
  var emisor = afipGetEmisorConfig();
  if (!creds.accessToken || creds.accessToken.length < 10) {
    return { configurado: false, tieneCertificado: false, error: 'Access Token de AFIP SDK no configurado' };
  }
  if (!emisor.CUIT) {
    return { configurado: false, tieneCertificado: false, error: 'CUIT del emisor no configurado' };
  }
  return { configurado: true, tieneCertificado: afipTieneCertificado(), error: null };
}

// ─── SECCIÓN 2: HTTP FETCH ───────────────────────────────────────────────────

function afipFetch(endpoint, payload, headers, method) {
  var url        = AFIP_CONFIG.API_URL + endpoint;
  var httpMethod = method || 'post';
  var options = {
    method:          httpMethod,
    contentType:     'application/json',
    headers:         headers || {},
    muteHttpExceptions: true,
    timeout:         AFIP_CONFIG.TIMEOUT_MS
  };
  if (payload && httpMethod === 'post') {
    options.payload = JSON.stringify(payload);
  }
  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

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
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Respuesta inválida de AFIP: ' + text.substring(0, 200));
  }
}

function afipFetchConRetry(endpoint, payload, headers, method) {
  var maxIntentos  = 3;
  var delayBaseMs  = 1000;
  for (var intento = 1; intento <= maxIntentos; intento++) {
    try {
      return afipFetch(endpoint, payload, headers, method);
    } catch (error) {
      var msgLower = error.message.toLowerCase();
      var esReintentable = msgLower.indexOf('timeout') >= 0 ||
                           msgLower.indexOf('service unavailable') >= 0 ||
                           msgLower.indexOf('exceeded') >= 0;
      if (!esReintentable || intento === maxIntentos) throw error;
      var delayMs = delayBaseMs * Math.pow(2, intento - 1);
      Logger.log('[AFIP] Reintentando en ' + delayMs + 'ms (intento ' + intento + '/' + maxIntentos + ')');
      Utilities.sleep(delayMs);
    }
  }
}

// ─── SECCIÓN 3: AUTENTICACIÓN ────────────────────────────────────────────────

function afipGetAuth(wsid) {
  var config = afipVerificarConfiguracion();
  if (!config.configurado)      throw new Error('AFIP no configurado: ' + config.error);
  if (!config.tieneCertificado) throw new Error('Se requiere certificado para operar con AFIP.');

  var creds = afipGetCredentials();

  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    tax_id:      creds.cuit,
    wsid:        wsid,
    cert:        creds.cert,
    key:         creds.key
  };
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type':  'application/json'
  };

  var response = afipFetch('/auth', payload, headers);

  if (!response.token || !response.sign) {
    throw new Error('Error de autenticación AFIP: no se recibieron token/sign. Respuesta: ' +
                    JSON.stringify(response).substring(0, 300));
  }
  return {
    token:       response.token,
    sign:        response.sign,
    cuit:        creds.cuit,
    environment: AFIP_CONFIG.ENVIRONMENT
  };
}

// ─── SECCIÓN 4: ERRORES ──────────────────────────────────────────────────────

var AFIP_ERROR_CODES = {
  AUTH_INVALID_TOKEN: 401, AUTH_CERT_EXPIRED: 1001,
  VALIDATION_INVALID_CUIT: 2001, VALIDATION_DATE_RANGE: 2003,
  BUSINESS_CUIT_NOT_FOUND: 3001, BUSINESS_REJECTED: 3003,
  SYSTEM_TIMEOUT: 5001, SYSTEM_UNAVAILABLE: 5002
};

function afipClasificarError(error) {
  var message  = error.message || String(error);
  var msgLower = message.toLowerCase();
  if (msgLower.indexOf('token') >= 0 || msgLower.indexOf('401') >= 0)
    return { code: AFIP_ERROR_CODES.AUTH_INVALID_TOKEN, category: 'AUTH', message: 'Token inválido o expirado', retryable: false };
  if (msgLower.indexOf('certificado') >= 0 || msgLower.indexOf('403') >= 0)
    return { code: AFIP_ERROR_CODES.AUTH_CERT_EXPIRED, category: 'AUTH', message: 'Certificado expirado o inválido', retryable: false };
  if (msgLower.indexOf('cuit') >= 0 && (msgLower.indexOf('inválido') >= 0 || msgLower.indexOf('invalido') >= 0))
    return { code: AFIP_ERROR_CODES.VALIDATION_INVALID_CUIT, category: 'VALIDATION', message: 'CUIT inválido', retryable: false };
  if (msgLower.indexOf('no existe') >= 0 || msgLower.indexOf('no encontrado') >= 0)
    return { code: AFIP_ERROR_CODES.BUSINESS_CUIT_NOT_FOUND, category: 'BUSINESS', message: 'CUIT no encontrado en padrón', retryable: false };
  if (msgLower.indexOf('rechaz') >= 0)
    return { code: AFIP_ERROR_CODES.BUSINESS_REJECTED, category: 'BUSINESS', message: 'AFIP rechazó la operación', retryable: false };
  if (msgLower.indexOf('timeout') >= 0)
    return { code: AFIP_ERROR_CODES.SYSTEM_TIMEOUT, category: 'SYSTEM', message: 'Timeout de conexión', retryable: true };
  if (msgLower.indexOf('unavailable') >= 0)
    return { code: AFIP_ERROR_CODES.SYSTEM_UNAVAILABLE, category: 'SYSTEM', message: 'Servicio no disponible', retryable: true };
  return { code: 9999, category: 'UNKNOWN', message: message, retryable: false };
}

function afipFormatearErrorUsuario(error) {
  var c = afipClasificarError(error);
  switch (c.category) {
    case 'AUTH':       return 'Error de autenticación con AFIP. Verificá el certificado en Configuración.';
    case 'VALIDATION': return 'Error de validación: ' + c.message;
    case 'BUSINESS':   return 'AFIP rechazó la operación: ' + c.message;
    case 'SYSTEM':     return 'Error temporal de AFIP. Intentá en unos minutos.';
    default:           return 'Error al conectar con AFIP: ' + c.message.substring(0, 100);
  }
}

function afipRegistrarError(operacion, error, contexto) {
  Logger.log('[AFIP ERROR] Operación: ' + operacion + ' | ' + (error.message || error));
  if (contexto) Logger.log('[AFIP ERROR] Contexto: ' + JSON.stringify(contexto).substring(0, 200));
}

// ─── SECCIÓN 5: PADRÓN — ws_sr_constancia_inscripcion + getPersona_v2 ────────
// IMPORTANTE: ws_sr_padron_a13 NO devuelve condición IVA (RI/M/CF).
// El correcto para datos fiscales completos es ws_sr_constancia_inscripcion.

function afipConsultarCUIT(cuit) {
  var cuitLimpio = String(cuit).replace(/[-\s]/g, '');

  if (!/^\d{11}$/.test(cuitLimpio)) {
    return { encontrado: false, error: 'CUIT inválido', mensaje: 'Debe tener 11 dígitos', cuit: cuitLimpio };
  }
  if (typeof validarCUIT === 'function') {
    var v = validarCUIT(cuitLimpio);
    if (!v.valido) return { encontrado: false, error: 'CUIT inválido', mensaje: v.error, cuit: cuitLimpio };
  }

  // ws_sr_constancia_inscripcion devuelve condición IVA, impuestos, monotributo
  var WS_PADRON = 'ws_sr_constancia_inscripcion';
  var auth      = afipGetAuth(WS_PADRON);
  var creds     = afipGetCredentials();

  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    method:      'getPersona_v2',
    wsid:        WS_PADRON,
    params: {
      token:            auth.token,
      sign:             auth.sign,
      cuitRepresentada: auth.cuit,
      idPersona:        parseInt(cuitLimpio, 10)  // debe ser número, no string
    }
  };
  if (creds.cert && creds.key) { payload.cert = creds.cert; payload.key = creds.key; }

  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type':  'application/json'
  };

  try {
    var resultado = afipFetchConRetry('/requests', payload, headers);
    Logger.log('[AFIP PADRON] CUIT ' + cuitLimpio + ': ' + JSON.stringify(resultado).substring(0, 500));
    return afipParsearRespuestaPadron(resultado, cuitLimpio);
  } catch (error) {
    Logger.log('[AFIP PADRON] Error consultando CUIT ' + cuitLimpio + ': ' + error.message);
    return { encontrado: false, error: error.message, cuit: cuitLimpio };
  }
}

function afipParsearRespuestaPadron(resultado, cuitLimpio) {
  // getPersona_v2 devuelve { persona: { datosGenerales, datosMonotributo, datosRegimenGeneral, ... } }
  var persona = resultado.persona ||
                resultado.personaReturn ||
                resultado.data ||
                null;

  if (!persona) {
    // Puede ser respuesta vacía con clave "personaNoRegistrada"
    if (resultado.personaNoRegistrada) {
      return { encontrado: false, error: 'CUIT no registrado en ARCA', cuit: cuitLimpio };
    }
    // Si hay otros campos pero sin persona, es CUIT válido sin datos públicos
    if (resultado && Object.keys(resultado).length > 0) {
      return {
        encontrado:     true,
        cuit:           cuitLimpio,
        razonSocial:    'SIN DATOS PUBLICOS',
        tipoPersona:    '',
        domicilio:      '',
        impuestos:      [],
        condicionIVA:   'CF',
        condicionTexto: 'Consumidor Final',
        estadoClave:    'ACTIVO',
        mensaje:        'CUIT válido pero sin datos públicos',
        rawResponse:    resultado
      };
    }
    return { encontrado: false, error: 'CUIT no encontrado en ARCA', cuit: cuitLimpio };
  }

  var dg  = persona.datosGenerales || persona;

  // Razón social: para personas físicas = apellido + nombre
  var razonSocial = dg.razonSocial || '';
  if (!razonSocial && dg.apellido) {
    razonSocial = (dg.apellido + (dg.nombre ? ', ' + dg.nombre : '')).trim();
  }

  var tipoPersona = dg.tipoPersona || '';
  var estadoClave = dg.estadoClave || 'ACTIVO';

  // Domicilio fiscal
  var domicilio = '';
  if (dg.domicilioFiscal) {
    var df = dg.domicilioFiscal;
    domicilio = [df.direccion || '', df.localidad || '', df.descripcionProvincia || '']
      .map(function(p) { return (p || '').trim(); })
      .filter(function(p) { return p; })
      .join(', ');
  }

  // Impuestos (dentro de datosRegimenGeneral)
  var impuestos = [];
  if (persona.datosRegimenGeneral && persona.datosRegimenGeneral.impuesto) {
    var raw = persona.datosRegimenGeneral.impuesto;
    impuestos = Array.isArray(raw) ? raw : [raw];
  }

  // Monotributo
  var categoriaMonotributo = '';
  var esMonotributo = false;
  if (persona.datosMonotributo) {
    esMonotributo = true;
    categoriaMonotributo = persona.datosMonotributo.categoriaMonotributo || '';
  }
  // También verificar por impuesto ID 20
  if (!esMonotributo) {
    esMonotributo = impuestos.some(function(imp) {
      return Number(imp.idImpuesto || imp.id || 0) === 20;
    });
  }

  // Responsable Inscripto: impuesto ID 30 (IVA) o 32 (Ganancias)
  var esRI = impuestos.some(function(imp) {
    var id = Number(imp.idImpuesto || imp.id || 0);
    return id === 30 || id === 32;
  });

  var condicionIVA;
  if (esRI)          condicionIVA = 'RI';
  else if (esMonotributo) condicionIVA = 'M';
  else               condicionIVA = 'CF';

  var condicionTexto = condicionIVA === 'RI' ? 'Responsable Inscripto' :
                       condicionIVA === 'M'  ? 'Monotributista'        : 'Consumidor Final';

  return {
    encontrado:           true,
    cuit:                 cuitLimpio,
    razonSocial:          razonSocial,
    tipoPersona:          tipoPersona,
    domicilio:            domicilio,
    impuestos:            impuestos,
    condicionIVA:         condicionIVA,
    condicionTexto:       condicionTexto,
    categoriaMonotributo: categoriaMonotributo,
    estadoClave:          estadoClave,
    estadoContribuyente:  estadoClave,
    rawResponse:          resultado
  };
}

function afipDeterminarCondicionIVA(impuestos, persona) {
  var esRI = impuestos.some(function(imp) {
    var id = Number(imp.idImpuesto || imp.id || 0);
    return id === 30 || id === 32;
  });
  var esMonotributo = (persona.datosMonotributo && persona.datosMonotributo.categoriaMonotributo) ||
                      impuestos.some(function(imp) {
                        return Number(imp.idImpuesto || imp.id || 0) === 20;
                      });
  if (esRI) return 'RI';
  if (esMonotributo) return 'M';
  return 'CF';
}

// ─── SECCIÓN 6: FACTURACIÓN ELECTRÓNICA (WSFE) ───────────────────────────────

function afipEmitirFactura(datosFactura) {
  if (!datosFactura.cbteTipo || !datosFactura.total) throw new Error('Datos de factura inválidos');

  var auth   = afipGetAuth(AFIP_CONFIG.WS.FE);
  var creds  = afipGetCredentials();
  var emisor = afipGetEmisorConfig();
  var fechaCbte    = afipCalcularFechaValida(datosFactura.fechaTransferencia);
  var feDetRequest = afipConstruirFECAEDetRequest(datosFactura, fechaCbte, emisor);

  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    method:      'FECAESolicitar',
    wsid:        AFIP_CONFIG.WS.FE,
    params: {
      Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: creds.puntoVenta, CbteTipo: datosFactura.cbteTipo },
        FeDetReq: { FECAEDetRequest: feDetRequest }
      }
    }
  };
  if (creds.cert && creds.key) { payload.cert = creds.cert; payload.key = creds.key; }

  var headers = { 'Authorization': 'Bearer ' + creds.accessToken, 'Content-Type': 'application/json' };
  Logger.log('[AFIP FACTURA] Enviando comprobante tipo ' + datosFactura.cbteTipo);
  var resultado = afipFetchConRetry('/requests', payload, headers);
  return afipParsearRespuestaFactura(resultado, datosFactura);
}

function afipCalcularFechaValida(fechaTransferencia) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (!fechaTransferencia) return afipFormatoFecha(hoy);
  var fechaTrans = new Date(fechaTransferencia);
  fechaTrans.setHours(0, 0, 0, 0);
  var diffDias = Math.floor((hoy - fechaTrans) / (1000 * 60 * 60 * 24));
  if (diffDias >= 0 && diffDias <= 5) return afipFormatoFecha(fechaTrans);
  if (diffDias > 5) {
    var limite = new Date(hoy);
    limite.setDate(limite.getDate() - 5);
    return afipFormatoFecha(limite);
  }
  return afipFormatoFecha(hoy);
}

function afipFormatoFecha(fecha) {
  return String(fecha.getFullYear()) +
         String(fecha.getMonth() + 1).padStart(2, '0') +
         String(fecha.getDate()).padStart(2, '0');
}

function afipConstruirFECAEDetRequest(datosFactura, fechaCbte, emisor) {
  var creds   = afipGetCredentials();
  var docTipo = AFIP_CONFIG.DOC_TIPOS.CONSUMIDOR_FINAL;
  var docNro  = '0';
  if (datosFactura.clienteCuit) {
    docTipo = AFIP_CONFIG.DOC_TIPOS.CUIT;
    docNro  = String(datosFactura.clienteCuit).replace(/[-\s]/g, '');
  }
  var neto  = Number(datosFactura.neto)  || 0;
  var iva   = Number(datosFactura.iva)   || 0;
  var total = Number(datosFactura.total) || 0;

  return {
    Concepto: AFIP_CONFIG.CONCEPTO.PRODUCTOS,
    DocTipo:  docTipo,
    DocNro:   docNro,
    CbteDesde: 0,
    CbteHasta: 0,
    CbteFch:   fechaCbte,
    ImpTotal:  total,
    ImpTotConc: 0,
    ImpNeto:   neto,
    ImpOpEx:   0,
    ImpIVA:    iva,
    ImpTrib:   0,
    MonId:     AFIP_CONFIG.MONEDA.PESOS,
    MonCotiz:  1,
    Observaciones: [],
    Tributos:  [],
    AlicuotasIVA: [{ Id: 5, BaseImp: neto, Alicuota: 21 }],
    Compradores: [],
    PeriodoAsoc: null
  };
}

function afipParsearRespuestaFactura(resultado, datosFactura) {
  var feResp = resultado.FECAESolicitarResult || resultado;
  if (feResp.Errors) {
    var errMsg = feResp.Errors.Err ? feResp.Errors.Err.map(function(e) {
      return '(' + e.Code + ') ' + e.Msg;
    }).join(', ') : 'Error desconocido';
    throw new Error('AFIP rechazó la factura: ' + errMsg);
  }
  var detalle  = feResp.FeDetResp || feResp.FECAEDetResponse;
  if (!detalle || !detalle.FECAEDetResponse) throw new Error('Respuesta inválida de AFIP');
  var cbteResp = Array.isArray(detalle.FECAEDetResponse) ?
                 detalle.FECAEDetResponse[0] : detalle.FECAEDetResponse;
  return {
    success:        true,
    cae:            cbteResp.CAE || '',
    caeVencimiento: cbteResp.CAEFchVto || '',
    cbteNro:        cbteResp.CbteDesde || 0,
    cbteTipo:       datosFactura.cbteTipo,
    puntoVenta:     cbteResp.PtoVta || 0,
    mensaje:        'Factura autorizada con CAE: ' + cbteResp.CAE
  };
}
