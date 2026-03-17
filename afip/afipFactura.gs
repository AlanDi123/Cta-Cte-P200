/**
 * ============================================================================
 * AFIP FACTURACION - SISTEMA SOL & VERDE
 * ============================================================================
 * Emisión de comprobantes vía WSFE
 * Factura A, B, Nota de Crédito
 * ============================================================================
 */

/**
 * Emite un comprobante electrónico
 * @param {Object} datosFactura - {
 *   cbteTipo: number (1=FA, 6=FB, 3=NCA, 8=NCB),
 *   clienteNombre: string,
 *   clienteCuit: string,
 *   clienteCondicion: string,
 *   neto: number,
 *   iva: number,
 *   total: number,
 *   items: Array,
 *   fechaTransferencia: string (YYYY-MM-DD)
 * }
 * @returns {Object} {
 *   success: boolean,
 *   cae: string,
 *   caeVencimiento: string,
 *   cbteNro: number,
 *   mensaje: string
 * }
 * @throws {Error} Si falla emisión
 */
function afipEmitirFactura(datosFactura) {
  // Validar datos básicos
  if (!datosFactura.cbteTipo || !datosFactura.total) {
    throw new Error('Datos de factura inválidos');
  }
  
  // Autenticar
  var auth = afipGetAuth(AFIP_CONFIG.WS.FE);
  var creds = afipGetCredentials();
  var emisor = afipGetEmisorConfig();
  
  // Calcular fecha válida (máx 5 días atrás para productos)
  var fechaCbte = afipCalcularFechaValida(datosFactura.fechaTransferencia);
  
  // Construir FECAEReq
  var feDetRequest = afipConstruirFECAEDetRequest(datosFactura, fechaCbte, emisor);
  
  // Payload
  var payload = {
    environment: AFIP_CONFIG.ENVIRONMENT,  // REQUERIDO
    method: 'FECAESolicitar',
    wsid: AFIP_CONFIG.WS.FE,
    params: {
      Auth: {
        Token: auth.token,
        Sign: auth.sign,
        Cuit: auth.cuit
      },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: creds.puntoVenta,
          CbteTipo: datosFactura.cbteTipo
        },
        FeDetReq: {
          FECAEDetRequest: feDetRequest
        }
      }
    }
  };
  
  // Agregar certificado
  if (creds.cert && creds.key) {
    payload.cert = creds.cert;
    payload.key = creds.key;
  }
  
  // Headers
  var headers = {
    'Authorization': 'Bearer ' + creds.accessToken,
    'Content-Type': 'application/json'
  };
  
  // Validar payload antes de enviar
  var validacion = afipValidarPayload(payload);
  if (!validacion.valido) {
    throw new Error('Payload inválido: ' + validacion.errores.join('; '));
  }
  
  Logger.log('[AFIP FACTURA] Enviando comprobante tipo ' + datosFactura.cbteTipo);
  
  // Request
  var resultado = afipFetchConRetry('/requests', payload, headers);
  
  // Parsear respuesta
  return afipParsearRespuestaFactura(resultado, datosFactura);
}

/**
 * Calcula fecha válida para AFIP (productos: máx 5 días atrás)
 * @param {string} fechaTransferencia - Fecha en YYYY-MM-DD
 * @returns {string} Fecha en YYYYMMDD
 */
function afipCalcularFechaValida(fechaTransferencia) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  if (!fechaTransferencia) {
    return afipFormatoFecha(hoy);
  }
  
  var fechaTrans = new Date(fechaTransferencia);
  fechaTrans.setHours(0, 0, 0, 0);
  
  var diffDias = Math.floor((hoy - fechaTrans) / (1000 * 60 * 60 * 24));
  
  // Si está dentro de los 5 días, usar fecha original
  if (diffDias >= 0 && diffDias <= 5) {
    Logger.log('[AFIP FECHA] Usando fecha transferencia: ' + fechaTransferencia);
    return afipFormatoFecha(fechaTrans);
  }
  
  // Si es más de 5 días atrás, usar límite
  if (diffDias > 5) {
    var fechaLimite = new Date(hoy);
    fechaLimite.setDate(fechaLimite.getDate() - 5);
    Logger.log('[AFIP FECHA] Fecha transferencia supera 5 días, usando: ' + afipFormatoFecha(fechaLimite));
    return afipFormatoFecha(fechaLimite);
  }
  
  // Si es futura, usar hoy
  Logger.log('[AFIP FECHA] Fecha futura, usando hoy');
  return afipFormatoFecha(hoy);
}

