/**
 * ============================================================================
 * FACTURACION ELECTRONICA ARCA - SISTEMA SOL & VERDE
 * ============================================================================
 * Integración con ARCA (ex-AFIP) via Afip SDK REST API
 * Emisor: DOMINGUES ALDO FERMIN - CUIT 20-14954340-7
 * Condición: Responsable Inscripto
 * Alícuota IVA: 10.5%
 * Comprobantes: Factura A, Factura B, NC A, NC B
 * ============================================================================
 *
 * CONFIGURACION INICIAL:
 * 1. Registrarse en https://app.afipsdk.com y obtener Access Token
 * 2. Ir a Configuración del sistema > sección "Facturación Electrónica ARCA"
 * 3. Pegar el Access Token, configurar CUIT y Punto de Venta
 * 4. Probar conexión en modo desarrollo (dev)
 *    → Sin certificado: usa CUIT de test (20409378472) - solo para probar
 *    → Con certificado: usa tu CUIT real
 * 5. Generar certificado: ingresar CUIT y clave fiscal de ARCA
 *    → El sistema genera el certificado automáticamente via Afip SDK
 *    → El certificado se guarda en ScriptProperties
 * 6. Una vez verificado con certificado propio, cambiar a modo producción (prod)
 *    → Repetir generación de certificado en modo prod
 *
 * TIPOS DE COMPROBANTE (CbteTipo):
 *   1  = Factura A           (para clientes RI)
 *   6  = Factura B           (para clientes CF / Monotributo / Exento)
 *   3  = Nota de Crédito A   (anula/corrige Factura A)
 *   8  = Nota de Crédito B   (anula/corrige Factura B)
 *
 * ALICUOTAS IVA (Id):
 *   3  = 0%
 *   4  = 10.5%   ← LA QUE USA SOL & VERDE
 *   5  = 21%
 *   6  = 27%
 * ============================================================================
 */

// ============================================================================
// CONFIGURACION AFIP
// ============================================================================

const CONFIG_AFIP = {
  // URL base de Afip SDK REST API
  API_URL: 'https://app.afipsdk.com/api/v1/afip',

  // Datos del emisor (fijos)
  EMISOR: {
    CUIT: '20149543407',
    RAZON_SOCIAL: 'DOMINGUES ALDO FERMIN',
    CONDICION_IVA: 'Responsable Inscripto'
  },

  // IVA por defecto: 10.5%
  IVA: {
    ALICUOTA_ID: 4,        // Id 4 = 10.5% en tabla ARCA
    PORCENTAJE: 10.5,
    MULTIPLICADOR: 0.105
  },

  // Tipos de comprobante
  CBTE_TIPOS: {
    FACTURA_A: 1,
    NOTA_CREDITO_A: 3,
    FACTURA_B: 6,
    NOTA_CREDITO_B: 8
  },

  // Tipos de documento del receptor
  DOC_TIPOS: {
    CUIT: 80,
    DNI: 96,
    CONSUMIDOR_FINAL: 99    // Sin identificar
  },

  // Concepto: 1=Productos
  CONCEPTO: 1,

  // Moneda
  MONEDA: {
    ID: 'PES',
    COTIZACION: 1
  },

  // Hoja de registro
  HOJA_FACTURAS: 'FACTURAS_EMITIDAS',
  COLS_FACTURAS: {
    ID: 0,              // A: autoincremental
    FECHA: 1,           // B: fecha emisión
    CBTE_TIPO: 2,       // C: tipo comprobante (1,3,6,8)
    CBTE_TIPO_NOMBRE: 3,// D: nombre legible
    CBTE_NRO: 4,        // E: número asignado por ARCA
    PTO_VTA: 5,         // F: punto de venta
    CLIENTE_NOMBRE: 6,  // G: razón social
    CLIENTE_CUIT: 7,    // H: CUIT/DNI
    CLIENTE_CONDICION: 8,// I: RI/CF/M
    NETO: 9,            // J: importe neto gravado
    IVA: 10,            // K: importe IVA
    TOTAL: 11,          // L: importe total
    CAE: 12,            // M: código CAE
    CAE_VTO: 13,        // N: vencimiento CAE
    CBTE_ASOC_TIPO: 14, // O: tipo cbte asociado (para NC)
    CBTE_ASOC_NRO: 15,  // P: nro cbte asociado (para NC)
    ESTADO: 16,         // Q: EMITIDA / ERROR / ANULADA
    PDF_URL: 17,        // R: URL del PDF generado
    DETALLE: 18,        // S: JSON con detalle de productos
    USUARIO: 19         // T: email del usuario
  }
};

// ============================================================================
// SERVICIO AFIP SDK
// ============================================================================

