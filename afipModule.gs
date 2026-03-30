// ============================================================================
// MÓDULO AFIP/ARCA — SISTEMA SOL & VERDE
// Versión definitiva — todos los bugs corregidos
// ============================================================================

// ─── SECCIÓN 1: CONFIGURACIÓN ────────────────────────────────────────────────

var AFIP_CONFIG = {
  API_URL:     'https://app.afipsdk.com/api/v1/afip',
  ENVIRONMENT: 'prod',
  TIMEOUT_MS:  30000,
  WS: {
    FE:                   'wsfe',
    PADRON_CONSTANCIA:    'ws_sr_constancia_inscripcion'
  },
  CBTE_TIPOS: {
    FACTURA_A:      1,
    NOTA_CREDITO_A: 3,
    FACTURA_B:      6,
    NOTA_CREDITO_B: 8
  },
  DOC_TIPOS: {
    CUIT:             80,
    DNI:              96,
    CONSUMIDOR_FINAL: 99
  },
  CONCEPTO: { PRODUCTOS: 1, SERVICIOS: 2, AMBOS: 3 },
  MONEDA:   { PESOS: 'PES' },
  HOJA_FACTURAS: 'FACTURAS_EMITIDAS'
};

function afipGetEmisorConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    CUIT:           props.getProperty('EMISOR_CUIT')           || '',
    RAZON_SOCIAL:   props.getProperty('EMISOR_RAZON_SOCIAL')   || '',
    DOMICILIO:      props.getProperty('EMISOR_DOMICILIO')      || '',
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
  var c = afipGetCredentials();
  return !!(c.cert && c.cert.length > 50 && c.key && c.key.length > 50);
}

function afipVerificarConfiguracion() {
  var creds  = afipGetCredentials();
  var emisor = afipGetEmisorConfig();
  if (!creds.accessToken || creds.accessToken.length < 10)
    return { configurado: false, error: 'Access Token de AFIP SDK no configurado' };
  if (!emisor.CUIT)
    return { configurado: false, error: 'CUIT del emisor no configurado' };
  return { configurado: true, tieneCertificado: afipTieneCertificado(), error: null };
}

// ─── SECCIÓN 2: HTTP FETCH ───────────────────────────────────────────────────

function afipFetch(endpoint, payload, headers, method) {
  var url = AFIP_CONFIG.API_URL + endpoint;
  var options = {
    method:             method || 'post',
    contentType:        'application/json',
    headers:            headers || {},
    muteHttpExceptions: true,
    timeout:            AFIP_CONFIG.TIMEOUT_MS
  };
  if (payload && (method || 'post') === 'post') {
    options.payload = JSON.stringify(payload);
  }

  Logger.log('[AFIP HTTP] ' + endpoint);

  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  Logger.log('[AFIP HTTP] response ' + code);

  if (code === 401 || code === 403)
    throw new Error('Token de AfipSDK inválido o expirado (HTTP ' + code + ')');
  if (code >= 500)
    throw new Error('Error AfipSDK HTTP ' + code + ': ' + text.substring(0, 200));
  if (code !== 200) {
    var msg = 'Error AfipSDK HTTP ' + code;
    try {
      var err = JSON.parse(text);
      msg += ': ' + (err.message || err.error || JSON.stringify(err));
    } catch (e) {
      msg += ': ' + text.substring(0, 200);
    }
    throw new Error(msg);
  }

  try { return JSON.parse(text); }
  catch (e) { throw new Error('Respuesta inválida de AfipSDK: ' + text.substring(0, 200)); }
}

function afipFetchConRetry(endpoint, payload, headers, method) {
  var max = 3, delay = 1000;
  for (var i = 1; i <= max; i++) {
    try {
      return afipFetch(endpoint, payload, headers, method);
    } catch (e) {
      var msg = e.message.toLowerCase();
      var retry = msg.indexOf('timeout') >= 0 ||
                  msg.indexOf('unavailable') >= 0 ||
                  msg.indexOf('exceeded') >= 0 ||
                  /http 5\d\d/.test(msg);
      if (!retry || i === max) throw e;
      Utilities.sleep(delay * Math.pow(2, i - 1));
    }
  }
}

// ─── SECCIÓN 3: AUTENTICACIÓN ─────────────────────────────────────────────────