/**
 * Formatea fecha a YYYYMMDD
 * @param {Date} fecha
 * @returns {string}
 */
function afipFormatoFecha(fecha) {
  var year = fecha.getFullYear();
  var month = String(fecha.getMonth() + 1).padStart(2, '0');
  var day = String(fecha.getDate()).padStart(2, '0');
  return '' + year + month + day;
}

/**
 * Construye FECAEDetRequest
 * @param {Object} datosFactura
 * @param {string} fechaCbte - YYYYMMDD
 * @param {Object} emisor
 * @returns {Object}
 */
function afipConstruirFECAEDetRequest(datosFactura, fechaCbte, emisor) {
  var creds = afipGetCredentials();
  
  // Determinar tipo de documento
  var docTipo = AFIP_CONFIG.DOC_TIPOS.CONSUMIDOR_FINAL;
  var docNro = '0';
  
  if (datosFactura.clienteCuit) {
    docTipo = AFIP_CONFIG.DOC_TIPOS.CUIT;
    docNro = String(datosFactura.clienteCuit).replace(/[-\s]/g, '');
  }
  
  // Calcular importes
  var neto = Number(datosFactura.neto) || 0;
  var iva = Number(datosFactura.iva) || 0;
  var total = Number(datosFactura.total) || 0;
  
  return {
    Concepto: AFIP_CONFIG.CONCEPTO.PRODUCTOS,
    DocTipo: docTipo,
    DocNro: docNro,
    CbteDesde: 0,  // Se asigna al autorizar
    CbteHasta: 0,
    CbteFch: fechaCbte,
    ImpTotal: total,
    ImpTotConc: 0,
    ImpNeto: neto,
    ImpOpEx: 0,
    ImpIVA: iva,
    ImpTrib: 0,
    MonId: AFIP_CONFIG.MONEDA.PESOS,
    MonCotiz: 1,
    Observaciones: [],
    Tributos: [],
    AlicuotasIVA: [{
      Id: 3,  // 0% para monotributo / productos exentos
      BaseImp: neto,
      Alicuota: 0
    }],
    Compradores: [],
    PeriodoAsoc: null
  };
}

/**
 * Valida payload antes de enviar
 * @param {Object} payload
 * @returns {Object} {valido: boolean, errores: Array}
 */
function afipValidarPayload(payload) {
  var errores = [];
  
  if (!payload.params || !payload.params.FECAEReq) {
    errores.push('Falta FeCAEReq');
  }
  
  if (payload.environment !== AFIP_CONFIG.ENVIRONMENT) {
    errores.push('Environment inválido (debe ser ' + AFIP_CONFIG.ENVIRONMENT + ')');
  }
  
  return {
    valido: errores.length === 0,
    errores: errores
  };
}

/**
 * Parsea respuesta de facturación
 * @param {Object} resultado
 * @param {Object} datosFactura
 * @returns {Object}
 */
function afipParsearRespuestaFactura(resultado, datosFactura) {
  var feResp = resultado.FECAESolicitarResult || resultado;
  
  if (feResp.Errors) {
    var errMsg = feResp.Errors.Err ? feResp.Errors.Err.map(function(e) {
      return '(' + e.Code + ') ' + e.Msg;
    }).join(', ') : 'Error desconocido';
    throw new Error('AFIP rechazó la factura: ' + errMsg);
  }
  
  var detalle = feResp.FeDetResp || feResp.FECAEDetResponse;
  if (!detalle || !detalle.FECAEDetResponse) {
    throw new Error('Respuesta inválida de AFIP');
  }
  
  var cbteResp = Array.isArray(detalle.FECAEDetResponse) ? 
                 detalle.FECAEDetResponse[0] : detalle.FECAEDetResponse;
  
  if (cbteResp.Observaciones && cbteResp.Observaciones.Obs.length > 0) {
    var obs = cbteResp.Observaciones.Obs.map(function(o) { return o.Msg; }).join('; ');
    Logger.log('[AFIP FACTURA] Observaciones: ' + obs);
  }
  
  return {
    success: true,
    cae: cbteResp.CAE || '',
    caeVencimiento: cbteResp.CAEFchVto || '',
    cbteNro: cbteResp.CbteDesde || 0,
    cbteTipo: datosFactura.cbteTipo,
    puntoVenta: cbteResp.PtoVta || 0,
    mensaje: 'Factura autorizada con CAE: ' + cbteResp.CAE
  };
}
