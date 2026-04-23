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

/**
 * Normaliza texto de condición fiscal (mayúsculas + sin diacríticos) para comparar.
 */
function _normalizarTextoCondicionFiscal(s) {
  var t = String(s || '');
  try {
    if (typeof t.normalize === 'function') {
      t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
  } catch (ignore) { /* entorno sin normalize */ }
  return t.toUpperCase().trim();
}

/**
 * True si el receptor puede recibir Factura A (RI, Monotributo o Monotributo Social).
 * Criterio alineado con afipConstruirFECAEDetRequest (condId 1, 6, 13).
 */
function _esReceptorFacturaA(clienteCondicion) {
  var cond = _normalizarTextoCondicionFiscal(clienteCondicion);
  if (!cond) return false;
  if (cond === 'RI' || cond === 'M') return true;
  if (cond.indexOf('RESPONSABLE') >= 0 && cond.indexOf('INSCRIP') >= 0) return true;
  if (cond.indexOf('MONOTRIBUT') >= 0) return true;
  if (cond.indexOf('SOCIAL') >= 0 && cond.indexOf('MONOTRIBUT') >= 0) return true;
  return false;
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
  var datos = null;
  var neto = 0;
  var iva = 0;
  var total = 0;
  var fechaCbte = '';
  try {
    datos = _normalizarDatosFactura(datosFactura);

    // ── Validación inline (sin depender de utils.gs) ─────────────────────────
    var erroresValidacion = [];

    if (!datos.clienteNombre || datos.clienteNombre.trim() === '') {
      erroresValidacion.push('Nombre del cliente requerido.');
    }

    // Factura A requiere CUIT y condición RI/Monotributo
    if (datos.cbteTipo === 1) {
      if (!datos.clienteCuit || datos.clienteCuit.trim() === '') {
        erroresValidacion.push('Factura A requiere CUIT del cliente.');
      } else if (!validarCuitModulo11(datos.clienteCuit)) {
        erroresValidacion.push('CUIT del cliente inválido (verificador).');
      }
      if (!_esReceptorFacturaA(datos.clienteCondicion)) {
        erroresValidacion.push('Factura A solo para Responsable Inscripto o Monotributista. Condición actual: ' + (datos.clienteCondicion || 'no especificada'));
      }
      if (!datos.clienteRazonSocial || datos.clienteRazonSocial.trim() === '') {
        erroresValidacion.push('Factura A requiere Razón Social del cliente.');
      }
    }

    if (erroresValidacion.length > 0) {
      return { success: false, error: erroresValidacion.join(' | ') };
    }

    // ── Calcular importes ────────────────────────────────────────────────────
    var propsFact = PropertiesService.getScriptProperties();
    var ivaPct = parseFloat(propsFact.getProperty('IVA_PORCENTAJE') || '10.5') / 100;
    var ivaAlicIdCfg = parseInt(propsFact.getProperty('IVA_ALICUOTA_ID') || '4', 10);
    var alicuotaPctEsperado = { 3: 0, 4: 10.5, 5: 21, 6: 27 };
    var pctAlic = alicuotaPctEsperado[ivaAlicIdCfg];
    if (pctAlic !== undefined && Math.abs(ivaPct * 100 - pctAlic) > 0.02) {
      return {
        success: false,
        error: 'Configuración IVA incoherente: IVA_PORCENTAJE=' + (ivaPct * 100) + '% no coincide con IVA_ALICUOTA_ID=' + ivaAlicIdCfg +
          ' (alícuota ARCA ' + pctAlic + '%). Revisá IVA_PORCENTAJE e IVA_ALICUOTA_ID en Propiedades del script.'
      };
    }

    if (datos.importeNeto > 0) {
      neto  = Math.round(datos.importeNeto * 100) / 100;
      iva   = Math.round(neto * ivaPct * 100) / 100;
      total = Math.round((neto + iva) * 100) / 100;
    } else if (datos.detalle && datos.detalle.length > 0) {
      neto = datos.detalle.reduce(function(s, item) {
        return s + (Number(item.precioUnitario || item.precioUnit || item.precio || 0) * Number(item.cantidad || 1));
      }, 0);
      neto  = Math.round(neto * 100) / 100;
      iva   = Math.round(neto * ivaPct * 100) / 100;
      total = Math.round((neto + iva) * 100) / 100;
    } else {
      return { success: false, error: 'No se pudo calcular el importe: no hay items ni importeNeto.' };
    }

    if (total <= 0) {
      return { success: false, error: 'El total calculado es $0. Revisá los productos o el monto.' };
    }

    Logger.log('[FACT] cbteTipo=' + datos.cbteTipo +
               ' cliente=' + datos.clienteNombre +
               ' neto=$' + neto + ' iva=$' + iva + ' total=$' + total);

    // ── Fecha válida para ARCA (máx 5 días atrás) ───────────────────────────
    fechaCbte = _calcularFechaValidaArca(datos.fechaTransferencia);
    var avisoFecha = null;
    if (datos.fechaTransferencia) {
      var fTrans   = parsearFechaLocal(datos.fechaTransferencia);
      var diffDias = Math.floor((new Date() - fTrans) / 86400000);
      if (diffDias > 5) {
        avisoFecha = 'Operación con fecha de hace ' + diffDias +
                     ' días. ARCA usará la fecha máxima permitida (5 días hacia atrás).';
      }
    }

    // ── Llamada a AFIP ───────────────────────────────────────────────────────
    var resultado = afipEmitirFacturaWrapper({
      cbteTipo:         datos.cbteTipo,
      clienteNombre:    datos.clienteNombre,
      clienteCuit:      datos.clienteCuit,
      clienteCondicion: datos.clienteCondicion,
      neto:             neto,
      iva:              iva,
      total:            total,
      fecha:            datos.fechaTransferencia,
      fechaTransferencia: datos.fechaTransferencia,
      fechaCbte:        fechaCbte
    });

    if (!resultado.success) {
      try {
        encolarFacturaPendienteARCA({
          v: 1,
          motivo: 'AFIP_RECHAZO_O_ERROR',
          cbteTipo: datos.cbteTipo,
          clienteNombre: datos.clienteNombre,
          clienteRazonSocial: datos.clienteRazonSocial,
          clienteDomicilio: datos.clienteDomicilio,
          clienteCuit: datos.clienteCuit,
          clienteCondicion: datos.clienteCondicion,
          importeNeto: neto,
          neto: neto,
          iva: iva,
          total: total,
          fechaTransferencia: datos.fechaTransferencia,
          fechaCbte: fechaCbte,
          detalle: datos.detalle || [],
          ultimoError: String(resultado.error || resultado.mensaje || ''),
          encoladoEn: new Date().toISOString()
        });
      } catch (ignore) { /* cola opcional */ }
      return resultado;
    }

    var postAfipError = '';
    try {
      // ── Descontar stock de productos facturados ────────────────────────────
      if (datos.detalle && datos.detalle.length > 0) {
        datos.detalle.forEach(function(item) {
          var prodId = parseInt(item.productoId || item.id || 0);
          if (prodId > 0) {
            try {
              ProductosRepository.descontarStock(prodId, parseInt(item.cantidad) || 1);
              Logger.log('[FACT] Stock descontado: prodId=' + prodId);
            } catch (e) {
              Logger.log('[FACT] Aviso stock prodId=' + prodId + ': ' + e.message);
            }
          }
        });
      }

      // ── Guardar en hoja FACTURAS_EMITIDAS ───────────────────────────────────
      _guardarFacturaEnHoja({
        id:            Utilities.getUuid().substring(0, 8).toUpperCase(),
        fecha:         formatearFechaLocal(new Date()),
        cbteTipo:      datos.cbteTipo,
        cbteTipoNombre: _nombreTipoComprobante(datos.cbteTipo),
        ptoVta:        resultado.ptoVta || resultado.puntoVenta || 0,
        cbteNro:       resultado.cbteNro || 0,
        clienteNombre: datos.clienteNombre,
        clienteCuit:   datos.clienteCuit || '',
        clienteRazonSocial: datos.clienteRazonSocial || '',
        condicionIvaReceptor: datos.clienteCondicionTexto || '',
        impNeto:       neto,
        impIVA:        iva,
        total:         total,
        detalle:       datos.detalle || [],
        cae:           resultado.cae || '',
        caeVto:        resultado.caeVencimiento || '',
        estado:        'EMITIDA',
        usuario:       Session.getActiveUser().getEmail()
      });
    } catch (ePost) {
      postAfipError = ePost.message || String(ePost);
      Logger.log('[FACT] Error post-AFIP (stock/hoja, CAE ya emitido): ' + postAfipError);
    }

    var mensajeFront = resultado.mensaje || ('Comprobante emitido correctamente. CAE: ' + resultado.cae);
    if (avisoFecha) mensajeFront = mensajeFront + ' · ' + avisoFecha;
    if (postAfipError) {
      mensajeFront = mensajeFront + ' · Atención: el comprobante fue autorizado en ARCA pero falló guardar stock o la hoja local: ' + postAfipError;
    }

    return {
      success:    true,
      cae:        resultado.cae,
      ptoVta:     resultado.ptoVta || resultado.puntoVenta,
      cbteNro:    resultado.cbteNro,
      total:      total,
      mensaje:    mensajeFront,
      avisoFecha: avisoFecha,
      advertencia: postAfipError || undefined
    };

  } catch (error) {
    Logger.log('[FACT] Error en emitirFacturaElectronica: ' + error.message);
    try {
      if (datos) {
        encolarFacturaPendienteARCA({
          v: 1,
          motivo: 'EXCEPCION_EMISION',
          cbteTipo: datos.cbteTipo,
          clienteNombre: datos.clienteNombre,
          clienteCuit: datos.clienteCuit,
          clienteCondicion: datos.clienteCondicion,
          importeNeto: neto,
          neto: neto,
          iva: iva,
          total: total,
          fechaTransferencia: datos.fechaTransferencia,
          fechaCbte: fechaCbte,
          detalle: datos.detalle || [],
          ultimoError: error.message,
          encoladoEn: new Date().toISOString()
        });
      }
    } catch (ignore) { /* cola opcional */ }
    return { success: false, error: 'Error al emitir o guardar el comprobante: ' + error.message };
  }
}

/**
 * Obtiene el historial de facturas emitidas.
 * Llamada desde: cargarHistorialFacturas()
 */

// Alias de columnas: cada key es el campo canónico, el array son todos los nombres posibles
var ALIASES_COLUMNAS = {
  'ID':              ['ID','UUID'],
  'FECHA':           ['FECHA','FECHA_EMISION','FECHA_CBTE','DATE'],
  'CBTE_TIPO':       ['CBTE_TIPO','TIPO','TIPO_CBTE','CBTE_TYPE'],
  'CBTE_TIPO_NOMBRE':['CBTE_TIPO_NOMBRE','TIPO_NOMBRE','NOMBRE_TIPO','CBTE_TIPO_NOM'],
  'CBTE_NRO':        ['CBTE_NRO','NRO','NUMERO','NRO_COMPROBANTE','CBTE_NUMERO'],
  'PTO_VTA':         ['PTO_VTA','PUNTO_VENTA','PTOVTA','PV'],
  'CLIENTE':         ['CLIENTE','CLIENTE_NOMBRE','RAZON_SOCIAL_CLIENTE','NOMBRE_CLIENTE'],
  'RAZON_SOCIAL':    ['RAZON_SOCIAL','CLIENTE_RAZON_SOCIAL','RAZON_SOCIAL_CLIENTE','RAZON_SOCIAL_RECEPTOR'],
  'CONDICION_IVA':   ['CONDICION_IVA','COND_IVA_RECEPTOR','RECEPTOR_IVA','IVA_RECEPTOR'],
  'CUIT':            ['CUIT','CUIT_CLIENTE','DOCUMENTO','DOC_NRO'],
  'CONDICION':       ['CONDICION','CONDICION_VENTA','COND_VENTA','CONDICION_PAGO'],
  'NETO':            ['NETO','IMP_NETO','IMPORTE_NETO','NETO_GRAVADO'],
  'IVA':             ['IVA','IMP_IVA','IMPORTE_IVA','TOTAL_IVA'],
  'TOTAL':           ['TOTAL','IMP_TOTAL','IMPORTE_TOTAL','MONTO_TOTAL'],
  'CAE':             ['CAE','COD_CAE','CODIGO_CAE','CAE_NRO'],
  'CAE_VTO':         ['CAE_VTO','VENCIMIENTO_CAE','FECHA_VTO_CAE','CAE_VENCIMIENTO','VTO_CAE'],
  'CBTE_ASOC_TIPO':  ['CBTE_ASOC_TIPO','TIPO_CBTE_ASOC','ASOC_TIPO'],
  'CBTE_ASOC_NRO':   ['CBTE_ASOC_NRO','NRO_CBTE_ASOC','ASOC_NRO'],
  'ESTADO':          ['ESTADO','STATUS','ESTADO_CBTE'],
  'PDF_URL':         ['PDF_URL','URL_PDF','LINK_PDF','PDF'],
  'DETALLE':         ['DETALLE','ITEMS','DETALLE_ITEMS','LINEAS'],
  'USUARIO':         ['USUARIO','USER','EMITIDO_POR','OPERADOR']
};

function obtenerHistorialFacturas() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Nombres de hojas aceptados (ambas fuentes) ──────────────────────────
    var HOJAS_FUENTE = ['FACTURAS_EMITIDAS', 'FacturasARCA', 'Facturas_ARCA', 'FACTURAS_ARCA'];

    var todasLasFacturas = [];

    HOJAS_FUENTE.forEach(function(nombreHoja) {
      var hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;

      var datos = hoja.getDataRange().getValues();
      if (datos.length <= 1) return;

      // Mapa de índices por nombre de columna (UPPERCASE)
      var cabecera = datos[0].map(function(c) { return String(c).toUpperCase().trim().replace(/\s+/g, '_'); });
      var col = {};
      cabecera.forEach(function(nombre, idx) { col[nombre] = idx; });

      function get(fila, campo) {
        // Acepta múltiples alias por columna
        var aliases = ALIASES_COLUMNAS[campo] || [campo];
        for (var a = 0; a < aliases.length; a++) {
          var idx = col[aliases[a].toUpperCase()];
          if (idx !== undefined && fila[idx] !== '' && fila[idx] !== null && fila[idx] !== undefined) {
            return fila[idx];
          }
        }
        return '';
      }

      for (var i = 1; i < datos.length; i++) {
        var fila = datos[i];
        var id = String(get(fila, 'ID') || '').trim();
        if (!id) continue;

        var cbteTipoNum = Number(get(fila, 'CBTE_TIPO')) || 0;
        var tiposNombre = {1:'FACTURA A',2:'NOTA DEBITO A',3:'NOTA CREDITO A',
                           6:'FACTURA B',7:'NOTA DEBITO B',8:'NOTA CREDITO B',
                           11:'FACTURA C',12:'NOTA DEBITO C',13:'NOTA CREDITO C'};

        var total   = Number(get(fila, 'TOTAL'))  || 0;
        var impNeto = Number(get(fila, 'NETO'))   || 0;
        var impIVA  = Number(get(fila, 'IVA'))    || 0;

        // Calcular neto/iva si no están guardados
        if (!impNeto && total > 0) {
          if (cbteTipoNum === 1 || cbteTipoNum === 3) {
            impNeto = parseFloat((total / 1.21).toFixed(2));
            impIVA  = parseFloat((total - impNeto).toFixed(2));
          } else {
            impNeto = total; impIVA = 0;
          }
        }

        // Detalle de ítems
        var detalleRaw = get(fila, 'DETALLE');
        var detalle = [];
        if (detalleRaw) {
          try { var p = JSON.parse(String(detalleRaw)); if (Array.isArray(p)) detalle = p; }
          catch(e) {}
        }

        todasLasFacturas.push({
          id:             id,
          fecha:          _hfFormatearFecha(get(fila, 'FECHA')),
          fechaISO:       _hfFechaISO(get(fila, 'FECHA')),
          cbteTipo:       cbteTipoNum,
          cbteTipoNombre: String(get(fila, 'CBTE_TIPO_NOMBRE') || tiposNombre[cbteTipoNum] || ('COMP. ' + cbteTipoNum)),
          cbteNro:        Number(get(fila, 'CBTE_NRO'))   || 0,
          ptoVta:         Number(get(fila, 'PTO_VTA'))    || 0,
          clienteNombre:  String(get(fila, 'CLIENTE')     || ''),
          clienteRazonSocial: String(get(fila, 'RAZON_SOCIAL') || ''),
          clienteCondicionTexto: String(get(fila, 'CONDICION_IVA') || ''),
          clienteCuit:    String(get(fila, 'CUIT')        || ''),
          condicionVenta: String(get(fila, 'CONDICION')   || 'CONTADO'),
          impNeto:        impNeto,
          impIVA:         impIVA,
          total:          total,
          cae:            String(get(fila, 'CAE')         || ''),
          caeVto:         String(get(fila, 'CAE_VTO')     || ''),
          cbteAsocTipo:   Number(get(fila, 'CBTE_ASOC_TIPO')) || 0,
          cbteAsocNro:    Number(get(fila, 'CBTE_ASOC_NRO'))  || 0,
          estado:         String(get(fila, 'ESTADO')      || 'EMITIDA').toUpperCase(),
          pdfUrl:         String(get(fila, 'PDF_URL')     || ''),
          detalle:        detalle,
          usuario:        String(get(fila, 'USUARIO')     || ''),
          fuenteHoja:     nombreHoja
        });
      }
    });

    // Deduplicar por ID (si una factura existe en ambas hojas, queda la primera)
    var vistosIds = {};
    var facturas = todasLasFacturas.filter(function(f) {
      if (vistosIds[f.id]) return false;
      vistosIds[f.id] = true;
      return true;
    });

    // Ordenar: más reciente primero usando fechaISO
    facturas.sort(function(a, b) {
      return b.fechaISO.localeCompare(a.fechaISO);
    });

    return { success: true, facturas: facturas };

  } catch (e) {
    Logger.log('[obtenerHistorialFacturas] ' + e.message + '\n' + e.stack);
    return { success: false, error: e.message, facturas: [] };
  }
}