function afipGetAuth(wsid) {
  var cfg = afipVerificarConfiguracion();
  if (!cfg.configurado)      throw new Error('AFIP no configurado: ' + cfg.error);
  if (!cfg.tieneCertificado) throw new Error('Certificado digital no instalado. Generalo en Configuración → ARCA.');

  var creds = afipGetCredentials();
  var cacheKey = 'ARCA_AUTH_' + String(wsid || 'FE');
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed && parsed.token && parsed.sign && parsed.cuit === creds.cuit)
        return { token: parsed.token, sign: parsed.sign, cuit: parsed.cuit };
    } catch (ignore) { /* pedir auth de nuevo */ }
  }

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

  var res = afipFetch('/auth', payload, headers);
  if (!res.token || !res.sign)
    throw new Error('Auth ARCA inválida. Respuesta: ' + JSON.stringify(res).substring(0, 200));

  var authObj = { token: res.token, sign: res.sign, cuit: creds.cuit };
  try {
    cache.put(cacheKey, JSON.stringify(authObj), 36000);
  } catch (ignore) { /* caché llena o error */ }

  return authObj;
}

// ─── SECCIÓN 4: ERRORES — MUESTRA EL CÓDIGO REAL DE ARCA ────────────────────

var AFIP_ERROR_CODES = {
  AUTH_INVALID_TOKEN:  401,
  AUTH_CERT_EXPIRED:   1001,
  VALIDATION_CUIT:     2001,
  BUSINESS_REJECTED:   3003,
  SYSTEM_TIMEOUT:      5001,
  SYSTEM_UNAVAILABLE:  5002
};

function afipClasificarError(error) {
  var msg  = error.message || String(error);
  var low  = msg.toLowerCase();

  if (low.indexOf('token') >= 0 || low.indexOf('401') >= 0)
    return { code: 401, category: 'AUTH', message: msg, retryable: false };
  if (low.indexOf('certificado') >= 0 || low.indexOf('403') >= 0)
    return { code: 1001, category: 'AUTH', message: msg, retryable: false };
  if (low.indexOf('timeout') >= 0)
    return { code: 5001, category: 'SYSTEM', message: msg, retryable: true };
  if (low.indexOf('unavailable') >= 0)
    return { code: 5002, category: 'SYSTEM', message: msg, retryable: true };

  // ── SIEMPRE preservar el mensaje real (no reemplazar por genérico) ─────────
  return { code: 9999, category: 'BUSINESS', message: msg, retryable: false };
}

function afipFormatearErrorUsuario(error) {
  var c = afipClasificarError(error);
  // Devolver el mensaje REAL para que el usuario vea el código de ARCA
  return c.message;
}

function afipRegistrarError(operacion, error, ctx) {
  Logger.log('[AFIP ERROR] ' + operacion + ': ' + (error.message || error));
  if (ctx) Logger.log('[AFIP CTX] ' + JSON.stringify(ctx).substring(0, 300));
}

// ─── SECCIÓN 5: PADRÓN ────────────────────────────────────────────────────────

function afipConsultarCUIT(cuit) {
  var cuitLimpio = String(cuit).replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(cuitLimpio))
    return { encontrado: false, error: 'CUIT inválido (debe tener 11 dígitos)', cuit: cuitLimpio };

  var auth   = afipGetAuth(AFIP_CONFIG.WS.PADRON_CONSTANCIA);
  var creds  = afipGetCredentials();
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type':  'application/json'
  };
  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    method:      'getPersona_v2',
    wsid:        AFIP_CONFIG.WS.PADRON_CONSTANCIA,
    params: {
      token:            auth.token,
      sign:             auth.sign,
      cuitRepresentada: auth.cuit,
      idPersona:        parseInt(cuitLimpio, 10)
    },
    cert: creds.cert,
    key:  creds.key
  };

  try {
    var res = afipFetchConRetry('/requests', payload, headers);
    return afipParsearRespuestaPadron(res, cuitLimpio);
  } catch (e) {
    return { encontrado: false, error: e.message, cuit: cuitLimpio };
  }
}

