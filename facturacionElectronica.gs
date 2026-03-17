/**
 * FACTURACION ELECTRONICA ARCA — SOL & VERDE
 * Wrapper de compatibilidad + funciones públicas para el frontend.
 * Todas las operaciones AFIP delegan a afipAuth.gs, afipPadron.gs, 
 * afipFactura.gs (ya existentes y funcionales).
 * environment: SIEMPRE 'prod' — hardcoded, nunca configurable.
 */

// ─── SECCIÓN 1: WRAPPERS INTERNOS (delegación a capa afip/) ────────────────

/**
 * Consulta CUIT en padrón AFIP.
 * Delegación directa a afipPadron.gs::afipConsultarCUIT()
 * @param {string} cuit
 * @returns {{ encontrado, cuit, razonSocial, condicionIVA, condicionTexto,
 *             domicilio, estadoClave, error?, mensaje? }}
 */
function afipConsultarCUITWrapper(cuit) {
  try {
    return afipConsultarCUIT(cuit);
  } catch (error) {
    afipRegistrarError('consultarCUIT', error, { cuit: cuit });
    return {
      encontrado: false,
      error: afipFormatearErrorUsuario(error),
      mensaje: error.message,
      cuitConsultado: cuit
    };
  }
}

/**
 * Emite Factura A, B o Nota de Crédito en ARCA.
 * Delegación directa a afipFactura.gs::afipEmitirFactura()
 * @param {Object} datosFactura
 * @returns {{ success, cae, caeVencimiento, cbteNro, ptoVta, mensaje, error? }}
 */
function afipEmitirFacturaWrapper(datosFactura) {
  try {
    return afipEmitirFactura(datosFactura);
  } catch (error) {
    afipRegistrarError('emitirFactura', error, datosFactura);
    return {
      success: false,
      error: afipFormatearErrorUsuario(error),
      mensaje: error.message
    };
  }
}

// ─── SECCIÓN 2: FUNCIONES PÚBLICAS LLAMADAS DESDE EL FRONTEND ──────────────
// Estas son las funciones que el HTML llama via google.script.run.*
// Todas deben existir aquí y ser globales.

/**
 * Consultar CUIT desde el frontend (módulo Clientes y Facturación).
 * Llamada desde: verificarCuitCliente(), consultarCuitDesdeArca()
 */
function consultarCUITArca(cuit) {
  return afipConsultarCUITWrapper(cuit);
}

/**
 * Emite factura electrónica completa desde el frontend.
 * Llamada desde: emitirFacturaArca(), emitirFacturaB(), emitirFacturaA()
 * 
 * datosFactura esperado:
 * {
 *   cbteTipo: 1|3|6|8,        // 1=FA, 3=NCA, 6=FB, 8=NCB
 *   clienteNombre: string,
 *   clienteRazonSocial: string,
 *   clienteDomicilio: string,
 *   clienteCuit: string,       // vacío para CF
 *   clienteCondicion: 'RI'|'M'|'CF',
 *   clienteCondicionTexto: string,
 *   importeNeto: number,       // sin IVA
 *   detalle: [{descripcion, cantidad, precioUnitario}],
 *   fechaTransferencia?: string  // YYYY-MM-DD, opcional
 * }
 */
