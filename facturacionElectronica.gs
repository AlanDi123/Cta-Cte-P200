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
 * Genera certificado digital via AfipSDK automation.
 * Llamada desde: generarCertificadoFront()
 */
function generarCertificadoAfip(datos) {
  try {
    if (!datos.username || !datos.password) {
      return { success: false, error: 'CUIT y clave fiscal requeridos.' };
    }
    var creds = afipGetCredentials();
    if (!creds.accessToken) {
      return { success: false, error: 'Configurá el Access Token de AfipSDK primero.' };
    }

    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      username:    datos.username.replace(/[-\s]/g, ''),
      password:    datos.password,
      alias:       datos.alias || 'solyverde'
    };

    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };

    var response = afipFetch('/automations/create-cert-prod', payload, headers);

    if (!response.cert || !response.key) {
      throw new Error('AfipSDK no devolvió certificado. Respuesta: ' + JSON.stringify(response).substring(0, 200));
    }

    PropertiesService.getScriptProperties().setProperties({
      'AFIP_CERT': response.cert,
      'AFIP_KEY':  response.key
    });

    return {
      success: true,
      mensaje: 'Certificado generado y guardado en ScriptProperties.',
      wsAutorizados: response.wsAutorizados || []
    };
  } catch (error) {
    Logger.log('[CERT] Error: ' + error.message);
    return { success: false, error: 'Error al generar certificado: ' + error.message };
  }
}

/**
 * Autoriza web services en ARCA.
 * Llamada desde: autorizarWebServicesFront()
 */
function autorizarWebServicesAfip(datos) {
  try {
    var creds = afipGetCredentials();
    if (!creds.accessToken) return { success: false, error: 'Access Token no configurado.' };

    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      username:    (datos.username || '').replace(/[-\s]/g, ''),
      password:    datos.password,
      services:    ['wsfe', 'ws_sr_padron_a13']
    };

    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };

    var response = afipFetch('/automations/wsaa', payload, headers);

    return {
      success: true,
      mensaje: 'Web services autorizados: wsfe, ws_sr_padron_a13'
    };
  } catch (error) {
    return { success: false, error: 'Error al autorizar: ' + error.message };
  }
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