function afipParsearRespuestaPadron(resultado, cuitLimpio) {
  var persona = resultado.persona || resultado.personaReturn || resultado.data || null;
  if (!persona || resultado.personaNoRegistrada)
    return { encontrado: false, error: 'CUIT no registrado en ARCA', cuit: cuitLimpio };

  var dg = persona.datosGenerales || persona;
  var razonSocial = dg.razonSocial || '';
  if (!razonSocial && dg.apellido)
    razonSocial = (dg.apellido + (dg.nombre ? ', ' + dg.nombre : '')).trim();

  var domicilio = '';
  if (dg.domicilioFiscal) {
    var df = dg.domicilioFiscal;
    domicilio = [df.direccion, df.localidad, df.descripcionProvincia]
      .map(function(p) { return (p || '').trim(); })
      .filter(Boolean).join(', ');
  }

  var impuestos = [];
  if (persona.datosRegimenGeneral && persona.datosRegimenGeneral.impuesto) {
    var raw = persona.datosRegimenGeneral.impuesto;
    impuestos = Array.isArray(raw) ? raw : [raw];
  }

  var esMonotributo = !!(persona.datosMonotributo) ||
                      impuestos.some(function(i) { return Number(i.idImpuesto||i.id||0) === 20; });
  var esRI = impuestos.some(function(i) {
    var id = Number(i.idImpuesto||i.id||0);
    return id === 30 || id === 32;
  });

  var condicionIVA = esRI ? 'RI' : esMonotributo ? 'M' : 'CF';
  var condicionTexto = condicionIVA === 'RI' ? 'Responsable Inscripto' :
                       condicionIVA === 'M'  ? 'Monotributista' : 'Consumidor Final';

  return {
    encontrado:     true,
    cuit:           cuitLimpio,
    razonSocial:    razonSocial,
    domicilio:      domicilio,
    condicionIVA:   condicionIVA,
    condicionTexto: condicionTexto,
    estadoClave:    dg.estadoClave || 'ACTIVO',
    rawResponse:    resultado
  };
}

// ─── SECCIÓN 6: FACTURACIÓN ELECTRÓNICA ──────────────────────────────────────

function afipEmitirFactura(datosFactura) {
  if (!datosFactura.cbteTipo || !(datosFactura.total > 0))
    throw new Error('Datos inválidos: cbteTipo=' + datosFactura.cbteTipo +
                    ' total=' + datosFactura.total);

  var auth    = afipGetAuth(AFIP_CONFIG.WS.FE);
  var creds   = afipGetCredentials();
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type':  'application/json'
  };

  // ── Paso 1: FECompUltimoAutorizado ─────────────────────────────────────────
  var nextNro = null;
  try {
    var payloadUlt = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method:      'FECompUltimoAutorizado',
      wsid:        AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        PtoVta:   creds.puntoVenta,
        CbteTipo: datosFactura.cbteTipo
      },
      cert: creds.cert,
      key:  creds.key
    };

    var resUlt = afipFetch('/requests', payloadUlt, headers);

    // Loguear la respuesta RAW completa para diagnóstico
    Logger.log('[AFIP ULT] Respuesta RAW completa: ' + JSON.stringify(resUlt));

    // Intentar todos los paths posibles que puede devolver afipsdk
    var cbteNroUlt = null;

    // Path 1: respuesta normal del SDK
    if (resUlt && resUlt.FECompUltimoAutorizadoResult) {
      cbteNroUlt = resUlt.FECompUltimoAutorizadoResult.CbteNro;
      Logger.log('[AFIP ULT] Path1 CbteNro: ' + cbteNroUlt);
    }
    // Path 2: SDK devuelve el resultado directo (sin wrapper)
    else if (resUlt && typeof resUlt.CbteNro !== 'undefined') {
      cbteNroUlt = resUlt.CbteNro;
      Logger.log('[AFIP ULT] Path2 CbteNro: ' + cbteNroUlt);
    }
    // Path 3: anidado en result o data
    else if (resUlt && (resUlt.result || resUlt.data)) {
      var inner = resUlt.result || resUlt.data;
      cbteNroUlt = inner.CbteNro;
      Logger.log('[AFIP ULT] Path3 CbteNro: ' + cbteNroUlt);
    }
    // Path 4: buscar recursivamente cualquier key que contenga "CbteNro"
    else {
      Logger.log('[AFIP ULT] Paths 1-3 fallaron. Buscando CbteNro recursivamente...');
      cbteNroUlt = afipBuscarCampo(resUlt, 'CbteNro');
      Logger.log('[AFIP ULT] Path4 (recursivo) CbteNro: ' + cbteNroUlt);
    }

    if (cbteNroUlt !== null && cbteNroUlt !== undefined && !isNaN(Number(cbteNroUlt))) {
      nextNro = Number(cbteNroUlt) + 1;
      Logger.log('[AFIP ULT] Último autorizado: ' + cbteNroUlt + ' → Próximo: ' + nextNro);
    } else {
      // Si ARCA devuelve CbteNro=0 significa que nunca se emitió ninguno
      // Buscar si hay errores en la respuesta
      if (resUlt && resUlt.Errors) {
        Logger.log('[AFIP ULT] Errores en FECompUltimoAutorizado: ' + JSON.stringify(resUlt.Errors));
      }
      Logger.log('[AFIP ULT] CbteNro no encontrado en respuesta. Usando nextNro=1');
      nextNro = 1;
    }

  } catch (e) {
    // ¡CRÍTICO! Si FECompUltimoAutorizado falla, NO continuar con nro=1
    // porque ARCA puede esperar cualquier número distinto
    Logger.log('[AFIP ULT] EXCEPCIÓN en FECompUltimoAutorizado: ' + e.message);
    throw new Error(
      'No se pudo obtener el último comprobante autorizado de ARCA. ' +
      'No es seguro continuar sin este dato. Error: ' + e.message +
      '\n\nRevisá los logs de GAS (View → Logs) para más detalles.'
    );
  }

  // ── Paso 2: Construir request y fecha ─────────────────────────────────────
  var hoy = new Date();
  var fechaCbte = datosFactura.fechaCbte || afipFormatoFecha(hoy);

  Logger.log('[AFIP] cbteTipo=' + datosFactura.cbteTipo +
             ' nextNro=' + nextNro +
             ' fechaCbte=' + fechaCbte);

  var feDetReq = afipConstruirFECAEDetRequest(datosFactura, fechaCbte, nextNro);

  // ── Paso 3: FECAESolicitar ─────────────────────────────────────────────────
  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    method:      'FECAESolicitar',
    wsid:        AFIP_CONFIG.WS.FE,
    params: {
      Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
      FeCAEReq: {
        FeCabReq: {
          CantReg:  1,
          PtoVta:   creds.puntoVenta,
          CbteTipo: datosFactura.cbteTipo
        },
        FeDetReq: {
          FECAEDetRequest: feDetReq
        }
      }
    },
    cert: creds.cert,
    key:  creds.key
  };

  Logger.log('[AFIP] FECAESolicitar payload: ' + JSON.stringify(payload).substring(0, 1000));

  var resultado = afipFetchConRetry('/requests', payload, headers);
  return afipParsearRespuestaFactura(resultado, datosFactura, nextNro, creds.puntoVenta);
}