function emitirFacturaElectronica(datosFactura) {
  try {
    // Normalizar y validar datos de entrada
    var datos = _normalizarDatosFactura(datosFactura);
    var validacion = validarClienteFacturacion(
      { 
        nombre: datos.clienteNombre,
        cuit: datos.clienteCuit,
        condicionFiscal: datos.clienteCondicion,
        razonSocial: datos.clienteRazonSocial,
        domicilioFiscal: datos.clienteDomicilio
      },
      datos.cbteTipo === 1 ? 'A' : 'B'
    );
    
    if (!validacion.valid) {
      return { success: false, error: validacion.errors.join(' | ') };
    }

    // Calcular importes con IVA configurable
    var ivaConfig = CONFIG.getIVA();
    var neto  = Number(datos.importeNeto) || 0;
    var iva   = Math.round(neto * ivaConfig.MULTIPLICADOR * 100) / 100;
    var total = Math.round((neto + iva) * 100) / 100;

    // Calcular fecha válida para ARCA (máx 5 días atrás para productos)
    var fechaCbte = _calcularFechaValidaArca(datos.fechaTransferencia);
    var avisoFecha = null;
    if (datos.fechaTransferencia) {
      var fechaTrans = parsearFechaLocal(datos.fechaTransferencia);
      var hoy = new Date();
      var diffDias = Math.floor((hoy - fechaTrans) / 86400000);
      if (diffDias > 5) {
        avisoFecha = 'La fecha de transferencia supera 5 días. ARCA usará: ' + 
                     formatearFecha(parsearFechaLocal(fechaCbte.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')));
      }
    }

    // Delegación a capa AFIP
    var resultado = afipEmitirFacturaWrapper({
      cbteTipo:          datos.cbteTipo,
      clienteNombre:     datos.clienteNombre,
      clienteRazonSocial: datos.clienteRazonSocial || datos.clienteNombre,
      clienteDomicilio:  datos.clienteDomicilio || '',
      clienteCuit:       datos.clienteCuit || '',
      clienteCondicion:  datos.clienteCondicion || 'CF',
      neto:              neto,
      iva:               iva,
      total:             total,
      items:             datos.detalle || [],
      fechaTransferencia: datos.fechaTransferencia,
      fechaCbte:         fechaCbte
    });

    if (!resultado.success) return resultado;

    // Persistir en hoja FACTURAS_EMITIDAS
    _guardarFacturaEnHoja({
      id:            Utilities.getUuid().substring(0, 8).toUpperCase(),
      fecha:         formatearFechaLocal(new Date()),
      cbteTipo:      datos.cbteTipo,
      cbteTipoNombre: _nombreTipoComprobante(datos.cbteTipo),
      ptoVta:        resultado.ptoVta || resultado.puntoVenta || 0,
      cbteNro:       resultado.cbteNro || 0,
      clienteNombre: datos.clienteNombre,
      clienteCuit:   datos.clienteCuit || '',
      total:         total,
      cae:           resultado.cae || '',
      caeVto:        resultado.caeVencimiento || '',
      estado:        'EMITIDA',
      usuario:       Session.getActiveUser().getEmail()
    });

    return {
      success:    true,
      cae:        resultado.cae,
      ptoVta:     resultado.ptoVta || resultado.puntoVenta,
      cbteNro:    resultado.cbteNro,
      total:      total,
      mensaje:    'Comprobante emitido exitosamente',
      avisoFecha: avisoFecha
    };

  } catch (error) {
    Logger.log('[FACTURACION] Error en emitirFacturaElectronica: ' + error.message);
    return { success: false, error: afipFormatearErrorUsuario(error) };
  }
}

/**
 * Obtiene el historial de facturas emitidas.
 * Llamada desde: cargarHistorialFacturas()
 */
function obtenerHistorialFacturas() {
  try {
    var hoja = _getHojaFacturas();
    var datos = hoja.getDataRange().getValues();
    if (datos.length <= 1) return { success: true, facturas: [] };

    var facturas = datos.slice(1).map(function(f) {
      return {
        id:            f[0],
        fecha:         f[1],
        cbteTipo:      f[2],
        cbteTipoNombre: f[3],
        ptoVta:        f[4],
        cbteNro:       f[5],
        clienteNombre: f[6],
        clienteCuit:   f[7],
        total:         f[8],
        cae:           f[9],
        caeVto:        f[10],
        estado:        f[11],
        usuario:       f[12]
      };
    }).reverse();

    return { success: true, facturas: serializarParaWeb(facturas) };
  } catch (error) {
    Logger.log('[HISTORIAL_FACTURAS] Error: ' + error.message);
    return { success: false, error: error.message, facturas: [] };
  }
}

/**
 * Emite una Nota de Crédito para anular una factura emitida.
 * Llamada desde: emitirNCDesdeHistorial()
 */
function emitirNotaCredito(facturaId) {
  try {
    var hoja = _getHojaFacturas();
    var datos = hoja.getDataRange().getValues();
    var facturaFila = null, filaIdx = -1;

    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(facturaId)) {
        facturaFila = datos[i];
        filaIdx = i + 1;
        break;
      }
    }

    if (!facturaFila) return { success: false, error: 'Factura no encontrada: ' + facturaId };
    if (facturaFila[11] === 'ANULADA') return { success: false, error: 'La factura ya fue anulada.' };

    var cbteTipoOrig = Number(facturaFila[2]);
    var cbteTipoNC   = cbteTipoOrig === 1 ? 3 : 8; // NCA o NCB

    var resultado = afipEmitirFacturaWrapper({
      cbteTipo:          cbteTipoNC,
      clienteNombre:     facturaFila[6],
      clienteRazonSocial: facturaFila[6],
      clienteDomicilio:  '',
      clienteCuit:       facturaFila[7] || '',
      clienteCondicion:  facturaFila[7] ? 'RI' : 'CF',
      neto:              Number(facturaFila[8]) / 1.105,
      iva:               Number(facturaFila[8]) - (Number(facturaFila[8]) / 1.105),
      total:             Number(facturaFila[8]),
      items:             [{ descripcion: 'Nota de Crédito s/ Comp ' + facturaFila[4] + '-' + facturaFila[5], cantidad: 1, precioUnitario: Number(facturaFila[8]) / 1.105 }]
    });

    if (!resultado.success) return resultado;

    // Marcar factura original como ANULADA
    hoja.getRange(filaIdx, 12).setValue('ANULADA');

    return {
      success: true,
      cae:     resultado.cae,
      cbteNro: resultado.cbteNro,
      mensaje: 'Nota de crédito emitida correctamente'
    };
  } catch (error) {
    Logger.log('[NC] Error: ' + error.message);
    return { success: false, error: afipFormatearErrorUsuario(error) };
  }
}