const AfipService = {
  /**
   * Obtiene las credenciales de Afip SDK desde ScriptProperties
   * @returns {Object} {accessToken, environment, puntoVenta}
   */
  getConfig: function() {
    const props = PropertiesService.getScriptProperties();
    return {
      accessToken: props.getProperty('AFIP_ACCESS_TOKEN') || '',
      environment: props.getProperty('AFIP_ENVIRONMENT') || 'dev',
      puntoVenta: parseInt(props.getProperty('AFIP_PUNTO_VENTA') || '11'),
      cuit: props.getProperty('AFIP_CUIT') || CONFIG_AFIP.EMISOR.CUIT,
      cert: props.getProperty('AFIP_CERT') || '',
      key: props.getProperty('AFIP_KEY') || ''
    };
  },

  /**
   * Guarda la configuración de Afip SDK
   */
  setConfig: function(config) {
    const props = PropertiesService.getScriptProperties();
    if (config.accessToken !== undefined) props.setProperty('AFIP_ACCESS_TOKEN', config.accessToken);
    if (config.environment !== undefined) props.setProperty('AFIP_ENVIRONMENT', config.environment);
    if (config.puntoVenta !== undefined) props.setProperty('AFIP_PUNTO_VENTA', String(config.puntoVenta));
    if (config.cuit !== undefined) props.setProperty('AFIP_CUIT', config.cuit);
    if (config.cert !== undefined) props.setProperty('AFIP_CERT', config.cert);
    if (config.key !== undefined) props.setProperty('AFIP_KEY', config.key);
  },

  /**
   * Verifica si está configurado
   */
  estaConfigurado: function() {
    const config = this.getConfig();
    return config.accessToken && config.accessToken.length > 10;
  },

  /**
   * Verifica si tiene certificado configurado
   */
  tieneCertificado: function() {
    const config = this.getConfig();
    return config.cert && config.cert.length > 50 && config.key && config.key.length > 50;
  },

  // --------------------------------------------------------------------------
  // LLAMADAS A LA API
  // --------------------------------------------------------------------------

  /**
   * Realiza una llamada HTTP a Afip SDK
   * @param {string} endpoint - Ruta relativa (ej: '/auth', '/requests')
   * @param {Object} payload - Cuerpo del request (null para GET)
   * @param {string} method - 'post' o 'get' (default: 'post')
   * @returns {Object} Respuesta parseada
   */
  _fetch: function(endpoint, payload, method) {
    const config = this.getConfig();

    if (!config.accessToken) {
      throw new Error('Access Token de Afip SDK no configurado. Ve a Configuración > Facturación ARCA.');
    }

    // URL base: para /automations usamos la raíz, para el resto usamos /afip
    var url;
    if (endpoint.indexOf('/automations') === 0) {
      url = 'https://app.afipsdk.com/api/v1' + endpoint;
    } else {
      url = CONFIG_AFIP.API_URL + endpoint;
    }

    var httpMethod = method || 'post';

    const options = {
      method: httpMethod,
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + config.accessToken
      },
      muteHttpExceptions: true
    };

    if (payload && httpMethod === 'post') {
      options.payload = JSON.stringify(payload);
    }

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    if (code === 401 || code === 403) {
      throw new Error('Access Token inválido o expirado. Verificá tu token en app.afipsdk.com');
    }

    if (code !== 200) {
      let errorMsg = 'Error ' + code;
      try {
        const errorData = JSON.parse(text);
        errorMsg += ': ' + (errorData.message || errorData.error || JSON.stringify(errorData.data_errors) || text.substring(0, 300));
      } catch (e) {
        errorMsg += ': ' + text.substring(0, 300);
      }
      throw new Error(errorMsg);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Respuesta inválida de Afip SDK: ' + text.substring(0, 200));
    }
  },

  /**
   * Paso 1: Obtener Token y Sign de autenticación ARCA
   *
   * IMPORTANTE: Afip SDK requiere certificado y clave privada para autenticarse.
   * - En modo DEV con CUIT de test (20409378472): NO necesita cert/key
   * - En modo DEV o PROD con CUIT propio: NECESITA cert/key
   *
   * Para generar el certificado, usar generarCertificadoAfip() desde Configuración.
   *
   * @param {string} wsid - Web Service ID ('wsfe' para facturación, 'ws_sr_padron_a5' para padrón)
   * @returns {Object} {token, sign}
   */
  autenticar: function(wsid) {
    const config = this.getConfig();
    var ws = wsid || 'wsfe';

    // CUIT de test de Afip SDK (no requiere certificado en dev)
    var CUIT_TEST = '20409378472';

    // Determinar qué CUIT usar para auth
    var cuitAuth = config.cuit;

    // Si es modo dev y no tiene certificado, usar CUIT de test
    if (config.environment === 'dev' && !this.tieneCertificado()) {
      cuitAuth = CUIT_TEST;
      Logger.log('Modo dev sin certificado: usando CUIT de test ' + CUIT_TEST);
    }

    // Si es modo prod o dev con CUIT propio, verificar certificado
    if (cuitAuth !== CUIT_TEST && !this.tieneCertificado()) {
      throw new Error(
        'Se requiere certificado para usar CUIT propio. ' +
        'Ve a Configuración > Facturación ARCA > "Generar Certificado" para crear uno. ' +
        'O si estás en modo desarrollo, podés probar sin certificado (usará CUIT de test).'
      );
    }

    const payload = {
      environment: config.environment,
      tax_id: cuitAuth,
      wsid: ws
    };

    // Agregar cert y key si están disponibles
    if (config.cert && config.key) {
      payload.cert = config.cert;
      payload.key = config.key;
    }

    const result = this._fetch('/auth', payload);

    if (!result.token || !result.sign) {
      throw new Error('Error de autenticación ARCA: no se recibieron token/sign. Verificá tu CUIT y certificado en Afip SDK.');
    }

    return {
      token: result.token,
      sign: result.sign,
      cuitAuth: cuitAuth  // Devolver el CUIT usado para auth
    };
  },

  /**
   * Paso 2: Consultar último comprobante autorizado
   * @param {number} cbteTipo - Tipo de comprobante (1=FA, 6=FB, 3=NCA, 8=NCB)
   * @returns {number} Último número de comprobante
   */
  ultimoComprobante: function(cbteTipo) {
    const config = this.getConfig();
    const auth = this.autenticar('wsfe');

    const payload = {
      environment: config.environment,
      method: 'FECompUltimoAutorizado',
      wsid: 'wsfe',
      params: {
        Auth: {
          Token: auth.token,
          Sign: auth.sign,
          Cuit: auth.cuitAuth
        },
        PtoVta: config.puntoVenta,
        CbteTipo: cbteTipo
      }
    };

    // Incluir cert y key si están disponibles
    if (config.cert) payload.cert = config.cert;
    if (config.key) payload.key = config.key;

    const result = this._fetch('/requests', payload);

    // La respuesta de ARCA viene en FECompUltimoAutorizadoResult
    const data = result.FECompUltimoAutorizadoResult || result;

    if (data.Errors) {
      const errMsg = data.Errors.Err ? data.Errors.Err.map(function(e) { return '(' + e.Code + ') ' + e.Msg; }).join(', ') : 'Error desconocido';
      throw new Error('Error ARCA: ' + errMsg);
    }

    return data.CbteNro || 0;
  },

  /**
   * Paso 3: Emitir comprobante electrónico
   * @param {Object} datosFactura - Datos completos de la factura
   * @returns {Object} {cae, caeVto, cbtNro, resultado}
   */
  emitirComprobante: function(datosFactura) {
    const config = this.getConfig();
    const auth = this.autenticar('wsfe');

    // Obtener próximo número
    const ultimoNro = this.ultimoComprobante(datosFactura.cbteTipo);
    const proximoNro = ultimoNro + 1;

    // Fecha en formato YYYYMMDD
    const hoy = new Date();
    const fechaCbte = String(hoy.getFullYear()) +
      String(hoy.getMonth() + 1).padStart(2, '0') +
      String(hoy.getDate()).padStart(2, '0');

    // Calcular importes
    const neto = datosFactura.importeNeto;
    const iva = Math.round(neto * CONFIG_AFIP.IVA.MULTIPLICADOR * 100) / 100;
    const total = Math.round((neto + iva) * 100) / 100;

    // Determinar DocTipo según tipo de comprobante
    let docTipo = CONFIG_AFIP.DOC_TIPOS.CONSUMIDOR_FINAL;
    let docNro = 0;

    if (datosFactura.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.FACTURA_A ||
        datosFactura.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_A) {
      // Factura A: requiere CUIT del receptor
      docTipo = CONFIG_AFIP.DOC_TIPOS.CUIT;
      docNro = datosFactura.clienteCuit;
      if (!docNro) {
        throw new Error('Factura A requiere CUIT del cliente. El cliente seleccionado no tiene CUIT cargado.');
      }
    } else {
      // Factura B: CF sin identificar o con DNI/CUIT
      if (datosFactura.clienteCuit) {
        docTipo = CONFIG_AFIP.DOC_TIPOS.CUIT;
        docNro = datosFactura.clienteCuit;
      }
    }

    // Construir detalle de IVA
    var ivaArray = [{
      Id: CONFIG_AFIP.IVA.ALICUOTA_ID,
      BaseImp: neto,
      Importe: iva
    }];

    // Construir request FECAESolicitar
    var feDetRequest = {
      Concepto: CONFIG_AFIP.CONCEPTO,
      DocTipo: docTipo,
      DocNro: docNro,
      CbteDesde: proximoNro,
      CbteHasta: proximoNro,
      CbteFch: fechaCbte,
      ImpTotal: total,
      ImpTotConc: 0,          // No gravado
      ImpNeto: neto,
      ImpOpEx: 0,             // Exento
      ImpIVA: iva,
      ImpTrib: 0,             // Tributos
      MonId: CONFIG_AFIP.MONEDA.ID,
      MonCotiz: CONFIG_AFIP.MONEDA.COTIZACION,
      Iva: {
        AlicIva: ivaArray
      }
    };

    // Si es Nota de Crédito, agregar comprobante asociado
    if (datosFactura.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_A ||
        datosFactura.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_B) {
      if (!datosFactura.cbteAsocTipo || !datosFactura.cbteAsocNro) {
        throw new Error('Nota de Crédito requiere factura asociada (tipo y número).');
      }
      feDetRequest.CbtesAsoc = {
        CbteAsoc: [{
          Tipo: datosFactura.cbteAsocTipo,
          PtoVta: config.puntoVenta,
          Nro: datosFactura.cbteAsocNro,
          Cuit: config.cuit,
          CbteFch: datosFactura.cbteAsocFecha || fechaCbte
        }]
      };
    }

    const payload = {
      environment: config.environment,
      method: 'FECAESolicitar',
      wsid: 'wsfe',
      params: {
        Auth: {
          Token: auth.token,
          Sign: auth.sign,
          Cuit: auth.cuitAuth
        },
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: config.puntoVenta,
            CbteTipo: datosFactura.cbteTipo
          },
          FeDetReq: {
            FECAEDetRequest: feDetRequest
          }
        }
      }
    };

    // Incluir cert y key si están disponibles
    if (config.cert) payload.cert = config.cert;
    if (config.key) payload.key = config.key;

    const result = this._fetch('/requests', payload);

    // Parsear respuesta
    const feResp = result.FECAESolicitarResult || result;

    if (feResp.Errors) {
      const errMsg = feResp.Errors.Err ? feResp.Errors.Err.map(function(e) { return '(' + e.Code + ') ' + e.Msg; }).join(', ') : 'Error desconocido';
      throw new Error('Error ARCA al emitir: ' + errMsg);
    }

    // Obtener detalle de respuesta
    const detResp = feResp.FeDetResp && feResp.FeDetResp.FECAEDetResponse
      ? (Array.isArray(feResp.FeDetResp.FECAEDetResponse) ? feResp.FeDetResp.FECAEDetResponse[0] : feResp.FeDetResp.FECAEDetResponse)
      : null;

    if (!detResp) {
      throw new Error('Respuesta de ARCA sin detalle. Verificá en ARCA si el comprobante fue emitido.');
    }

    if (detResp.Resultado !== 'A') {
      // Comprobante rechazado
      const obsMsg = detResp.Observaciones && detResp.Observaciones.Obs
        ? detResp.Observaciones.Obs.map(function(o) { return '(' + o.Code + ') ' + o.Msg; }).join(', ')
        : 'Sin observaciones';
      throw new Error('Comprobante rechazado por ARCA: ' + obsMsg);
    }

    return {
      cae: detResp.CAE,
      caeVto: detResp.CAEFchVto,
      cbteNro: proximoNro,
      ptoVta: config.puntoVenta,
      cbteTipo: datosFactura.cbteTipo,
      fecha: fechaCbte,
      neto: neto,
      iva: iva,
      total: total,
      resultado: 'A'
    };
  },

  /**
   * Consulta datos de un CUIT en el padrón de ARCA
   * @param {string} cuit - CUIT a consultar (sin guiones)
   * @returns {Object} Datos del contribuyente
   */
  consultarCUIT: function(cuit) {
    const config = this.getConfig();

    // Limpiar CUIT (quitar guiones)
    const cuitLimpio = String(cuit).replace(/[-\s]/g, '');

    if (!/^\d{11}$/.test(cuitLimpio)) {
      throw new Error('CUIT inválido: debe tener 11 dígitos. Recibido: ' + cuit);
    }

    const auth = this.autenticar('ws_sr_padron_a5');

    const payload = {
      environment: config.environment,
      method: 'getPersona',
      wsid: 'ws_sr_padron_a5',
      params: {
        token: auth.token,
        sign: auth.sign,
        cuitRepresentada: auth.cuitAuth,
        idPersona: cuitLimpio
      }
    };

    // Incluir cert y key si están disponibles
    if (config.cert) payload.cert = config.cert;
    if (config.key) payload.key = config.key;

    try {
      const result = this._fetch('/requests', payload);
      const persona = result.personaReturn || result.persona || result;

      if (!persona) {
        return { encontrado: false, error: 'CUIT no encontrado en padrón ARCA' };
      }

      // Determinar condición IVA
      var condicionIVA = 'CF'; // Default: Consumidor Final
      var condicionTexto = 'Consumidor Final';

      // Buscar en datosGenerales o en la estructura de impuestos
      var impuestos = persona.datosRegimenGeneral && persona.datosRegimenGeneral.impuesto
        ? persona.datosRegimenGeneral.impuesto
        : (persona.impuestos || []);

      // Si es array, buscar IVA (código 30 o 32)
      if (Array.isArray(impuestos)) {
        for (var i = 0; i < impuestos.length; i++) {
          var imp = impuestos[i];
          var idImp = imp.idImpuesto || imp.id;
          if (idImp === 30 || idImp === 32) {
            condicionIVA = 'RI';
            condicionTexto = 'Responsable Inscripto';
            break;
          }
          if (idImp === 20) {
            condicionIVA = 'M';
            condicionTexto = 'Monotributo';
            break;
          }
        }
      }

      // Buscar en categorías/actividades
      var categorias = persona.datosMonotributo || persona.categorias || null;
      if (categorias && condicionIVA === 'CF') {
        condicionIVA = 'M';
        condicionTexto = 'Monotributo';
      }

      var razonSocial = persona.datosGenerales
        ? (persona.datosGenerales.razonSocial ||
           ((persona.datosGenerales.apellido || '') + ' ' + (persona.datosGenerales.nombre || '')).trim())
        : (persona.razonSocial || persona.nombre || '');

      var domicilio = '';
      if (persona.datosGenerales && persona.datosGenerales.domicilioFiscal) {
        var dom = persona.datosGenerales.domicilioFiscal;
        domicilio = (dom.direccion || '') + ', ' + (dom.localidad || '') + ', ' + (dom.descripcionProvincia || '');
      }

      return {
        encontrado: true,
        cuit: cuitLimpio,
        razonSocial: razonSocial.toUpperCase(),
        condicionIVA: condicionIVA,
        condicionTexto: condicionTexto,
        domicilio: domicilio,
        tipoPersona: persona.datosGenerales ? persona.datosGenerales.tipoPersona : ''
      };
    } catch (error) {
      // Si falla la consulta de padrón, no es un error crítico
      Logger.log('Error consultando CUIT ' + cuit + ': ' + error.message);
      return {
        encontrado: false,
        error: 'No se pudo consultar: ' + error.message
      };
    }
  }
};