// Convierte fecha a DD/MM/YYYY para mostrar
function _hfFormatearFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    var d = valor.getDate(), m = valor.getMonth()+1, y = valor.getFullYear();
    return String(d<10?'0'+d:d)+'/'+String(m<10?'0'+m:m)+'/'+y;
  }
  var s = String(valor).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var p = s.substring(0,10).split('-'); return p[2]+'/'+p[1]+'/'+p[0];
  }
  var n = Number(s);
  if (!isNaN(n) && n > 30000) {
    var fd = new Date((n-25569)*86400000);
    return String(fd.getUTCDate()<10?'0'+fd.getUTCDate():fd.getUTCDate())+'/'+
           String(fd.getUTCMonth()+1<10?'0'+(fd.getUTCMonth()+1):fd.getUTCMonth()+1)+'/'+
           fd.getUTCFullYear();
  }
  return s;
}

// Convierte fecha a YYYY-MM-DD para ordenar correctamente
function _hfFechaISO(valor) {
  var fmt = _hfFormatearFecha(valor);
  if (!fmt) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fmt)) {
    var p = fmt.split('/');
    return p[2]+'-'+String(p[1]).padStart(2,'0')+'-'+String(p[0]).padStart(2,'0');
  }
  return fmt;
}

/**
 * Parsea el campo DETALLE: puede ser un JSON string o texto plano.
 * Devuelve siempre un array de ítems (puede ser vacío).
 */