// Utilidad: buscar un campo en cualquier nivel del objeto JSON
function afipBuscarCampo(obj, campo) {
  if (obj === null || typeof obj !== 'object') return null;
  if (typeof obj[campo] !== 'undefined') return obj[campo];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var found = afipBuscarCampo(obj[key], campo);
      if (found !== null) return found;
    }
  }
  return null;
}


function afipConstruirFECAEDetRequest(datosFactura, fechaCbte, cbteNro) {
  // DocTipo y DocNro — DEBEN ser números enteros, no strings
  var docTipo = AFIP_CONFIG.DOC_TIPOS.CONSUMIDOR_FINAL; // 99
  var docNro  = 0;   // entero 0 para CF
  if (datosFactura.clienteCuit && String(datosFactura.clienteCuit).trim() !== '') {
    docTipo = AFIP_CONFIG.DOC_TIPOS.CUIT;  // 80
    docNro  = parseInt(String(datosFactura.clienteCuit).replace(/[-\s]/g, ''), 10);
  }

  var neto  = Number(datosFactura.neto)  || 0;
  var iva   = Number(datosFactura.iva)   || 0;
  var total = Number(datosFactura.total) || 0;

  // Verificar coherencia neto + iva ≈ total (ajustar diferencia de centavo)
  var netoMas = Math.round((neto + iva) * 100);
  var totalCts = Math.round(total * 100);
  if (Math.abs(netoMas - totalCts) === 1) {
    // Diferencia de 1 centavo: ajustar iva
    iva = Math.round((total - neto) * 100) / 100;
  }

  // CbteFch como número entero YYYYMMDD (obligatorio, no string)
  var cbteFchInt = parseInt(fechaCbte, 10);

  // CondicionIVAReceptorId — obligatorio desde RG ARCA 5616/2024
  // 1=RI, 6=Monotributo, 13=Monotributo Social, 5=CF, 4=Exento
  var condRaw = String(datosFactura.clienteCondicion || 'CF').toUpperCase();
  var condId;
  if      (condRaw === 'RI' || condRaw.indexOf('RESPONSABLE') >= 0) condId = 1;
  else if (condRaw === 'M'  || condRaw.indexOf('MONOTRIBUT')  >= 0) condId = 6;
  else if (condRaw.indexOf('SOCIAL') >= 0)                          condId = 13;
  else if (condRaw.indexOf('EXENTO') >= 0)                          condId = 4;
  else                                                               condId = 5; // CF

  // Alícuota IVA — Id: 4=10.5%, Id: 5=21%
  // Importe = monto en pesos (NO el porcentaje)
  var ivaAlicId = parseInt(PropertiesService.getScriptProperties()
                    .getProperty('IVA_ALICUOTA_ID') || '4');

  var det = {
    Concepto:               AFIP_CONFIG.CONCEPTO.PRODUCTOS,
    DocTipo:                docTipo,
    DocNro:                 docNro,
    CbteDesde:              cbteNro,
    CbteHasta:              cbteNro,
    CbteFch:                cbteFchInt,
    ImpTotal:               total,
    ImpTotConc:             0,
    ImpNeto:                neto,
    ImpOpEx:                0,
    ImpIVA:                 iva,
    ImpTrib:                0,
    MonId:                  AFIP_CONFIG.MONEDA.PESOS,
    MonCotiz:               1,
    CondicionIVAReceptorId: condId
  };

  // Incluir bloque Iva solo cuando hay neto > 0
  if (neto > 0) {
    det.Iva = {
      AlicIva: [{
        Id:      ivaAlicId,
        BaseImp: neto,
        Importe: iva
      }]
    };
  }

  Logger.log('[AFIP] FECAEDetRequest: ' + JSON.stringify(det));
  return det;
}