// ============================================================================
// REPOSITORIO DE FACTURAS EMITIDAS
// ============================================================================

const FacturasRepository = {
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG_AFIP.HOJA_FACTURAS);

    if (!hoja) {
      hoja = ss.insertSheet(CONFIG_AFIP.HOJA_FACTURAS);
      hoja.appendRow([
        'ID', 'FECHA', 'CBTE_TIPO', 'CBTE_TIPO_NOMBRE', 'CBTE_NRO', 'PTO_VTA',
        'CLIENTE', 'CUIT', 'CONDICION', 'NETO', 'IVA', 'TOTAL',
        'CAE', 'CAE_VTO', 'CBTE_ASOC_TIPO', 'CBTE_ASOC_NRO',
        'ESTADO', 'PDF_URL', 'DETALLE', 'USUARIO'
      ]);
      hoja.getRange(1, 1, 1, 20).setFontWeight('bold').setBackground('#1565C0').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }

    return hoja;
  },

  getSiguienteId: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;
    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(function(id) { return id; });
    return ids.length > 0 ? Math.max.apply(null, ids) + 1 : 1;
  },

  /**
   * Registra una factura emitida
   */
  registrar: function(datos) {
    const hoja = this.getHoja();
    const id = this.getSiguienteId();
    const usuario = Session.getActiveUser().getEmail();

    // Nombre legible del tipo de comprobante
    var nombreTipo = '';
    switch (datos.cbteTipo) {
      case 1: nombreTipo = 'FACTURA A'; break;
      case 3: nombreTipo = 'NOTA DE CREDITO A'; break;
      case 6: nombreTipo = 'FACTURA B'; break;
      case 8: nombreTipo = 'NOTA DE CREDITO B'; break;
      default: nombreTipo = 'COMPROBANTE ' + datos.cbteTipo;
    }

    const nuevaFila = [
      id,
      new Date(),
      datos.cbteTipo,
      nombreTipo,
      datos.cbteNro,
      datos.ptoVta,
      datos.clienteNombre || '',
      datos.clienteCuit || '',
      datos.clienteCondicion || 'CF',
      datos.neto,
      datos.iva,
      datos.total,
      datos.cae || '',
      datos.caeVto || '',
      datos.cbteAsocTipo || '',
      datos.cbteAsocNro || '',
      datos.estado || 'EMITIDA',
      datos.pdfUrl || '',
      datos.detalle ? JSON.stringify(datos.detalle) : '',
      usuario
    ];

    hoja.appendRow(nuevaFila);
    return id;
  },

  /**
   * Obtiene facturas emitidas (últimas N)
   */
  obtenerTodas: function(limite) {
    var lim = limite || 100;
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    const numRows = Math.min(lim, lastRow - 1);
    const datos = hoja.getRange(2, 1, numRows, 20).getValues();

    return datos.map(function(fila) {
      return {
        id: fila[CONFIG_AFIP.COLS_FACTURAS.ID],
        fecha: fila[CONFIG_AFIP.COLS_FACTURAS.FECHA] instanceof Date
          ? formatearFechaLocal(fila[CONFIG_AFIP.COLS_FACTURAS.FECHA]) : String(fila[CONFIG_AFIP.COLS_FACTURAS.FECHA]),
        cbteTipo: fila[CONFIG_AFIP.COLS_FACTURAS.CBTE_TIPO],
        cbteTipoNombre: fila[CONFIG_AFIP.COLS_FACTURAS.CBTE_TIPO_NOMBRE],
        cbteNro: fila[CONFIG_AFIP.COLS_FACTURAS.CBTE_NRO],
        ptoVta: fila[CONFIG_AFIP.COLS_FACTURAS.PTO_VTA],
        clienteNombre: fila[CONFIG_AFIP.COLS_FACTURAS.CLIENTE_NOMBRE],
        clienteCuit: fila[CONFIG_AFIP.COLS_FACTURAS.CLIENTE_CUIT],
        clienteCondicion: fila[CONFIG_AFIP.COLS_FACTURAS.CLIENTE_CONDICION],
        neto: fila[CONFIG_AFIP.COLS_FACTURAS.NETO],
        iva: fila[CONFIG_AFIP.COLS_FACTURAS.IVA],
        total: fila[CONFIG_AFIP.COLS_FACTURAS.TOTAL],
        cae: fila[CONFIG_AFIP.COLS_FACTURAS.CAE],
        caeVto: fila[CONFIG_AFIP.COLS_FACTURAS.CAE_VTO],
        cbteAsocTipo: fila[CONFIG_AFIP.COLS_FACTURAS.CBTE_ASOC_TIPO],
        cbteAsocNro: fila[CONFIG_AFIP.COLS_FACTURAS.CBTE_ASOC_NRO],
        estado: fila[CONFIG_AFIP.COLS_FACTURAS.ESTADO],
        pdfUrl: fila[CONFIG_AFIP.COLS_FACTURAS.PDF_URL],
        detalle: fila[CONFIG_AFIP.COLS_FACTURAS.DETALLE],
        usuario: fila[CONFIG_AFIP.COLS_FACTURAS.USUARIO]
      };
    }).filter(function(f) { return f.id; }).reverse(); // Más recientes primero
  },

  /**
   * Actualiza el URL del PDF de una factura
   */
  actualizarPdfUrl: function(id, pdfUrl) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (var i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_AFIP.COLS_FACTURAS.ID] === id) {
        hoja.getRange(i + 1, CONFIG_AFIP.COLS_FACTURAS.PDF_URL + 1).setValue(pdfUrl);
        return true;
      }
    }
    return false;
  }
};