function _hfParsearDetalle(valor) {
  if (!valor) return [];
  var s = String(valor).trim();
  if (!s || s === '[]' || s === '{}') return [];
  try {
    var parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Porcentaje IVA configurado (mismo criterio que emisión) para estimar neto desde total.
 */
function _hfIvaPctParaNetoDesdeTotal() {
  var p = parseFloat(PropertiesService.getScriptProperties().getProperty('IVA_PORCENTAJE') || '21');
  if (isNaN(p) || p <= 0) p = 21;
  return p / 100;
}

/**
 * Rellena la columna DETALLE en facturas antiguas donde está vacío.
 *
 * ARCA/FECompConsultar no devuelve renglones de productos: la integración emite totales consolidados,
 * así que no es posible recuperar el detalle real. Se graba UNA línea sintética con el importe neto
 * gravado (desde columnas NETO/TOTAL) para que la impresión RG muestre importes coherentes.
 *
 * @param {Object} [opciones]
 * @param {boolean} [opciones.soloVacios=true]  No pisar filas que ya tienen JSON de ítems.
 * @param {boolean} [opciones.enriquecerReceptor=false]  Completar RAZON_SOCIAL y CONDICION_IVA desde padrón (lento; 1 llamada/CUIT).
 * @param {number} [opciones.limite=0]  Máx. filas a actualizar (DETALLE); 0 = sin límite.
 * @returns {{ success:boolean, mensaje:string, actualizadasDetalle:number, actualizadasReceptor:number, omitidas:number, errores:Array, porHoja:Array }}
 */
function reconstruirDetalleFacturasHistoricas(opciones) {
  opciones = opciones || {};
  var soloVacios = opciones.soloVacios !== false;
  var enriquecerReceptor = opciones.enriquecerReceptor === true;
  var limite = Number(opciones.limite) || 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var HOJAS_FUENTE = ['FACTURAS_EMITIDAS', 'FacturasARCA', 'Facturas_ARCA', 'FACTURAS_ARCA'];
  var ivaPct = _hfIvaPctParaNetoDesdeTotal();

  var actualizadasDetalle = 0;
  var actualizadasReceptor = 0;
  var omitidas = 0;
  var errores = [];
  var porHoja = [];

  HOJAS_FUENTE.forEach(function(nombreHoja) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;

    if (nombreHoja === (typeof AFIP_CONFIG !== 'undefined' && AFIP_CONFIG.HOJA_FACTURAS
      ? AFIP_CONFIG.HOJA_FACTURAS
      : 'FACTURAS_EMITIDAS')) {
      _hfEnsureFacturasEmitidasColumns(hoja);
    }
    if (enriquecerReceptor) {
      _hfEnsureColumnasReceptorOpcional(hoja);
    }

    var datos = hoja.getDataRange().getValues();
    if (datos.length <= 1) return;

    var cabecera = datos[0].map(function(c) {
      return String(c).toUpperCase().trim().replace(/\s+/g, '_');
    });
    var col = {};
    cabecera.forEach(function(n, idx) { col[n] = idx; });

    function findCol(aliases) {
      for (var a = 0; a < aliases.length; a++) {
        var u = aliases[a].toUpperCase();
        if (col[u] !== undefined) return col[u];
      }
      return -1;
    }

    var idxDetalle = findCol(['DETALLE', 'ITEMS', 'DETALLE_ITEMS', 'LINEAS']);
    var idxNeto = findCol(['NETO', 'IMP_NETO', 'IMPORTE_NETO', 'NETO_GRAVADO']);
    var idxTotal = findCol(['TOTAL', 'IMP_TOTAL', 'IMPORTE_TOTAL', 'MONTO_TOTAL']);
    var idxCbteTipo = findCol(['CBTE_TIPO', 'TIPO', 'TIPO_CBTE', 'CBTE_TYPE']);
    var idxCuit = findCol(['CUIT', 'CUIT_CLIENTE', 'DOCUMENTO', 'DOC_NRO']);
    var idxRazon = findCol(['RAZON_SOCIAL', 'CLIENTE_RAZON_SOCIAL', 'RAZON_SOCIAL_CLIENTE']);
    var idxCondIva = findCol(['CONDICION_IVA', 'COND_IVA_RECEPTOR', 'RECEPTOR_IVA', 'IVA_RECEPTOR']);

    if (idxDetalle < 0) {
      errores.push(nombreHoja + ': sin columna DETALLE');
      return;
    }

    var rep = { nombre: nombreHoja, detalle: 0, receptor: 0, omitidas: 0 };

    for (var i = 1; i < datos.length; i++) {
      if (limite > 0 && actualizadasDetalle >= limite) break;

      var fila = datos[i];
      var rawDet = fila[idxDetalle];
      var detalle = _hfParsearDetalle(rawDet);

      var total = idxTotal >= 0 ? Number(fila[idxTotal]) : 0;
      var impNeto = idxNeto >= 0 ? Number(fila[idxNeto]) : 0;
      var cbteTipoNum = idxCbteTipo >= 0 ? Number(fila[idxCbteTipo]) : 0;

      if (!impNeto && total > 0 && (cbteTipoNum === 1 || cbteTipoNum === 2 || cbteTipoNum === 3)) {
        impNeto = Math.round((total / (1 + ivaPct)) * 100) / 100;
      } else if (!impNeto && total > 0) {
        impNeto = total;
      }

      if (soloVacios && detalle.length > 0) {
        rep.omitidas++;
        omitidas++;
      } else {
        var netoLinea = impNeto > 0 ? impNeto : (total > 0 ? total : 0);
        if (netoLinea > 0) {
          var items = [{
            descripcion: 'Importe neto gravado (recuperado; sin detalle de productos en archivo)',
            cantidad: 1,
            precioUnitario: netoLinea,
            precioUnit: netoLinea,
            subtotal: netoLinea
          }];
          try {
            hoja.getRange(i + 1, idxDetalle + 1).setValue(JSON.stringify(items));
            actualizadasDetalle++;
            rep.detalle++;
          } catch (e1) {
            errores.push(nombreHoja + ' fila ' + (i + 1) + ': ' + e1.message);
          }
        } else {
          rep.omitidas++;
          omitidas++;
        }
      }

      if (enriquecerReceptor && idxCuit >= 0 && idxRazon >= 0 && idxCondIva >= 0) {
        var cuitRaw = String(fila[idxCuit] || '').replace(/[^0-9]/g, '');
        var razonActual = String(fila[idxRazon] || '').trim();
        var condActual = String(fila[idxCondIva] || '').trim();
        if (cuitRaw.length === 11 && (!razonActual || !condActual)) {
          try {
            Utilities.sleep(350);
            var pad = afipConsultarCUITWrapper(cuitRaw);
            if (pad && pad.encontrado) {
              var hubo = false;
              if (!razonActual && pad.razonSocial) {
                hoja.getRange(i + 1, idxRazon + 1).setValue(pad.razonSocial);
                hubo = true;
              }
              if (!condActual && pad.condicionTexto) {
                hoja.getRange(i + 1, idxCondIva + 1).setValue(pad.condicionTexto);
                hubo = true;
              }
              if (hubo) {
                actualizadasReceptor++;
                rep.receptor++;
              }
            }
          } catch (e2) {
            errores.push('Padrón ' + nombreHoja + ' fila ' + (i + 1) + ': ' + e2.message);
          }
        }
      }
    }

    if (rep.detalle > 0 || rep.receptor > 0 || rep.omitidas > 0) porHoja.push(rep);
  });

  var mensaje = 'Detalle recuperado: ' + actualizadasDetalle + ' fila(s). Receptor (padrón): ' + actualizadasReceptor + '. Omitidas: ' + omitidas + '.';
  if (errores.length) mensaje += ' Avisos: ' + errores.length + '.';

  return {
    success: true,
    mensaje: mensaje,
    actualizadasDetalle: actualizadasDetalle,
    actualizadasReceptor: actualizadasReceptor,
    omitidas: omitidas,
    errores: errores,
    porHoja: porHoja
  };
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

/**
 * Limpia la descripcion de renglones de Factura A: sin datos de medios de pago o transfer.
 */
function _hfSanitizarDescripcionItemFacturaA(s) {
  if (!s) return '';
  var t = String(s);
  t = t.replace(/\s*[-–—:]\s*transfer(?:\s*encia)?[^\n\]]*/gi, ' ');
  t = t.replace(/\btransfer(?:\s*encia|encias)?[:\s]+[^,;\n]*/gi, ' ');
  t = t.replace(
    /\b(santander|mercado\s*pago|mercadopago|banco\s*macro|banco\s*galicia|banco\s*nacion|banco\s*naci[oó]n|bbva|bna|brubank|uala|icbc)\b/gi,
    ' '
  );
  t = t.replace(/\b(cbu|cvu|alias)(?:\s*[:.]?\s*)([^\s,;]+)/gi, ' ');
  t = t.replace(/\s{2,}/g, ' ').replace(/^\s*[,;]\s*|\s*[,;]\s*$/g, ' ').trim();
  if (!t) return 'Venta de Productos';
  return t;
}

function _normalizarDatosFactura(datos) {
  // Soporta AMBAS estructuras:
  //   A) Plana: { clienteNombre, clienteCondicion, importeNeto, ... }
  //   B) Anidada: { cliente: {nombre, condicion, cuit}, items: [...] }

  var clienteObj = datos.cliente || {};
  var esAnidado  = (typeof clienteObj === 'object' && clienteObj !== null && !Array.isArray(clienteObj));

  var clienteNombre    = datos.clienteNombre    || (esAnidado ? clienteObj.nombre    : '') || '';
  var clienteCondicion = datos.clienteCondicion || (esAnidado ? clienteObj.condicion : '') || 'CF';
  var clienteCuit      = datos.clienteCuit      || (esAnidado ? clienteObj.cuit      : '') || '';
  var clienteRS        = datos.clienteRazonSocial || (esAnidado ? clienteObj.razonSocial : '') || clienteNombre;
  var clienteDom       = datos.clienteDomicilio  || (esAnidado ? clienteObj.domicilio  : '') || '';

  // Normalizar condición
  if (!clienteCondicion || clienteCondicion === '') clienteCondicion = 'CF';

  var detalle = datos.detalle || datos.items || [];

  // Calcular importeNeto desde items si no viene explícito
  var importeNetoExplicito = Number(datos.importeNeto || datos.neto) || 0;
  var importeNeto = importeNetoExplicito;

  if (importeNeto <= 0 && detalle.length > 0) {
    // Suma los subtotales de los ítems (precioUnitario × cantidad = precio SIN IVA)
    importeNeto = detalle.reduce(function(sum, item) {
      var pu  = Number(item.precioUnitario || item.precioUnit || item.precio || 0);
      var qty = Number(item.cantidad || 1);
      return sum + (pu * qty);
    }, 0);
    importeNeto = Math.round(importeNeto * 100) / 100;
    Logger.log('[NORM] importeNeto calculado desde items: $' + importeNeto);
  }

  var cbteTipoN = Number(datos.cbteTipo) || 6;

  if (cbteTipoN === 6) {
    if (importeNeto > 0) {
      detalle = [{
        descripcion:     'Venta de Productos',
        cantidad:        1,
        precioUnitario:  importeNeto
      }];
    }
  } else if (cbteTipoN === 1) {
    detalle = (detalle || []).map(function(it) {
      return {
        descripcion:     _hfSanitizarDescripcionItemFacturaA(String(it.descripcion != null ? it.descripcion : '')),
        cantidad:        Number(it.cantidad) > 0 ? Number(it.cantidad) : 1,
        precioUnitario:  Number(it.precioUnitario != null ? it.precioUnitario : (it.precioUnit || it.precio)) || 0,
        productoId:      (it.productoId != null && it.productoId !== '') ? it.productoId : (it.id != null ? it.id : null)
      };
    });
  }

  return {
    cbteTipo:          cbteTipoN,
    clienteNombre:     clienteNombre.toString().toUpperCase().trim(),
    clienteRazonSocial: clienteRS,
    clienteDomicilio:  clienteDom,
    clienteCuit:       clienteCuit.toString().replace(/[-\s]/g, ''),
    clienteCondicion:  clienteCondicion,
    clienteCondicionTexto: String(datos.clienteCondicionTexto || '').trim(),
    importeNeto:       importeNeto,
    detalle:           detalle,
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

function _hfNormHeaderFactura(v) {
  return String(v || '').toUpperCase().trim().replace(/\s+/g, '_');
}

/**
 * Añade columnas NETO, IVA, DETALLE, RAZON_SOCIAL, CONDICION_IVA si la hoja es antigua (13 cols).
 */
function _hfEnsureFacturasEmitidasColumns(hoja) {
  var lastCol = Math.max(hoja.getLastColumn(), 1);
  var headers = hoja.getRange(1, 1, 1, lastCol).getValues()[0].map(_hfNormHeaderFactura);
  var extra = ['NETO', 'IVA', 'DETALLE', 'RAZON_SOCIAL', 'CONDICION_IVA'];
  var toAdd = [];
  for (var i = 0; i < extra.length; i++) {
    if (headers.indexOf(extra[i]) === -1) toAdd.push(extra[i]);
  }
  if (toAdd.length === 0) return;
  var startCol = lastCol + 1;
  // getRange(fila, col, numFilas, numColumnas) — 4.º parámetro es cantidad de columnas, no col final
  hoja.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
  hoja.getRange(1, startCol, 1, toAdd.length)
    .setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
}

/**
 * Añade RAZON_SOCIAL y CONDICION_IVA al final si no existen (p. ej. hoja FacturasARCA antigua).
 */
function _hfEnsureColumnasReceptorOpcional(hoja) {
  var lastCol = Math.max(hoja.getLastColumn(), 1);
  var headers = hoja.getRange(1, 1, 1, lastCol).getValues()[0].map(_hfNormHeaderFactura);
  var extras = ['RAZON_SOCIAL', 'CONDICION_IVA'];
  var toAdd = [];
  for (var i = 0; i < extras.length; i++) {
    if (headers.indexOf(extras[i]) === -1) toAdd.push(extras[i]);
  }
  if (toAdd.length === 0) return;
  var startCol = lastCol + 1;
  hoja.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]);
  hoja.getRange(1, startCol, 1, toAdd.length)
    .setFontWeight('bold').setBackground('#E8F5E9').setFontColor('#000000');
}

function _getHojaFacturas() {
  var ss  = getSpreadsheet();
  var nombre = AFIP_CONFIG.HOJA_FACTURAS || 'FACTURAS_EMITIDAS';
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    var hdr = [
      'ID', 'FECHA', 'CBTE_TIPO', 'CBTE_TIPO_NOMBRE', 'PTO_VTA', 'CBTE_NRO',
      'CLIENTE_NOMBRE', 'CLIENTE_CUIT', 'TOTAL', 'CAE', 'CAE_VTO', 'ESTADO', 'USUARIO',
      'NETO', 'IVA', 'DETALLE', 'RAZON_SOCIAL', 'CONDICION_IVA'
    ];
    hoja.appendRow(hdr);
    hoja.getRange(1, 1, 1, hdr.length).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function _guardarFacturaEnHoja(datos) {
  var hoja = _getHojaFacturas();
  _hfEnsureFacturasEmitidasColumns(hoja);

  var lastCol = hoja.getLastColumn();
  var headers = hoja.getRange(1, 1, 1, lastCol).getValues()[0].map(_hfNormHeaderFactura);

  var detalleStr = '';
  if (datos.detalle && datos.detalle.length > 0) {
    detalleStr = JSON.stringify(datos.detalle);
  }

  var rowVals = headers.map(function(h) {
    switch (h) {
      case 'ID': return datos.id;
      case 'FECHA': return datos.fecha;
      case 'CBTE_TIPO': return datos.cbteTipo;
      case 'CBTE_TIPO_NOMBRE': return datos.cbteTipoNombre;
      case 'PTO_VTA': return datos.ptoVta;
      case 'CBTE_NRO': return datos.cbteNro;
      case 'CLIENTE_NOMBRE': return datos.clienteNombre;
      case 'CLIENTE_CUIT': return datos.clienteCuit;
      case 'TOTAL': return datos.total;
      case 'CAE': return datos.cae;
      case 'CAE_VTO': return datos.caeVto;
      case 'ESTADO': return datos.estado;
      case 'USUARIO': return datos.usuario;
      case 'NETO': return datos.impNeto !== undefined && datos.impNeto !== null ? datos.impNeto : '';
      case 'IVA': return datos.impIVA !== undefined && datos.impIVA !== null ? datos.impIVA : '';
      case 'DETALLE': return detalleStr;
      case 'RAZON_SOCIAL': return datos.clienteRazonSocial || '';
      case 'CONDICION_IVA': return datos.condicionIvaReceptor || '';
      default: return '';
    }
  });

  hoja.appendRow(rowVals);
}

/**
 * Verifica un comprobante emitido consultando FECompConsultar en ARCA.
 * Llamada desde: hfVerificarEnARCA() en el frontend.
 */
function verificarComprobanteARCA(cbteTipo, cbteNro, ptoVta) {
  try {
    if (!cbteTipo || !cbteNro || !ptoVta) {
      return { success: false, error: 'Parámetros incompletos.' };
    }

    var config = afipVerificarConfiguracion();
    if (!config.configurado)      return { success: false, error: 'AFIP no configurado: ' + config.error };
    if (!config.tieneCertificado) return { success: false, error: 'Sin certificado digital instalado.' };

    var auth  = afipGetAuth(AFIP_CONFIG.WS.FE);
    var creds = afipGetCredentials();
    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };

    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method:      'FECompConsultar',
      wsid:        AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        FeCompConsReq: {
          CbteTipo: Number(cbteTipo),
          CbteNro:  Number(cbteNro),
          PtoVta:   Number(ptoVta)
        }
      },
      cert: creds.cert,
      key:  creds.key
    };

    var resultado = afipFetchConRetry('/requests', payload, headers);
    Logger.log('[VERIFICAR_ARCA] Respuesta: ' + JSON.stringify(resultado).substring(0, 400));

    var res = resultado.FECompConsultarResult || resultado;
    if (res.Errors && res.Errors.Err) {
      var errArr = Array.isArray(res.Errors.Err) ? res.Errors.Err : [res.Errors.Err];
      return { success: false, error: 'ARCA: ' + errArr.map(function(e) { return '(' + e.Code + ') ' + e.Msg; }).join(' | ') };
    }

    var comp = res.ResultGet || {};
    return {
      success: true,
      cae:    String(comp.CodAutorizacion || ''),
      caeVto: String(comp.CAEFchVto || ''),
      estado: comp.Resultado || 'APROBADO'
    };

  } catch (error) {
    Logger.log('[VERIFICAR_ARCA] Error: ' + error.message);
    return { success: false, error: afipFormatearErrorUsuario(error) };
  }
}