/**
 * Guarda configuración AFIP SDK en ScriptProperties.
 * Llamada desde: guardarConfigAfipFront()
 */
function guardarConfigAfip(config) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (config.accessToken) props.setProperty('AFIP_ACCESS_TOKEN', config.accessToken.trim());
    if (config.puntoVenta)  props.setProperty('AFIP_PUNTO_VENTA', String(config.puntoVenta));
    if (config.cuit)        props.setProperty('AFIP_CUIT', config.cuit.trim());
    // environment siempre prod — ignorar lo que venga del frontend
    Logger.log('[CONFIG_AFIP] Configuración guardada (environment forzado a prod)');
    return { success: true, mensaje: 'Configuración AFIP guardada. Ambiente: PRODUCCIÓN.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene estado actual de configuración AFIP.
 * Llamada desde: cargarConfigAfip() en frontend
 */
function obtenerConfigAfip() {
  try {
    var props  = PropertiesService.getScriptProperties();
    var token  = props.getProperty('AFIP_ACCESS_TOKEN') || '';
    var cuit   = props.getProperty('AFIP_CUIT') || '';
    var ptoVta = props.getProperty('AFIP_PUNTO_VENTA') || '11';
    var tieneCert = afipTieneCertificado();
    return {
      success:      true,
      configurado:  token.length > 10,
      tokenPreview: token.length > 10 ? ('...' + token.slice(-4)) : 'no configurado',
      cuit:         cuit,
      puntoVenta:   parseInt(ptoVta),
      environment:  'prod',
      tieneCert:    tieneCert,
      certPreview:  tieneCert ? 'Certificado instalado' : 'Sin certificado'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Prueba conexión con ARCA via AfipSDK.
 * Llamada desde: probarConexionAfipFront()
 */
function probarConexionAfip() {
  try {
    var config = afipVerificarConfiguracion();
    if (!config.configurado) return { success: false, error: config.error };
    if (!config.tieneCertificado) return { success: false, error: 'Certificado no configurado en ScriptProperties.' };
    // Prueba real: obtener auth token
    var auth = afipGetAuth(AFIP_CONFIG.WS.FE);
    return {
      success: true,
      mensaje: 'Conexión exitosa con ARCA. CUIT emisor: ' + auth.cuit
    };
  } catch (error) {
    return { success: false, error: afipFormatearErrorUsuario(error) };
  }
}

/**
 * Genera certificado de producción via AfipSDK Automations.
 * Endpoint correcto: POST /api/v1/automations (ASYNC — requiere polling)
 * Llamada desde: generarCertificadoFront()
 */
function generarCertificadoAfip(datos) {
  if (!datos.username || !datos.password) {
    return { success: false, error: 'CUIT y clave fiscal requeridos.' };
  }
  var creds = afipGetCredentials();
  if (!creds.accessToken) {
    return { success: false, error: 'Configurá el Access Token de AfipSDK primero.' };
  }

  var cuitEmisor = (datos.cuit || creds.cuit || datos.username).replace(/[-\s]/g, '');
  var alias      = datos.alias || 'solyverde';
  var headers    = { 'Authorization': 'Bearer ' + creds.accessToken, 'Content-Type': 'application/json' };

  // Paso 1: Iniciar la automatización (POST /api/v1/automations)
  var initPayload = {
    automation: 'create-cert-prod',
    params: {
      tax_id:   cuitEmisor,
      username: datos.username.replace(/[-\s]/g, ''),
      password: datos.password,
      alias:    alias
    }
  };

  var initResp;
  try {
    initResp = _afipAutomationPost(initPayload, creds.accessToken);
  } catch (e) {
    Logger.log('[CERT] Error iniciando automatización: ' + e.message);
    return { success: false, error: 'Error al iniciar automatización: ' + e.message };
  }

  if (!initResp || !initResp.id) {
    return { success: false, error: 'AfipSDK no inició la automatización. Respuesta: ' + JSON.stringify(initResp).substring(0, 200) };
  }

  var jobId = initResp.id;
  Logger.log('[CERT] Automatización iniciada ID: ' + jobId);

  // Paso 2: Polling hasta completar (máx 90 segundos, cada 10s)
  var maxIntentos = 9;
  var resultado   = null;
  for (var i = 0; i < maxIntentos; i++) {
    Utilities.sleep(10000); // 10 segundos entre intentos
    try {
      resultado = _afipAutomationGet(jobId, creds.accessToken);
      Logger.log('[CERT] Intento ' + (i + 1) + ' status: ' + (resultado ? resultado.status : 'null'));
      if (resultado && resultado.status === 'complete') break;
      if (resultado && resultado.status === 'error') {
        return { success: false, error: 'Error en automatización: ' + (resultado.error || JSON.stringify(resultado)) };
      }
    } catch (e) {
      Logger.log('[CERT] Error en polling intento ' + (i + 1) + ': ' + e.message);
    }
  }

  if (!resultado || resultado.status !== 'complete') {
    return { success: false, error: 'Timeout: la automatización no completó en 90 segundos. Verificá manualmente en app.afipsdk.com' };
  }

  var certData = resultado.data;
  if (!certData || !certData.cert || !certData.key) {
    return { success: false, error: 'AfipSDK completó pero no devolvió certificado. Data: ' + JSON.stringify(certData).substring(0, 200) };
  }

  // Guardar cert y key en ScriptProperties
  PropertiesService.getScriptProperties().setProperties({
    'AFIP_CERT': certData.cert,
    'AFIP_KEY':  certData.key
  });

  Logger.log('[CERT] Certificado generado y guardado exitosamente para CUIT ' + cuitEmisor);
  return {
    success: true,
    mensaje: 'Certificado generado y guardado correctamente para CUIT ' + cuitEmisor
  };
}

/**
 * Autoriza web services wsfe y ws_sr_constancia_inscripcion en ARCA (prod).
 * Endpoint correcto: POST /api/v1/automations (ASYNC — requiere polling)
 * Llamada desde: autorizarWebServicesFront()
 */
function autorizarWebServicesAfip(datos) {
  if (!datos.username || !datos.password) {
    return { success: false, error: 'CUIT y clave fiscal requeridos.' };
  }
  var creds = afipGetCredentials();
  if (!creds.accessToken) {
    return { success: false, error: 'Access Token no configurado.' };
  }

  var cuitEmisor = (datos.cuit || creds.cuit || datos.username).replace(/[-\s]/g, '');
  var alias      = datos.alias || 'solyverde';
  // Los servicios que necesitamos autorizar
  var wsids      = ['wsfe', 'ws_sr_constancia_inscripcion'];
  var resultados = [];

  for (var i = 0; i < wsids.length; i++) {
    var wsid = wsids[i];
    Logger.log('[AUTH_WS] Autorizando ' + wsid + '...');

    var initPayload = {
      automation: 'auth-web-service-prod',
      params: {
        tax_id:   cuitEmisor,
        username: datos.username.replace(/[-\s]/g, ''),
        password: datos.password,
        alias:    alias,
        wsid:     wsid
      }
    };

    try {
      var initResp = _afipAutomationPost(initPayload, creds.accessToken);

      if (!initResp || !initResp.id) {
        resultados.push({ wsid: wsid, ok: false, error: 'No se inició la automatización' });
        continue;
      }

      var jobId = initResp.id;
      Logger.log('[AUTH_WS] Job ' + wsid + ' ID: ' + jobId);

      // Polling (máx 90s)
      var resultado = null;
      for (var j = 0; j < 9; j++) {
        Utilities.sleep(10000);
        try {
          resultado = _afipAutomationGet(jobId, creds.accessToken);
          Logger.log('[AUTH_WS] ' + wsid + ' intento ' + (j+1) + ' status: ' + (resultado ? resultado.status : 'null'));
          if (resultado && resultado.status === 'complete') break;
          if (resultado && resultado.status === 'error') break;
        } catch (e) {
          Logger.log('[AUTH_WS] Error polling ' + wsid + ': ' + e.message);
        }
      }

      if (resultado && resultado.status === 'complete') {
        resultados.push({ wsid: wsid, ok: true });
      } else {
        var err = (resultado && resultado.error) ? resultado.error : 'Timeout o error desconocido';
        resultados.push({ wsid: wsid, ok: false, error: err });
      }
    } catch (e) {
      resultados.push({ wsid: wsid, ok: false, error: e.message });
    }
  }

  var exitosos = resultados.filter(function(r) { return r.ok; }).map(function(r) { return r.wsid; });
  var fallidos  = resultados.filter(function(r) { return !r.ok; });

  if (exitosos.length === 0) {
    return { success: false, error: 'No se pudo autorizar ningún servicio. ' + JSON.stringify(fallidos) };
  }

  var msg = 'Servicios autorizados: ' + exitosos.join(', ');
  if (fallidos.length > 0) {
    msg += '. Con errores: ' + fallidos.map(function(f) { return f.wsid + ' (' + f.error + ')'; }).join(', ');
  }

  return { success: true, mensaje: msg };
}

// ─── HELPERS PRIVADOS para Automations API ──────────────────────────────────

/**
 * POST a /api/v1/automations (endpoint distinto a /api/v1/afip/*)
 */
function _afipAutomationPost(payload, accessToken) {
  var url = 'https://app.afipsdk.com/api/v1/automations';
  var options = {
    method:      'post',
    contentType: 'application/json',
    headers:     { 'Authorization': 'Bearer ' + accessToken },
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  Logger.log('[AUTOMATION POST] HTTP ' + code + ': ' + text.substring(0, 300));

  if (code !== 200 && code !== 201) {
    throw new Error('Error HTTP ' + code + ' en automations: ' + text.substring(0, 200));
  }
  return JSON.parse(text);
}

/**
 * GET a /api/v1/automations/{id} para polling del resultado
 */
function _afipAutomationGet(jobId, accessToken) {
  var url = 'https://app.afipsdk.com/api/v1/automations/' + jobId;
  var options = {
    method:      'get',
    headers:     { 'Authorization': 'Bearer ' + accessToken },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  if (code !== 200) {
    throw new Error('Error HTTP ' + code + ' en GET automation: ' + text.substring(0, 200));
  }
  return JSON.parse(text);
}

/**
 * Actualiza condición fiscal de todos los clientes con CUIT desde ARCA.
 * Llamada desde: actualizarCondFiscalesFront()
 */
function actualizarCondicionesFiscalesDesdeArca() {
  try {
    var clientes = ClientesRepository.obtenerTodos();
    var conCuit  = clientes.filter(function(c) { return c.cuit && c.cuit.length >= 11; });
    var actualizados = 0, errores = 0;

    conCuit.forEach(function(cliente) {
      try {
        var resultado = afipConsultarCUITWrapper(cliente.cuit);
        if (resultado.encontrado && resultado.condicionIVA) {
          var condTexto = resultado.condicionIVA === 'RI' ? 'Responsable Inscripto' :
                          resultado.condicionIVA === 'M'  ? 'Monotributista' : 'Consumidor Final';
          ClientesRepository.actualizar(cliente.nombre, { condicionFiscal: condTexto });
          Utilities.sleep(200); // respetar rate limit de ARCA
          actualizados++;
        }
      } catch (e) {
        Logger.log('[COND_FISCAL] Error en ' + cliente.nombre + ': ' + e.message);
        errores++;
      }
    });

    return {
      success: true,
      mensaje: actualizados + ' clientes actualizados, ' + errores + ' errores de ' + conCuit.length + ' procesados.'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─── SECCIÓN 3: HELPERS PRIVADOS ────────────────────────────────────────────

function _normalizarDatosFactura(datos) {
  return {
    cbteTipo:          Number(datos.cbteTipo) || 6,
    clienteNombre:     (datos.clienteNombre  || datos.cliente || '').toUpperCase().trim(),
    clienteRazonSocial: datos.clienteRazonSocial || datos.clienteNombre || '',
    clienteDomicilio:  datos.clienteDomicilio || datos.domicilio || '',
    clienteCuit:       (datos.clienteCuit || datos.cuit || '').replace(/[-\s]/g, ''),
    clienteCondicion:  datos.clienteCondicion || datos.condicion || 'CF',
    importeNeto:       Number(datos.importeNeto || datos.neto) || 0,
    detalle:           datos.detalle || datos.items || [],
    fechaTransferencia: datos.fechaTransferencia || null
  };
}

function _calcularFechaValidaArca(fechaTransferencia) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (!fechaTransferencia) return _afipFormatFecha(hoy);

  var fechaTrans = parsearFechaLocal(fechaTransferencia);
  fechaTrans.setHours(0, 0, 0, 0);
  var diffDias = Math.floor((hoy - fechaTrans) / 86400000);

  if (diffDias >= 0 && diffDias <= 5) return _afipFormatFecha(fechaTrans);
  if (diffDias > 5) {
    var limite = new Date(hoy);
    limite.setDate(limite.getDate() - 5);
    return _afipFormatFecha(limite);
  }
  return _afipFormatFecha(hoy);
}

function _afipFormatFecha(fecha) {
  return String(fecha.getFullYear()) +
         String(fecha.getMonth() + 1).padStart(2, '0') +
         String(fecha.getDate()).padStart(2, '0');
}

function _nombreTipoComprobante(cbteTipo) {
  var nombres = { 1: 'Factura A', 3: 'N.Crédito A', 6: 'Factura B', 8: 'N.Crédito B' };
  return nombres[cbteTipo] || 'Comprobante ' + cbteTipo;
}

function _getHojaFacturas() {
  var ss  = getSpreadsheet();
  var nombre = AFIP_CONFIG.HOJA_FACTURAS || 'FACTURAS_EMITIDAS';
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    hoja.appendRow(['ID','FECHA','CBTE_TIPO','CBTE_TIPO_NOMBRE','PTO_VTA','CBTE_NRO',
                    'CLIENTE_NOMBRE','CLIENTE_CUIT','TOTAL','CAE','CAE_VTO','ESTADO','USUARIO']);
    hoja.getRange(1,1,1,13).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _guardarFacturaEnHoja(datos) {
  var hoja = _getHojaFacturas();
  hoja.appendRow([
    datos.id, datos.fecha, datos.cbteTipo, datos.cbteTipoNombre,
    datos.ptoVta, datos.cbteNro, datos.clienteNombre, datos.clienteCuit,
    datos.total, datos.cae, datos.caeVto, datos.estado, datos.usuario
  ]);
}