// ============================================================================
// GENERADOR DE PDF
// ============================================================================

const FacturaPDF = {
  /**
   * Genera un PDF de factura y lo guarda en Google Drive
   * @param {Object} factura - Datos de la factura emitida
   * @returns {string} URL del PDF
   */
  generar: function(factura) {
    try {
      // Crear documento HTML de la factura
      var html = this._construirHTML(factura);

      // Crear un blob HTML
      var blob = Utilities.newBlob(html, 'text/html', this._nombreArchivo(factura) + '.html');

      // Convertir a PDF usando Drive
      var pdfBlob = blob.getAs('application/pdf');
      pdfBlob.setName(this._nombreArchivo(factura) + '.pdf');

      // Guardar en carpeta de facturas
      var carpeta = this._getCarpetaFacturas();
      var archivo = carpeta.createFile(pdfBlob);

      // Hacer público para lectura
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return archivo.getUrl();
    } catch (error) {
      Logger.log('Error generando PDF: ' + error.message);
      return '';
    }
  },

  _nombreArchivo: function(factura) {
    var tipo = '';
    switch (factura.cbteTipo) {
      case 1: tipo = 'FA'; break;
      case 3: tipo = 'NCA'; break;
      case 6: tipo = 'FB'; break;
      case 8: tipo = 'NCB'; break;
      default: tipo = 'CBTE';
    }
    var pv = String(factura.ptoVta).padStart(5, '0');
    var nro = String(factura.cbteNro).padStart(8, '0');
    return tipo + '_' + pv + '-' + nro + '_' + (factura.clienteNombre || 'CLIENTE').replace(/[^A-Z0-9]/g, '_');
  },

  _getCarpetaFacturas: function() {
    var ss = getSpreadsheet();
    var ssFile = DriveApp.getFileById(ss.getId());
    var padres = ssFile.getParents();
    var carpetaPadre = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();

    // Buscar o crear subcarpeta "Facturas Sol & Verde"
    var iter = carpetaPadre.getFoldersByName('Facturas Sol & Verde');
    if (iter.hasNext()) {
      return iter.next();
    }
    return carpetaPadre.createFolder('Facturas Sol & Verde');
  },

  _construirHTML: function(f) {
    var tipoLetra = '';
    var tipoNombre = '';
    switch (f.cbteTipo) {
      case 1: tipoLetra = 'A'; tipoNombre = 'FACTURA'; break;
      case 3: tipoLetra = 'A'; tipoNombre = 'NOTA DE CRÉDITO'; break;
      case 6: tipoLetra = 'B'; tipoNombre = 'FACTURA'; break;
      case 8: tipoLetra = 'B'; tipoNombre = 'NOTA DE CRÉDITO'; break;
    }

    var pv = String(f.ptoVta).padStart(5, '0');
    var nro = String(f.cbteNro).padStart(8, '0');
    var nroCompleto = pv + '-' + nro;

    // Formatear fecha
    var fechaStr = '';
    if (f.fecha) {
      var fechaParts = String(f.fecha);
      if (fechaParts.length === 8) {
        fechaStr = fechaParts.substring(6, 8) + '/' + fechaParts.substring(4, 6) + '/' + fechaParts.substring(0, 4);
      } else {
        var d = parsearFechaLocal(f.fecha);
        if (d) fechaStr = formatearFecha(d);
      }
    }

    // Formatear CAE vto
    var caeVtoStr = '';
    if (f.caeVto) {
      var vto = String(f.caeVto);
      if (vto.length === 8) {
        caeVtoStr = vto.substring(6, 8) + '/' + vto.substring(4, 6) + '/' + vto.substring(0, 4);
      } else {
        caeVtoStr = vto;
      }
    }

    // URL del QR de ARCA
    var qrData = JSON.stringify({
      ver: 1,
      fecha: fechaStr ? (f.fecha.substring(0, 4) + '-' + f.fecha.substring(4, 6) + '-' + f.fecha.substring(6, 8)) : '',
      cuit: parseInt(CONFIG_AFIP.EMISOR.CUIT),
      ptoVta: f.ptoVta,
      tipoCmp: f.cbteTipo,
      nroCmp: f.cbteNro,
      importe: f.total,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: f.clienteCuit ? 80 : 99,
      nroDocRec: f.clienteCuit ? parseInt(f.clienteCuit) : 0,
      tipoCodAut: 'E',
      codAut: parseInt(f.cae || '0')
    });
    var qrBase64 = Utilities.base64Encode(qrData);
    var qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' + qrBase64;

    // Detalle de productos
    var detalleHTML = '';
    var items = [];
    try {
      if (f.detalle && typeof f.detalle === 'string') items = JSON.parse(f.detalle);
      else if (Array.isArray(f.detalle)) items = f.detalle;
    } catch (e) {}

    if (items.length > 0) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        detalleHTML += '<tr>' +
          '<td>' + (item.cantidad || 1) + '</td>' +
          '<td>' + escapeHtmlGS(item.descripcion || item.nombre || 'Producto') + '</td>' +
          '<td style="text-align:right">$' + formatNumero(item.precioUnit || 0) + '</td>' +
          '<td style="text-align:right">$' + formatNumero((item.cantidad || 1) * (item.precioUnit || 0)) + '</td>' +
          '</tr>';
      }
    } else {
      // Si no hay detalle, mostrar línea genérica
      detalleHTML = '<tr><td>1</td><td>Productos según remito</td>' +
        '<td style="text-align:right">$' + formatNumero(f.neto) + '</td>' +
        '<td style="text-align:right">$' + formatNumero(f.neto) + '</td></tr>';
    }

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<style>' +
      'body{font-family:Arial,sans-serif;margin:20px;font-size:11px;color:#333}' +
      '.factura{max-width:800px;margin:0 auto;border:2px solid #333;padding:0}' +
      '.header{display:flex;border-bottom:2px solid #333}' +
      '.header-left{flex:1;padding:15px;border-right:2px solid #333}' +
      '.header-center{width:80px;display:flex;align-items:center;justify-content:center;border-right:2px solid #333}' +
      '.header-center .letra{font-size:36px;font-weight:bold;border:2px solid #333;width:50px;height:50px;display:flex;align-items:center;justify-content:center}' +
      '.header-right{flex:1;padding:15px}' +
      '.header-right h2{margin:0 0 5px;font-size:14px}' +
      '.info-row{display:flex;border-bottom:1px solid #ccc;padding:8px 15px}' +
      '.info-row .label{font-weight:bold;min-width:120px}' +
      '.cliente{border-bottom:2px solid #333;padding:10px 15px}' +
      '.cliente h3{margin:0 0 8px;font-size:12px;border-bottom:1px solid #ccc;padding-bottom:5px}' +
      'table{width:100%;border-collapse:collapse}' +
      'th{background:#f0f0f0;border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:10px}' +
      'td{border:1px solid #ccc;padding:6px 8px;font-size:10px}' +
      '.totales{margin-top:10px;text-align:right;padding:10px 15px}' +
      '.totales table{width:300px;margin-left:auto}' +
      '.totales td{border:none;padding:4px 8px}' +
      '.totales .total-final{font-size:14px;font-weight:bold;border-top:2px solid #333}' +
      '.footer{border-top:2px solid #333;padding:10px 15px;display:flex;justify-content:space-between;align-items:center}' +
      '.cae-info{text-align:right}' +
      '</style></head><body>' +
      '<div class="factura">' +
      // HEADER
      '<div class="header">' +
      '<div class="header-left">' +
      '<h2 style="margin:0">' + escapeHtmlGS(CONFIG_AFIP.EMISOR.RAZON_SOCIAL) + '</h2>' +
      '<p style="margin:5px 0">' + escapeHtmlGS(CONFIG_AFIP.EMISOR.CONDICION_IVA) + '</p>' +
      '<p style="margin:2px 0;font-size:10px">CUIT: ' + formatCUIT(CONFIG_AFIP.EMISOR.CUIT) + '</p>' +
      '</div>' +
      '<div class="header-center"><div class="letra">' + tipoLetra + '</div></div>' +
      '<div class="header-right">' +
      '<h2>' + tipoNombre + '</h2>' +
      '<p style="margin:2px 0"><strong>Nro:</strong> ' + nroCompleto + '</p>' +
      '<p style="margin:2px 0"><strong>Fecha:</strong> ' + fechaStr + '</p>' +
      '<p style="margin:2px 0;font-size:9px">Cod. ' + String(f.cbteTipo).padStart(3, '0') + '</p>' +
      '</div>' +
      '</div>' +
      // CLIENTE
      '<div class="cliente">' +
      '<h3>DATOS DEL RECEPTOR</h3>' +
      '<p><strong>Razón Social:</strong> ' + escapeHtmlGS(f.clienteNombre || 'CONSUMIDOR FINAL') + '</p>' +
      '<p><strong>CUIT/DNI:</strong> ' + (f.clienteCuit ? formatCUIT(String(f.clienteCuit)) : 'S/D - Consumidor Final') + '</p>' +
      '<p><strong>Condición IVA:</strong> ' + escapeHtmlGS(f.clienteCondicionTexto || f.clienteCondicion || 'Consumidor Final') + '</p>' +
      '</div>' +
      // DETALLE
      '<div style="padding:10px 15px">' +
      '<table><thead><tr><th>Cant.</th><th>Descripción</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>' +
      '<tbody>' + detalleHTML + '</tbody></table>' +
      '</div>' +
      // TOTALES
      '<div class="totales">' +
      '<table>' +
      '<tr><td>Subtotal (Neto Gravado):</td><td style="text-align:right">$' + formatNumero(f.neto) + '</td></tr>' +
      '<tr><td>IVA 10.5%:</td><td style="text-align:right">$' + formatNumero(f.iva) + '</td></tr>' +
      '<tr class="total-final"><td><strong>TOTAL:</strong></td><td style="text-align:right"><strong>$' + formatNumero(f.total) + '</strong></td></tr>' +
      '</table></div>' +
      // FOOTER CON CAE
      '<div class="footer">' +
      '<div><img src="' + qrUrl + '" width="100" height="100" alt="QR ARCA" onerror="this.style.display=\'none\'"></div>' +
      '<div class="cae-info">' +
      '<p><strong>CAE:</strong> ' + (f.cae || 'En trámite') + '</p>' +
      '<p><strong>Vto. CAE:</strong> ' + (caeVtoStr || '-') + '</p>' +
      '</div></div>' +
      '</div></body></html>';
  }
};