/**
 * Guarda un comprobante ARCA en la hoja "FacturasARCA".
 * Columnas en orden:
 * ID | FECHA | CBTE_TIPO | CBTE_TIPO_NOMBRE | CBTE_NRO | PTO_VTA | CLIENTE |
 * CUIT | CONDICION | NETO | IVA | TOTAL | CAE | CAE_VTO | CBTE_ASOC_TIPO |
 * CBTE_ASOC_NRO | ESTADO | PDF_URL | DETALLE | USUARIO
 *
 * @param {Object} datos - Objeto con los datos del comprobante
 * @returns {{ success, id, error? }}
 */
function guardarComprobanteARCA(datos) {
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName('FacturasARCA');

    // Crear la hoja con cabecera si no existe
    if (!hoja) {
      hoja = ss.insertSheet('FacturasARCA');
      var cabecera = [
        'ID','FECHA','CBTE_TIPO','CBTE_TIPO_NOMBRE','CBTE_NRO','PTO_VTA',
        'CLIENTE','CUIT','CONDICION','NETO','IVA','TOTAL',
        'CAE','CAE_VTO','CBTE_ASOC_TIPO','CBTE_ASOC_NRO',
        'ESTADO','PDF_URL','DETALLE','USUARIO'
      ];
      hoja.appendRow(cabecera);
      hoja.getRange(1, 1, 1, cabecera.length)
          .setFontWeight('bold')
          .setBackground('#E8F5E9');
      hoja.setFrozenRows(1);
    }

    // Generar ID único
    var id = Utilities.getUuid();

    // Calcular neto e IVA si no vienen informados
    var total    = Number(datos.total)    || 0;
    var impNeto  = Number(datos.impNeto)  || Number(datos.neto)  || 0;
    var impIVA   = Number(datos.impIVA)   || Number(datos.iva)   || 0;
    var cbteTipo = Number(datos.cbteTipo) || Number(datos.cbte_tipo) || 0;

    // Para Fact A: si no viene neto, calcular
    if (!impNeto && (cbteTipo === 1 || cbteTipo === 3) && total > 0) {
      impNeto = parseFloat((total / 1.21).toFixed(2));
      impIVA  = parseFloat((total - impNeto).toFixed(2));
    }
    // Fact B: neto = total (IVA incluido, no discriminado)
    if (!impNeto && (cbteTipo === 6 || cbteTipo === 8) && total > 0) {
      impNeto = total;
      impIVA  = 0;
    }

    // Obtener nombre del tipo de comprobante
    var tiposNombre = {
      1: 'FACTURA A', 2: 'NOTA DEBITO A', 3: 'NOTA CREDITO A',
      6: 'FACTURA B', 7: 'NOTA DEBITO B', 8: 'NOTA CREDITO B',
      11:'FACTURA C', 12:'NOTA DEBITO C', 13:'NOTA CREDITO C'
    };
    var cbteTipoNombre = datos.cbteTipoNombre
      || datos.cbte_tipo_nombre
      || tiposNombre[cbteTipo]
      || ('COMPROBANTE ' + cbteTipo);

    // Fecha formateada DD/MM/YYYY
    var fecha = datos.fecha || _hfFormatearFecha(new Date());

    // Detalle de ítems: serializar a JSON
    var detalle = '';
    if (datos.detalle && Array.isArray(datos.detalle) && datos.detalle.length > 0) {
      detalle = JSON.stringify(datos.detalle);
    } else if (datos.items && Array.isArray(datos.items) && datos.items.length > 0) {
      detalle = JSON.stringify(datos.items);
    }

    // Fila en el orden exacto de las columnas del Sheets
    var fila = [
      id,                                                          // ID
      fecha,                                                       // FECHA
      cbteTipo,                                                    // CBTE_TIPO
      cbteTipoNombre,                                              // CBTE_TIPO_NOMBRE
      Number(datos.cbteNro   || datos.cbte_nro   || 0),           // CBTE_NRO
      Number(datos.ptoVta    || datos.pto_vta    || 0),           // PTO_VTA
      String(datos.clienteNombre || datos.cliente || ''),          // CLIENTE
      String(datos.clienteCuit   || datos.cuit   || ''),          // CUIT
      String(datos.condicionVenta|| datos.condicion || 'CONTADO'),// CONDICION
      impNeto,                                                     // NETO
      impIVA,                                                      // IVA
      total,                                                       // TOTAL
      String(datos.cae || ''),                                     // CAE
      String(datos.caeVto || datos.cae_vto || ''),                 // CAE_VTO
      Number(datos.cbteAsocTipo || datos.cbte_asoc_tipo || 0),    // CBTE_ASOC_TIPO
      Number(datos.cbteAsocNro  || datos.cbte_asoc_nro  || 0),   // CBTE_ASOC_NRO
      String(datos.estado || 'EMITIDA').toUpperCase(),             // ESTADO
      String(datos.pdfUrl || datos.pdf_url || ''),                 // PDF_URL
      detalle,                                                     // DETALLE
      String(datos.usuario || Session.getActiveUser().getEmail() || '')  // USUARIO
    ];

    hoja.appendRow(fila);

    // ── Descontar stock si es Factura A con ítems ─────────────────────────────
    // Solo FA (tipo 1): son las ventas de transferencias con detalle de productos
    if (Number(datos.cbteTipo || datos.cbte_tipo) === 1) {
      var itemsParaStock = datos.detalle || datos.items || [];
      if (itemsParaStock.length > 0) {
        var resultStock = descontarStockPorFactura(itemsParaStock);
        Logger.log('[guardarComprobanteARCA] Stock descontado: ' + JSON.stringify(resultStock).substring(0, 300));
        if (resultStock.errores && resultStock.errores.length > 0) {
          Logger.log('[guardarComprobanteARCA] Advertencias stock: ' + resultStock.errores.join(' | '));
        }
      }
    }

    // Formatear columnas numéricas
    var ultimaFila = hoja.getLastRow();
    hoja.getRange(ultimaFila, 10, 1, 3)
        .setNumberFormat('#,##0.00');  // NETO, IVA, TOTAL

    Logger.log('[guardarComprobanteARCA] Guardado OK — ID: ' + id + ' | Tipo: ' + cbteTipoNombre + ' | Total: $' + total);
    return { success: true, id: id };

  } catch (e) {
    Logger.log('[guardarComprobanteARCA] Error: ' + e.message + ' | Stack: ' + e.stack);
    return { success: false, error: e.message };
  }
}

