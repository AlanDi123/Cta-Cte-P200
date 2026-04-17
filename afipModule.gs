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
  // 1. FORZAR ENTEROS (AFIP rechaza strings en silencio, causando el error 10016)
  var cbteTipoInt = parseInt(datosFactura.cbteTipo, 10);
  var ptoVtaInt = parseInt(afipGetCredentials().puntoVenta, 10);

  if (!cbteTipoInt || !(datosFactura.total > 0)) {
    throw new Error('Datos inválidos: cbteTipo=' + datosFactura.cbteTipo + ' total=' + datosFactura.total);
  }

  var auth  = afipGetAuth(AFIP_CONFIG.WS.FE);
  var creds = afipGetCredentials();
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type':  'application/json'
  };

  // Toma la fecha de la transferencia y la procesa con la regla de los 5 días
  var fechaCbte = afipCalcularFechaValida(datosFactura.fecha);
  var nextNro = null;
  var cbteNroUlt = null;

  // 3. OBTENER ÚLTIMO COMPROBANTE AUTORIZADO
  try {
    var payloadUlt = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method:      'FECompUltimoAutorizado',
      wsid:        AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        PtoVta:   ptoVtaInt,
        CbteTipo: cbteTipoInt
      },
      cert: creds.cert,
      key:  creds.key
    };

    var resUlt = afipFetch('/requests', payloadUlt, headers);

    // Verificación estricta: no dejamos pasar errores ocultos
    if (resUlt && resUlt.Errors) {
       var errs = Array.isArray(resUlt.Errors.Err) ? resUlt.Errors.Err : [resUlt.Errors.Err];
       throw new Error("AFIP devolvió error al consultar último comprobante: " + JSON.stringify(errs));
    }

    cbteNroUlt = null;
    if (resUlt && resUlt.FECompUltimoAutorizadoResult) cbteNroUlt = resUlt.FECompUltimoAutorizadoResult.CbteNro;
    else if (resUlt && typeof resUlt.CbteNro !== 'undefined') cbteNroUlt = resUlt.CbteNro;
    else if (resUlt && (resUlt.result || resUlt.data)) cbteNroUlt = (resUlt.result || resUlt.data).CbteNro;
    else cbteNroUlt = afipBuscarCampo(resUlt, 'CbteNro');

    if (cbteNroUlt !== null && cbteNroUlt !== undefined && !isNaN(Number(cbteNroUlt))) {
      nextNro = Number(cbteNroUlt) + 1;
    } else {
      nextNro = 1; // Solo se llega aquí si de verdad es la primera factura de la historia
    }
  } catch (e) {
    throw new Error('Fallo crítico al consultar el último número: ' + e.message);
  }

  // 4. CONSTRUIR DETALLE USANDO ENTEROS
  datosFactura.cbteTipo = cbteTipoInt;

  // =========================================================================
  // AJUSTE INTELIGENTE: auto-corrección cronológica (correlatividad AFIP)
  // =========================================================================
  var avisoFecha = '';
  var fechaFinalParaARCA = fechaCbte;

  if (cbteNroUlt && cbteNroUlt > 0) {
    var fechaUltimoARCA = afipObtenerFechaUltimoComprobante(auth, creds, ptoVtaInt, cbteTipoInt, cbteNroUlt);
    var fuStr = fechaUltimoARCA != null ? String(fechaUltimoARCA) : '';

    if (fuStr && parseInt(String(fechaFinalParaARCA), 10) < parseInt(fuStr, 10)) {
      fechaFinalParaARCA = fuStr;
      var d = fuStr.substring(6, 8);
      var m = fuStr.substring(4, 6);
      var a = fuStr.substring(0, 4);
      avisoFecha = ' (⚠️ Ajustada al ' + d + '/' + m + '/' + a + ' por correlatividad)';
    }
  }

  datosFactura._mensajeExtra = avisoFecha;
  var feDetReq = afipConstruirFECAEDetRequest(datosFactura, fechaFinalParaARCA, nextNro);
  // =========================================================================

  // 5. SOLICITAR CAE
  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,
    method:      'FECAESolicitar',
    wsid:        AFIP_CONFIG.WS.FE,
    params: {
      Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
      FeCAEReq: {
        FeCabReq: {
          CantReg:  1,
          PtoVta:   ptoVtaInt,
          CbteTipo: cbteTipoInt
        },
        FeDetReq: {
          FECAEDetRequest: feDetReq
        }
      }
    },
    cert: creds.cert,
    key:  creds.key
  };

  var resultado = afipFetchConRetry('/requests', payload, headers);
  return afipParsearRespuestaFactura(resultado, datosFactura, nextNro, ptoVtaInt);
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
  // 1. Instanciamos HOY en la zona horaria de Argentina
  var hoyStr = Utilities.formatDate(new Date(), "America/Argentina/Buenos_Aires", "yyyy-MM-dd");
  var hoy = new Date(hoyStr + "T12:00:00-03:00"); // Usamos el mediodía para evitar saltos por horario de verano/invierno

  if (!fechaTransferencia) {
    return Utilities.formatDate(hoy, "America/Argentina/Buenos_Aires", "yyyyMMdd");
  }

  // 2. Parseamos la fecha de la transferencia forzándola a UTC-3
  // Convertimos "DD/MM/YYYY" o cualquier formato raro a "YYYY-MM-DD" si es necesario,
  // asumiendo que llega en formato estándar desde tu base:
  var fTransStr = String(fechaTransferencia).substring(0, 10); // Toma solo YYYY-MM-DD
  var fTrans = new Date(fTransStr + "T12:00:00-03:00");

  // 3. Calculamos la diferencia exacta en días
  var milisegundosPorDia = 1000 * 60 * 60 * 24;
  var diffDias = Math.floor((hoy.getTime() - fTrans.getTime()) / milisegundosPorDia);

  var fechaFinal = fTrans;

  // REGLAS AFIP:
  if (diffDias > 5) {
    // Si pasaron más de 5 días, topamos en el límite legal (hace 5 días exactos)
    fechaFinal = new Date(hoy.getTime() - (5 * milisegundosPorDia));
  } else if (diffDias < 0) {
    // Si por algún error la transferencia tiene fecha del futuro, usamos HOY
    fechaFinal = hoy;
  }

  // Devolvemos el string rígido YYYYMMDD que exige la API de ARCA
  return Utilities.formatDate(fechaFinal, "America/Argentina/Buenos_Aires", "yyyyMMdd");
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
    mensaje:        'Comprobante autorizado. CAE: ' + cbte.CAE + (datosFactura._mensajeExtra || '')
  };
}

// Consultor de la fecha del último comprobante emitido (FECompConsultar)
function afipObtenerFechaUltimoComprobante(auth, creds, ptoVta, cbteTipo, cbteNro) {
  if (!cbteNro || cbteNro <= 0) return null;
  try {
    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method: 'FECompConsultar',
      wsid: AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        FeCompConsReq: {
          PtoVta: ptoVta,
          CbteTipo: cbteTipo,
          CbteNro: cbteNro
        }
      },
      cert: creds.cert,
      key: creds.key
    };
    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };

    var res = afipFetch('/requests', payload, headers);

    var fechaStr = afipBuscarCampo(res, 'CbteFch');
    return fechaStr ? String(fechaStr) : null;
  } catch (e) {
    Logger.log('Error silenciado al consultar fecha del comprobante ' + cbteNro + ': ' + e.message);
    return null;
  }
}