// Funciones auxiliares para el PDF
function escapeHtmlGS(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNumero(num) {
  if (typeof num !== 'number') return '0.00';
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCUIT(cuit) {
  var c = String(cuit).replace(/\D/g, '');
  if (c.length !== 11) return cuit;
  return c.substring(0, 2) + '-' + c.substring(2, 10) + '-' + c.substring(10);
}

// ============================================================================
// FUNCIONES API PARA FRONTEND
// ============================================================================

/**
 * Genera un certificado para Afip SDK via automations API.
 * Requiere usuario y contraseña de ARCA (clave fiscal).
 *
 * El proceso tarda 10-60 segundos:
 * 1. Crea una automatización en Afip SDK
 * 2. La automatización ingresa a ARCA y genera el certificado
 * 3. Devuelve cert + key que se guardan en ScriptProperties
 *
 * @param {Object} datos - {username, password, alias, environment}
 * @returns {Object} {success, mensaje}
 */
function generarCertificadoAfip(datos) {
  try {
    if (!datos.username || !datos.password) {
      throw new Error('Se requiere usuario (CUIT) y contraseña de ARCA (clave fiscal)');
    }

    var config = AfipService.getConfig();
    var env = datos.environment || config.environment || 'dev';
    var automationType = env === 'prod' ? 'create-cert-prod' : 'create-cert-dev';
    var alias = datos.alias || 'solyverde';

    // Paso 1: Crear la automatización
    var createPayload = {
      automation: automationType,
      params: {
        cuit: config.cuit || CONFIG_AFIP.EMISOR.CUIT,
        username: String(datos.username).replace(/[-\s]/g, ''),
        password: datos.password,
        alias: alias
      }
    };

    var createResult = AfipService._fetch('/automations', createPayload);

    if (!createResult.id) {
      throw new Error('No se pudo iniciar la generación del certificado. Respuesta: ' + JSON.stringify(createResult).substring(0, 200));
    }

    var automationId = createResult.id;
    Logger.log('Automatización creada: ' + automationId + ' (tipo: ' + automationType + ')');

    // Paso 2: Esperar resultado (polling cada 5 seg, máximo 120 seg)
    var maxIntentos = 24;
    var resultado = null;

    for (var i = 0; i < maxIntentos; i++) {
      Utilities.sleep(5000); // 5 segundos

      var pollResult = AfipService._fetch('/automations/' + automationId, null, 'get');

      if (pollResult.status === 'complete' || pollResult.status === 'completed') {
        resultado = pollResult;
        break;
      }

      if (pollResult.status === 'error' || pollResult.status === 'failed') {
        throw new Error('Error generando certificado: ' + (pollResult.error || pollResult.message || JSON.stringify(pollResult.data || {}).substring(0, 200)));
      }

      Logger.log('Esperando certificado... intento ' + (i + 1) + '/' + maxIntentos + ' (estado: ' + pollResult.status + ')');
    }

    if (!resultado) {
      throw new Error('Tiempo de espera agotado. El certificado puede estar generándose aún. Intentá de nuevo en unos minutos.');
    }

    // Paso 3: Extraer cert y key
    var certData = resultado.data || resultado;
    var cert = certData.cert || '';
    var key = certData.key || '';

    if (!cert || !key) {
      throw new Error('La respuesta no incluyó certificado o clave. Respuesta: ' + JSON.stringify(certData).substring(0, 300));
    }

    // Paso 4: Guardar en ScriptProperties
    AfipService.setConfig({
      cert: cert,
      key: key
    });

    Logger.log('Certificado generado y guardado exitosamente (' + env + ')');

    // Paso 5: Autorizar web services automáticamente
    Logger.log('Autorizando web services wsfe y ws_sr_padron_a5...');
    var authResult = autorizarWebServicesAfip({
      username: datos.username,
      password: datos.password,
      alias: alias,
      environment: env
    });

    if (!authResult.success) {
      // El certificado se generó pero falló la autorización
      return {
        success: true,
        mensaje: 'Certificado ' + env.toUpperCase() + ' generado. ATENCION: Fallo la autorizacion de web services: ' + authResult.error + '. Usa el boton "Autorizar Web Services" para intentar de nuevo.',
        certPreview: cert.substring(0, 60) + '...',
        authError: authResult.error
      };
    }

    return {
      success: true,
      mensaje: 'Certificado ' + env.toUpperCase() + ' generado y web services autorizados. Ya podés emitir comprobantes con tu CUIT.',
      certPreview: cert.substring(0, 60) + '...',
      wsAutorizados: authResult.autorizados
    };
  } catch (error) {
    Logger.log('Error generando certificado: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Autoriza los web services necesarios (wsfe y ws_sr_padron_a5) en ARCA
 * via el endpoint ws-auths de Afip SDK.
 *
 * Este paso es OBLIGATORIO después de generar un certificado.
 * Sin autorización, el web service devuelve error "coe.notAuthorized".
 *
 * @param {Object} datos - {username, password, alias, environment}
 * @returns {Object} {success, mensaje, autorizados}
 */
function autorizarWebServicesAfip(datos) {
  try {
    if (!datos.username || !datos.password) {
      throw new Error('Se requiere usuario (CUIT) y contraseña de ARCA');
    }

    var config = AfipService.getConfig();

    if (!config.accessToken) {
      throw new Error('Access Token de Afip SDK no configurado. Ve a Configuración > Facturación ARCA y pegá tu Access Token.');
    }

    var env = datos.environment || config.environment || 'dev';
    var alias = datos.alias || 'solyverde';
    var cuit = config.cuit || CONFIG_AFIP.EMISOR.CUIT;

    // Verificar que hay certificado (requerido para autorizar web services con CUIT propio)
    if (!AfipService.tieneCertificado() && env === 'prod') {
      throw new Error('Se requiere certificado para autorizar web services en modo producción. Generá un certificado primero.');
    }

    // Web services a autorizar
    var webServices = ['wsfe', 'ws_sr_padron_a5'];
    var autorizados = [];
    var errores = [];

    for (var i = 0; i < webServices.length; i++) {
      var wsid = webServices[i];
      Logger.log('Autorizando web service: ' + wsid);

      try {
        var resultado = _autorizarUnWebService({
          environment: env,
          tax_id: cuit,
          username: String(datos.username).replace(/[-\s]/g, ''),
          password: datos.password,
          wsid: wsid,
          alias: alias
        });

        if (resultado.success) {
          autorizados.push(wsid);
          Logger.log('Web service ' + wsid + ' autorizado exitosamente');
        } else {
          errores.push(wsid + ': ' + resultado.error);
          Logger.log('Error autorizando ' + wsid + ': ' + resultado.error);
        }
      } catch (e) {
        errores.push(wsid + ': ' + e.message);
        Logger.log('Excepcion autorizando ' + wsid + ': ' + e.message);
      }

      // Pausa entre autorizaciones
      if (i < webServices.length - 1) {
        Utilities.sleep(2000);
      }
    }

    if (autorizados.length === 0) {
      return {
        success: false,
        error: 'No se pudo autorizar ningun web service. Errores: ' + errores.join('; ')
      };
    }

    return {
      success: true,
      mensaje: 'Web services autorizados: ' + autorizados.join(', '),
      autorizados: autorizados,
      errores: errores.length > 0 ? errores : null
    };
  } catch (error) {
    Logger.log('Error en autorizarWebServicesAfip: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Autoriza un único web service via el endpoint ws-auths
 * @private
 */
function _autorizarUnWebService(params) {
  var config = AfipService.getConfig();

  if (!config.accessToken) {
    throw new Error('Access Token no configurado');
  }

  var url = 'https://app.afipsdk.com/api/v1/afip/ws-auths';

  var payload = {
    environment: params.environment,
    tax_id: params.tax_id,
    username: params.username,
    password: params.password,
    wsid: params.wsid,
    alias: params.alias
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + config.accessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // Retry logic para errores transitorios de red (500/502/503/504)
  var maxRetries = 3;
  var response = null;
  var code = 0;
  var text = '';

  for (var retry = 0; retry <= maxRetries; retry++) {
    try {
      response = UrlFetchApp.fetch(url, options);
      code = response.getResponseCode();
      text = response.getContentText();

      // Solo reintentar en errores de servidor transitorios
      if (code >= 500 && code <= 504 && retry < maxRetries) {
        Logger.log('Error transitorio ' + code + ' autorizando ' + params.wsid + ', reintentando en ' + ((retry + 1) * 3) + 's...');
        Utilities.sleep((retry + 1) * 3000);
        continue;
      }
      break; // Salir del loop si no es error transitorio
    } catch (fetchError) {
      if (retry < maxRetries) {
        Logger.log('Error de red autorizando ' + params.wsid + ': ' + fetchError.message + ', reintentando...');
        Utilities.sleep((retry + 1) * 3000);
        continue;
      }
      throw new Error('Error de red persistente: ' + fetchError.message);
    }
  }

  // Intentar parsear la respuesta JSON (independientemente del status code)
  var result = null;
  try {
    result = JSON.parse(text);
  } catch (parseError) {
    // Si no es JSON válido, reportar error con status code
    throw new Error('Error ' + code + ' (respuesta no JSON): ' + text.substring(0, 200));
  }

  // Verificar si necesita polling (puede venir con código 200 o no-200)
  if (result.status === 'in_process' || result.status === 'in_progress' || (result.id && result.status !== 'error' && result.status !== 'failed')) {
    Logger.log('Autorizacion de ' + params.wsid + ' en proceso, iniciando polling (id: ' + (result.id || 'sin id') + ')');
    return _pollAutorizacion(url, payload, config.accessToken, result.id || null);
  }

  // Si ya está completo
  if (result.status === 'complete' || result.status === 'completed' || result.success === true) {
    return { success: true };
  }

  // Si hay error explícito
  if (result.status === 'error' || result.status === 'failed' || result.success === false) {
    return { success: false, error: result.error || result.message || JSON.stringify(result.data_errors || result).substring(0, 200) };
  }

  // Para HTTP errors sin status reconocido
  if (code !== 200) {
    return { success: false, error: 'Error HTTP ' + code + ': ' + (result.message || result.error || JSON.stringify(result).substring(0, 200)) };
  }

  // Respuesta 200 sin status reconocido - asumir éxito
  return { success: true };
}

/**
 * Polling para esperar que la autorización se complete
 * @private
 */
function _pollAutorizacion(url, payload, accessToken, jobId) {
  var maxIntentos = 18; // 18 x 7s = 126 segundos max
  var intervaloMs = 7000; // 7 segundos entre intentos (evitar rate limiting)

  for (var i = 0; i < maxIntentos; i++) {
    Utilities.sleep(intervaloMs);

    // Agregar long_job_id si tenemos uno
    var pollPayload = Object.assign({}, payload);
    if (jobId) {
      pollPayload.long_job_id = jobId;
    }

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + accessToken
      },
      payload: JSON.stringify(pollPayload),
      muteHttpExceptions: true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();
      var text = response.getContentText();

      // Reintentar silenciosamente en errores de servidor
      if (responseCode >= 500 && responseCode <= 504) {
        Logger.log('Polling: error transitorio ' + responseCode + ', reintentando...');
        continue;
      }

      var result = JSON.parse(text);

      if (result.status === 'complete' || result.status === 'completed' || result.success === true) {
        Logger.log('Autorizacion completada en intento ' + (i + 1));
        return { success: true };
      }

      if (result.status === 'error' || result.status === 'failed') {
        return { success: false, error: result.error || result.message || 'Autorización fallida' };
      }

      // Guardar job id para siguiente intento
      if (result.id && !jobId) {
        jobId = result.id;
      }

      Logger.log('Polling autorizacion... intento ' + (i + 1) + '/' + maxIntentos + ' (estado: ' + (result.status || 'desconocido') + ', job: ' + (jobId || 'sin id') + ')');
    } catch (e) {
      Logger.log('Error en polling intento ' + (i + 1) + ': ' + e.message);
      // Continuar intentando a menos que sea el último intento
    }
  }

  return { success: false, error: 'Tiempo de espera agotado (2 min). El proceso puede seguir en segundo plano. Intenta "Probar Conexion" en unos minutos.' };
}

/**
 * Guarda configuración de Afip SDK
 */
function guardarConfigAfip(config) {
  try {
    AfipService.setConfig(config);
    return { success: true, mensaje: 'Configuración ARCA guardada' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene configuración actual (sin revelar token completo)
 */
function obtenerConfigAfip() {
  try {
    var config = AfipService.getConfig();
    return {
      success: true,
      configurado: AfipService.estaConfigurado(),
      tieneCert: AfipService.tieneCertificado(),
      environment: config.environment,
      puntoVenta: config.puntoVenta,
      cuit: config.cuit,
      tokenPreview: config.accessToken ? ('...' + config.accessToken.slice(-6)) : '',
      certPreview: config.cert ? ('Certificado: ...' + config.cert.slice(-20)) : ''
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Prueba conexión con ARCA via Afip SDK
 */
function probarConexionAfip() {
  try {
    // Intentar autenticar
    var auth = AfipService.autenticar('wsfe');

    if (auth.token && auth.sign) {
      // Intentar consultar último comprobante como test
      var config = AfipService.getConfig();
      var ultimo = AfipService.ultimoComprobante(CONFIG_AFIP.CBTE_TIPOS.FACTURA_B);
      var cuitUsado = auth.cuitAuth;
      var nota = cuitUsado === '20409378472' ? ' (CUIT de test - sin certificado propio)' : ' (CUIT propio con certificado)';
      return {
        success: true,
        mensaje: 'Conexion exitosa con ARCA (' + config.environment + '). CUIT: ' + cuitUsado + nota + '. Ultimo comprobante B: ' + ultimo,
        environment: config.environment,
        ultimoB: ultimo,
        cuitAuth: cuitUsado
      };
    }

    return { success: false, error: 'No se recibió token de ARCA' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Emite una factura electrónica
 * @param {Object} datos - {cbteTipo, clienteNombre, clienteCuit, clienteCondicion, importeNeto, detalle}
 */
function emitirFacturaElectronica(datos) {
  try {
    // Validaciones
    if (!datos.cbteTipo) throw new Error('Tipo de comprobante requerido');
    if (!datos.importeNeto || datos.importeNeto <= 0) throw new Error('Importe neto debe ser mayor a 0');
    if (!datos.clienteNombre) throw new Error('Nombre del cliente requerido');

    // Para Factura A, validar CUIT
    if ((datos.cbteTipo === 1 || datos.cbteTipo === 3) && !datos.clienteCuit) {
      throw new Error('Factura/NC tipo A requiere CUIT del cliente');
    }

    // Limpiar CUIT
    var cuitLimpio = datos.clienteCuit ? String(datos.clienteCuit).replace(/[-\s]/g, '') : '';

    // Emitir en ARCA
    var resultado = AfipService.emitirComprobante({
      cbteTipo: datos.cbteTipo,
      clienteCuit: cuitLimpio,
      importeNeto: datos.importeNeto,
      cbteAsocTipo: datos.cbteAsocTipo || null,
      cbteAsocNro: datos.cbteAsocNro || null,
      cbteAsocFecha: datos.cbteAsocFecha || null
    });

    // Registrar en hoja
    var facturaId = FacturasRepository.registrar({
      cbteTipo: resultado.cbteTipo,
      cbteNro: resultado.cbteNro,
      ptoVta: resultado.ptoVta,
      clienteNombre: datos.clienteNombre,
      clienteCuit: cuitLimpio,
      clienteCondicion: datos.clienteCondicion || 'CF',
      neto: resultado.neto,
      iva: resultado.iva,
      total: resultado.total,
      cae: resultado.cae,
      caeVto: resultado.caeVto,
      estado: 'EMITIDA',
      detalle: datos.detalle || []
    });

    // Generar PDF
    var pdfUrl = FacturaPDF.generar({
      cbteTipo: resultado.cbteTipo,
      cbteNro: resultado.cbteNro,
      ptoVta: resultado.ptoVta,
      fecha: resultado.fecha,
      clienteNombre: datos.clienteNombre,
      clienteCuit: cuitLimpio,
      clienteCondicion: datos.clienteCondicion || 'CF',
      clienteCondicionTexto: datos.clienteCondicionTexto || datos.clienteCondicion || 'Consumidor Final',
      neto: resultado.neto,
      iva: resultado.iva,
      total: resultado.total,
      cae: resultado.cae,
      caeVto: resultado.caeVto,
      detalle: datos.detalle || []
    });

    // Actualizar URL del PDF en la hoja
    if (pdfUrl) {
      FacturasRepository.actualizarPdfUrl(facturaId, pdfUrl);
    }

    return {
      success: true,
      facturaId: facturaId,
      cae: resultado.cae,
      caeVto: resultado.caeVto,
      cbteNro: resultado.cbteNro,
      ptoVta: resultado.ptoVta,
      neto: resultado.neto,
      iva: resultado.iva,
      total: resultado.total,
      pdfUrl: pdfUrl,
      mensaje: 'Comprobante emitido - CAE: ' + resultado.cae
    };
  } catch (error) {
    Logger.log('Error emitiendo factura: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Emite Nota de Crédito asociada a una factura existente
 */
function emitirNotaCredito(facturaOriginalId) {
  try {
    // Buscar factura original
    var facturas = FacturasRepository.obtenerTodas(500);
    var original = null;
    for (var i = 0; i < facturas.length; i++) {
      if (facturas[i].id === facturaOriginalId) {
        original = facturas[i];
        break;
      }
    }

    if (!original) throw new Error('Factura original no encontrada');
    if (original.estado === 'ANULADA') throw new Error('La factura ya fue anulada');

    // Determinar tipo de NC según tipo de factura original
    var ncTipo = original.cbteTipo === 1 ? CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_A : CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_B;

    var resultado = emitirFacturaElectronica({
      cbteTipo: ncTipo,
      clienteNombre: original.clienteNombre,
      clienteCuit: original.clienteCuit,
      clienteCondicion: original.clienteCondicion,
      clienteCondicionTexto: original.clienteCondicion === 'RI' ? 'Responsable Inscripto' : 'Consumidor Final',
      importeNeto: original.neto,
      cbteAsocTipo: original.cbteTipo,
      cbteAsocNro: original.cbteNro,
      cbteAsocFecha: original.fecha ? String(original.fecha).replace(/-/g, '') : '',
      detalle: original.detalle ? (typeof original.detalle === 'string' ? JSON.parse(original.detalle) : original.detalle) : []
    });

    if (resultado.success) {
      // Marcar factura original como anulada
      var hoja = FacturasRepository.getHoja();
      var datos = hoja.getDataRange().getValues();
      for (var j = 1; j < datos.length; j++) {
        if (datos[j][CONFIG_AFIP.COLS_FACTURAS.ID] === facturaOriginalId) {
          hoja.getRange(j + 1, CONFIG_AFIP.COLS_FACTURAS.ESTADO + 1).setValue('ANULADA');
          break;
        }
      }
    }

    return resultado;
  } catch (error) {
    Logger.log('Error emitiendo NC: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Consulta CUIT en padrón ARCA y devuelve datos fiscales
 */
function consultarCUITArca(cuit) {
  try {
    return AfipService.consultarCUIT(cuit);
  } catch (error) {
    return { encontrado: false, error: error.message };
  }
}

/**
 * Actualiza la condición fiscal de clientes que tienen CUIT
 * consultando el padrón de ARCA
 */
function actualizarCondicionesFiscalesDesdeArca() {
  try {
    var clientes = ClientesRepository.obtenerTodos(0, 0);
    var actualizados = 0;
    var errores = 0;

    for (var i = 0; i < clientes.length; i++) {
      var cliente = clientes[i];
      if (!cliente.cuit) continue;

      // Esperar un poco entre consultas para no saturar
      if (i > 0) Utilities.sleep(500);

      var resultado = AfipService.consultarCUIT(cliente.cuit);

      if (resultado.encontrado) {
        var condicion = resultado.condicionTexto;
        // Si ARCA dice que no es RI ni M, catalogar como CF
        if (resultado.condicionIVA !== 'RI' && resultado.condicionIVA !== 'M') {
          condicion = 'Consumidor Final';
        }

        ClientesRepository.actualizar(cliente.nombre, {
          condicionFiscal: condicion
        });
        actualizados++;
      } else {
        errores++;
      }
    }

    return {
      success: true,
      actualizados: actualizados,
      errores: errores,
      mensaje: actualizados + ' clientes actualizados desde ARCA, ' + errores + ' errores'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene historial de facturas emitidas para el frontend
 */
function obtenerHistorialFacturas() {
  try {
    var facturas = FacturasRepository.obtenerTodas(200);
    return { success: true, facturas: facturas };
  } catch (error) {
    return { success: false, error: error.message, facturas: [] };
  }
}