/**
 * Emite una Nota de Crédito para una factura existente.
 * Busca la factura original en FacturasARCA por ID y construye la NC.
 *
 * @param {string} facturaId - ID UUID de la factura original
 * @returns {{ success, mensaje, nc?, error? }}
 */
function emitirNotaCredito(facturaId) {
  try {
    if (!facturaId) return { success: false, error: 'ID de factura no informado.' };

    // ── Buscar la factura original ───────────────────────────────────────────
    var resultado = obtenerHistorialFacturas();
    if (!resultado.success) return { success: false, error: 'Error al leer historial: ' + resultado.error };

    var facturas = resultado.facturas || [];
    var original = null;
    for (var i = 0; i < facturas.length; i++) {
      if (String(facturas[i].id) === String(facturaId)) {
        original = facturas[i];
        break;
      }
    }
    if (!original) return { success: false, error: 'Factura no encontrada: ' + facturaId };

    // ── Validaciones ─────────────────────────────────────────────────────────
    if (original.estado === 'ANULADA') {
      return { success: false, error: 'La factura ya está anulada.' };
    }
    var cbteTipoNum = Number(original.cbteTipo);
    if (cbteTipoNum !== 1 && cbteTipoNum !== 6) {
      return { success: false, error: 'Solo se pueden hacer NC de Facturas A (tipo 1) o B (tipo 6).' };
    }

    // ── Determinar tipo de NC ─────────────────────────────────────────────────
    // FA (1) → NC A (3) | FB (6) → NC B (8)
    var ncTipo = (cbteTipoNum === 1) ? 3 : 8;

    // ── Verificar configuración AFIP ─────────────────────────────────────────
    var config = afipVerificarConfiguracion();
    if (!config.configurado)      return { success: false, error: 'AFIP no configurado: ' + config.error };
    if (!config.tieneCertificado) return { success: false, error: 'Sin certificado digital.' };

    // ── Obtener último número de NC para este punto de venta ─────────────────
    var ultimoNC = afipUltimoComprobante(ncTipo, Number(original.ptoVta));
    var nroNC    = ultimoNC + 1;

    // ── Fecha hoy ─────────────────────────────────────────────────────────────
    var hoy      = new Date();
    var fechaStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyyMMdd');

    // ── Construir FECAESolicitar ──────────────────────────────────────────────
    var auth  = afipGetAuth(AFIP_CONFIG.WS.FE);
    var creds = afipGetCredentials();

    var ivaAlicIdNC = parseInt(PropertiesService.getScriptProperties().getProperty('IVA_ALICUOTA_ID') || '4', 10);
    if (isNaN(ivaAlicIdNC) || ivaAlicIdNC < 3) ivaAlicIdNC = 4;

    var cuitLimpio = (original.clienteCuit || '').replace(/[^0-9]/g, '');
    var tipoDocRec = (cuitLimpio.length === 11) ? 80 : 99;
    var nroDocRec  = parseInt(cuitLimpio) || 0;

    // Comprobante asociado: la factura original
    var cbteAsoc = [{
      Tipo:    Number(original.cbteTipo),
      PtoVta:  Number(original.ptoVta),
      Nro:     Number(original.cbteNro)
    }];

    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method:      'FECAESolicitar',
      wsid:        AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        FeCAEReq: {
          FeCabReq: {
            CantReg:  1,
            PtoVta:   Number(original.ptoVta),
            CbteTipo: ncTipo
          },
          FeDetReq: {
            FECAEDetRequest: [{
              Concepto:    1,  // Productos
              DocTipo:     tipoDocRec,
              DocNro:      nroDocRec,
              CbteDesde:   nroNC,
              CbteHasta:   nroNC,
              CbteFch:     fechaStr,
              ImpTotal:    Number(original.total),
              ImpTotConc:  0,
              ImpNeto:     Number(original.impNeto),
              ImpOpEx:     0,
              ImpIVA:      Number(original.impIVA),
              ImpTrib:     0,
              MonId:       'PES',
              MonCotiz:    1,
              Iva: [{
                Id:      ivaAlicIdNC,  // misma alícuota que en emisión (p. ej. 4=10,5%)
                BaseImp: Number(original.impNeto),
                Importe: Number(original.impIVA)
              }],
              CbtesAsoc: cbteAsoc
            }]
          }
        }
      },
      cert: creds.cert,
      key:  creds.key
    };

    // ── Llamar al WS ─────────────────────────────────────────────────────────
    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };
    var respuesta = afipFetchConRetry('/requests', payload, headers);
    Logger.log('[emitirNotaCredito] Respuesta ARCA: ' + JSON.stringify(respuesta).substring(0, 500));

    var detResp = ((respuesta.FeCAESolicitarResult || respuesta).FeDetResp || {}).FECAEDetResponse;
    if (!detResp) return { success: false, error: 'Respuesta vacía de ARCA.' };

    var det = Array.isArray(detResp) ? detResp[0] : detResp;

    if (det.Resultado !== 'A') {
      var obs = [];
      if (det.Obs && det.Obs.Ob) {
        obs = (Array.isArray(det.Obs.Ob) ? det.Obs.Ob : [det.Obs.Ob])
              .map(function(o) { return '(' + o.Code + ') ' + o.Msg; });
      }
      return { success: false, error: 'ARCA rechazó la NC. ' + obs.join(' | ') };
    }

    var caeNC    = String(det.CAE || '');
    var caeVtoNC = String(det.CAEFchVto || '');
    var tipoNombreNC = (ncTipo === 3) ? 'NOTA CREDITO A' : 'NOTA CREDITO B';
    var fechaHoy = _hfFormatearFecha(hoy);

    // ── Guardar NC en FacturasARCA ────────────────────────────────────────────
    var resultGuardar = guardarComprobanteARCA({
      cbteTipo:        ncTipo,
      cbteTipoNombre:  tipoNombreNC,
      cbteNro:         nroNC,
      ptoVta:          Number(original.ptoVta),
      clienteNombre:   original.clienteNombre,
      clienteCuit:     original.clienteCuit,
      condicionVenta:  original.condicionVenta,
      impNeto:         Number(original.impNeto),
      impIVA:          Number(original.impIVA),
      total:           Number(original.total),
      cae:             caeNC,
      caeVto:          caeVtoNC,
      cbteAsocTipo:    Number(original.cbteTipo),
      cbteAsocNro:     Number(original.cbteNro),
      fecha:           fechaHoy,
      estado:          'EMITIDA',
      usuario:         Session.getActiveUser().getEmail() || ''
    });

    if (!resultGuardar.success) {
      // La NC se emitió en ARCA pero no se pudo guardar en Sheets — reportarlo
      Logger.log('[emitirNotaCredito] NC emitida en ARCA pero error al guardar: ' + resultGuardar.error);
      return {
        success: true,
        advertencia: 'NC emitida en ARCA (CAE: ' + caeNC + ') pero no se pudo guardar en Sheets: ' + resultGuardar.error,
        nc: { cae: caeNC, caeVto: caeVtoNC, nroNC: nroNC, tipo: tipoNombreNC }
      };
    }

    return {
      success: true,
      mensaje: tipoNombreNC + ' N° ' + String(Number(original.ptoVta)).padStart(5,'0') + '-' + String(nroNC).padStart(8,'0') + ' emitida correctamente.',
      nc: {
        id:      resultGuardar.id,
        cae:     caeNC,
        caeVto:  caeVtoNC,
        nroNC:   nroNC,
        tipo:    tipoNombreNC
      }
    };

  } catch (e) {
    Logger.log('[emitirNotaCredito] Error: ' + e.message + ' | Stack: ' + e.stack);
    return { success: false, error: afipFormatearErrorUsuario(e) };
  }
}