function afipCalcularFechaValida(fechaTransferencia) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (!fechaTransferencia) return afipFormatoFecha(hoy);

  var fTrans = new Date(fechaTransferencia + 'T00:00:00');
  fTrans.setHours(0, 0, 0, 0);
  var diff = Math.floor((hoy - fTrans) / 86400000);

  if (diff >= 0 && diff <= 5) return afipFormatoFecha(fTrans);
  if (diff > 5) {
    var lim = new Date(hoy);
    lim.setDate(lim.getDate() - 5);
    return afipFormatoFecha(lim);
  }
  return afipFormatoFecha(hoy);
}

function afipFormatoFecha(fecha) {
  // Devuelve string "YYYYMMDD" — se convierte a int en afipConstruirFECAEDetRequest
  return String(fecha.getFullYear()) +
         String(fecha.getMonth() + 1).padStart(2, '0') +
         String(fecha.getDate()).padStart(2, '0');
}


function afipParsearRespuestaFactura(resultado, datosFactura, cbteNro, puntoVenta) {
  Logger.log('[AFIP] Respuesta completa: ' + JSON.stringify(resultado).substring(0, 1000));

  var feResp = resultado.FECAESolicitarResult || resultado;

  // ── Errores a nivel cabecera (rechazo total) ──────────────────────────────
  if (feResp.Errors && feResp.Errors.Err) {
    var errArr = Array.isArray(feResp.Errors.Err) ? feResp.Errors.Err : [feResp.Errors.Err];
    var errMsg = errArr.map(function(e) { return '(' + e.Code + ') ' + e.Msg; }).join(' | ');
    throw new Error('ARCA rechazó el comprobante: ' + errMsg);
  }

  // ── Respuesta de detalle ──────────────────────────────────────────────────
  if (!feResp.FeDetResp) throw new Error('Respuesta ARCA sin FeDetResp: ' + JSON.stringify(feResp).substring(0, 300));

  var cbteArr = feResp.FeDetResp.FECAEDetResponse;
  var cbte = Array.isArray(cbteArr) ? cbteArr[0] : cbteArr;
  if (!cbte) throw new Error('Respuesta ARCA sin FECAEDetResponse');

  // ── Rechazado a nivel detalle ─────────────────────────────────────────────
  if (cbte.Resultado === 'R') {
    var obs = '';
    if (cbte.Observaciones && cbte.Observaciones.Obs) {
      var obsArr = Array.isArray(cbte.Observaciones.Obs) ? cbte.Observaciones.Obs : [cbte.Observaciones.Obs];
      obs = obsArr.map(function(o) { return '(' + o.Code + ') ' + o.Msg; }).join(' | ');
    }
    throw new Error('ARCA rechazó el comprobante: ' + (obs || 'sin detalle'));
  }

  // ── Aprobado ──────────────────────────────────────────────────────────────
  if (!cbte.CAE) throw new Error('ARCA procesó pero no devolvió CAE. Respuesta: ' + JSON.stringify(cbte));

  return {
    success:        true,
    cae:            cbte.CAE,
    caeVencimiento: cbte.CAEFchVto || '',
    cbteNro:        cbte.CbteDesde || cbteNro,
    cbteTipo:       datosFactura.cbteTipo,
    puntoVenta:     puntoVenta,
    ptoVta:         puntoVenta,
    mensaje:        'Comprobante autorizado. CAE: ' + cbte.CAE
  };
}