/**
 * Obtiene el último comprobante autorizado para un tipo y punto de venta.
 * Función auxiliar para emitirNotaCredito.
 */
function afipUltimoComprobante(cbteTipo, ptoVta) {
  try {
    var config = afipVerificarConfiguracion();
    if (!config.configurado || !config.tieneCertificado) return 0;

    var auth  = afipGetAuth(AFIP_CONFIG.WS.FE);
    var creds = afipGetCredentials();
    var headers = {
      'Authorization': 'Bearer ' + creds.accessToken,
      'Content-Type':  'application/json'
    };

    var payload = {
      environment: AFIP_CONFIG.ENVIRONMENT,
      method:      'FECompUltimoAutorizado',
      wsid:        AFIP_CONFIG.WS.FE,
      params: {
        Auth: { Token: auth.token, Sign: auth.sign, Cuit: auth.cuit },
        PtoVta: ptoVta,
        CbteTipo: cbteTipo
      },
      cert: creds.cert,
      key:  creds.key
    };

    var res = afipFetchConRetry('/requests', payload, headers);
    if (res && res.FECompUltimoAutorizadoResult) {
      return Number(res.FECompUltimoAutorizadoResult.CbteNro) || 0;
    }
    return 0;
  } catch (e) {
    Logger.log('[afipUltimoComprobante] Error: ' + e.message);
    return 0;
  }
}

/**
 * Devuelve todo lo necesario para imprimir una factura:
 * configuración del emisor (desde hoja Configuracion o PropertiesService)
 * + datos completos de la factura solicitada.
 *
 * @param {string} facturaId - UUID de la factura
 */
function obtenerDatosParaImpresion(facturaId) {
  try {
    // ── 1. Leer configuración del emisor ─────────────────────────────────────
    var cfg = _leerConfiguracionEmisor();

    // ── 2. Buscar la factura ─────────────────────────────────────────────────
    var historial = obtenerHistorialFacturas();
    if (!historial.success) return { success: false, error: historial.error };

    var factura = null;
    for (var i = 0; i < historial.facturas.length; i++) {
      if (String(historial.facturas[i].id) === String(facturaId)) {
        factura = historial.facturas[i]; break;
      }
    }
    if (!factura) return { success: false, error: 'Factura no encontrada: ' + facturaId };

    // ── 3. Completar receptor con padrón ARCA solo si falta algo en hoja (evita llamadas innecesarias) ──
    try {
      var cuitL = String(factura.clienteCuit || '').replace(/[^0-9]/g, '');
      if (cuitL.length === 11) {
        var faltaRs = !String(factura.clienteRazonSocial || '').trim();
        var faltaCond = !String(factura.clienteCondicionTexto || '').trim();
        var faltaDom = !String(factura.clienteDomicilioFiscal || '').trim();
        if (faltaRs || faltaCond || faltaDom) {
          var pad = afipConsultarCUITWrapper(cuitL);
          if (pad && pad.encontrado) {
            if (faltaRs && pad.razonSocial) factura.clienteRazonSocial = pad.razonSocial;
            if (faltaCond && pad.condicionTexto) factura.clienteCondicionTexto = pad.condicionTexto;
            if (faltaDom && pad.domicilio) factura.clienteDomicilioFiscal = pad.domicilio;
          }
        }
      }
    } catch (ePad) {
      Logger.log('[obtenerDatosParaImpresion] Padron: ' + ePad.message);
    }

    factura.clienteCuitDni = _hfCompletarDocumentoReceptor(factura);

    return { success: true, config: cfg, factura: factura };

  } catch (e) {
    Logger.log('[obtenerDatosParaImpresion] ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Lee configuración del emisor desde PropertiesService
 */
function _leerConfiguracionEmisor() {
  var props = {};
  try {
    props = PropertiesService.getScriptProperties().getProperties();
  } catch(e) {
    Logger.log('[_leerConfiguracionEmisor] Error leyendo PropertiesService: ' + e.message);
  }

  function p(clave, defecto) {
    return String(props[clave] || defecto || '').trim();
  }

  function formatearCuit(v) {
    var n = String(v).replace(/[^0-9]/g,'');
    return n.length === 11
      ? n.substring(0,2) + '-' + n.substring(2,10) + '-' + n.substring(10)
      : v;
  }

  function formatearFecha(v) {
    if (!v) return '';
    // Convierte "2012-08-01" → "01/08/2012"
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p2 = v.split('-');
      return p2[2] + '/' + p2[1] + '/' + p2[0];
    }
    return v;
  }

  var ivaP = parseFloat(p('IVA_PORCENTAJE', '10.5'));
  if (isNaN(ivaP)) ivaP = 10.5;
  var ivaAlic = parseInt(p('IVA_ALICUOTA_ID', '4'), 10);
  if (isNaN(ivaAlic)) ivaAlic = 4;

  return {
    razonSocial:       p('EMISOR_RAZON_SOCIAL'),
    cuit:              formatearCuit(p('EMISOR_CUIT', p('AFIP_CUIT'))),
    domicilio:         p('EMISOR_DOMICILIO'),
    localidad:         '',   // incluido dentro de EMISOR_DOMICILIO
    provincia:         '',
    condicionIVA:      p('EMISOR_CONDICION_IVA', 'RESPONSABLE INSCRIPTO'),
    ingBrutos:         p('EMISOR_IIBB'),
    inicioActividades: formatearFecha(p('EMISOR_FECHA_INICIO')),
    logoUrl:           p('LOGO_URL'),
    ptoVta:            p('AFIP_PUNTO_VENTA', '1'),
    telefono:          p('EMISOR_TELEFONO'),
    email:             p('EMISOR_EMAIL'),
    web:               p('EMISOR_WEB'),
    ivaPorcentaje:     ivaP,
    ivaAlicuotaId:     ivaAlic
  };
}

/**
 * Muestra CUIT con guiones o DNI con separadores según largo (datos de hoja / clientes).
 */
function _hfFormatearCuitDniStr(raw) {
  if (raw == null) return '';
  var s = String(raw).trim();
  if (!s) return '';
  var d = s.replace(/[^0-9]/g, '');
  if (d.length === 11) {
    return d.substring(0, 2) + '-' + d.substring(2, 10) + '-' + d.substring(10, 11);
  }
  if (d.length === 7) {
    return 'DNI ' + d.charAt(0) + '.' + d.substring(1, 4) + '.' + d.substring(4, 7);
  }
  if (d.length === 8) {
    return 'DNI ' + d.substring(0, 2) + '.' + d.substring(2, 5) + '.' + d.substring(5, 8);
  }
  if (d.length > 0) return s;
  return '';
}

/**
 * CUIT/DNI en comprobante: factura, si falta dato hoja, clientes por nombre.
 */
function _hfCompletarDocumentoReceptor(factura) {
  var doc = _hfFormatearCuitDniStr(factura.clienteCuit);
  if (doc) return doc;
  var nom = String(factura.clienteNombre || factura.cliente || '').trim();
  if (!nom) return '-';
  try {
    var cl = ClientesRepository.buscarPorNombre(nom);
    if (cl && cl.cuit) {
      var d2 = _hfFormatearCuitDniStr(cl.cuit);
      if (d2) return d2;
    }
  } catch (e0) {
    Logger.log('[_hfCompletarDocumentoReceptor] ' + e0.message);
  }
  return '-';
}

/**
 * Descuenta stock de la hoja Productos al emitir una Factura A.
 * Solo aplica a FA (cbteTipo === 1) porque son las ventas al por mayor
 * con detalle de ítems provenientes de una transferencia.
 *
 * La hoja Productos debe tener columnas:
 *   CODIGO | NOMBRE | STOCK | PRECIO | [otras...]
 *
 * @param {Array} items - Array de { codigo, cantidad, descripcion }
 * @returns {{ success, descontados, errores }}
 */
function descontarStockPorFactura(items) {
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: true, descontados: [], errores: ['Sin ítems para descontar'] };
    }

    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var hoja    = ss.getSheetByName('Productos');
    if (!hoja) return { success: false, errores: ['No existe la hoja Productos'] };

    var datos   = hoja.getDataRange().getValues();
    if (datos.length <= 1) return { success: true, descontados: [], errores: ['Hoja Productos vacía'] };

    // Detectar columnas por nombre
    var cabecera = datos[0].map(function(c) { return String(c).toUpperCase().trim(); });
    var colCodigo = -1, colNombre = -1, colStock = -1;

    cabecera.forEach(function(c, i) {
      if (['CODIGO','COD','SKU','ID','REF'].indexOf(c) > -1 && colCodigo === -1) colCodigo = i;
      if (['NOMBRE','DESCRIPCION','PRODUCTO','NAME'].indexOf(c) > -1 && colNombre === -1) colNombre = i;
      if (['STOCK','CANTIDAD','QTY','EXISTENCIA','DISPONIBLE'].indexOf(c) > -1 && colStock === -1) colStock = i;
    });

    if (colStock === -1) {
      return { success: false, errores: ['No se encontró columna STOCK en la hoja Productos'] };
    }

    var descontados = [];
    var errores     = [];

    items.forEach(function(item) {
      var busqueda = String(item.codigo || item.descripcion || '').toLowerCase().trim();
      if (!busqueda) return;

      var cantidad = Number(item.cantidad) || 1;
      var encontrado = false;

      for (var r = 1; r < datos.length; r++) {
        var filaCodigo  = colCodigo > -1 ? String(datos[r][colCodigo] || '').toLowerCase().trim() : '';
        var filaNombre  = colNombre > -1 ? String(datos[r][colNombre] || '').toLowerCase().trim() : '';
        var stockActual = Number(datos[r][colStock]) || 0;

        // Coincidencia por código exacto o nombre parcial
        var coincide = (colCodigo > -1 && filaCodigo === busqueda) ||
                       (colNombre > -1 && filaNombre.includes(busqueda)) ||
                       (colNombre > -1 && busqueda.includes(filaNombre) && filaNombre.length > 3);

        if (coincide) {
          encontrado = true;
          var nuevoStock = stockActual - cantidad;

          if (nuevoStock < 0) {
            errores.push('Stock insuficiente para "' + (datos[r][colNombre] || busqueda) +
                         '" — stock: ' + stockActual + ', pedido: ' + cantidad);
            // Se descuenta igual pero se registra la advertencia
          }

          // Actualizar la celda de stock (fila r+1 porque Sheets es 1-indexed)
          hoja.getRange(r + 1, colStock + 1).setValue(nuevoStock);

          descontados.push({
            nombre:    datos[r][colNombre] || busqueda,
            codigo:    colCodigo > -1 ? datos[r][colCodigo] : '',
            anterior:  stockActual,
            descontado: cantidad,
            nuevo:     nuevoStock
          });

          Logger.log('[STOCK] "' + (datos[r][colNombre] || busqueda) + '": ' + stockActual + ' → ' + nuevoStock);
          break; // Solo descuenta el primer match
        }
      }

      if (!encontrado) {
        errores.push('Producto no encontrado en stock: "' + busqueda + '"');
        Logger.log('[STOCK] No encontrado: ' + busqueda);
      }
    });

    return { success: true, descontados: descontados, errores: errores };

  } catch(e) {
    Logger.log('[descontarStockPorFactura] Error: ' + e.message);
    return { success: false, errores: [e.message] };
  }
}
