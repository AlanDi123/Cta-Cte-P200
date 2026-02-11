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

  /**
   * Obtiene los datos del emisor desde ScriptProperties (dinámico)
   * @returns {Object} Datos del emisor
   */
  getEmisor: function() {
    const props = PropertiesService.getScriptProperties();
    return {
      CUIT: props.getProperty('EMISOR_CUIT') || '20149543407',
      RAZON_SOCIAL: props.getProperty('EMISOR_RAZON_SOCIAL') || 'DOMINGUES ALDO FERMIN',
      NOMBRE_FANTASIA: props.getProperty('EMISOR_NOMBRE_FANTASIA') || '',
      DOMICILIO: props.getProperty('EMISOR_DOMICILIO') || '',
      INGRESOS_BRUTOS: props.getProperty('EMISOR_IIBB') || '',
      FECHA_INICIO: props.getProperty('EMISOR_FECHA_INICIO') || '',
      CONDICION_IVA: props.getProperty('EMISOR_CONDICION_IVA') || 'Responsable Inscripto'
    };
  },

  /**
   * Obtiene la configuración de IVA desde CONFIG global
   */
  getIVA: function() {
    const ivaConfig = CONFIG.getIVA();
    const props = PropertiesService.getScriptProperties();
    const alicuotaId = parseInt(props.getProperty('IVA_ALICUOTA_ID') || '4');
    
    return {
      ALICUOTA_ID: alicuotaId,
      PORCENTAJE: ivaConfig.PORCENTAJE,
      MULTIPLICADOR: ivaConfig.MULTIPLICADOR
    };
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
    const emisor = CONFIG_AFIP.getEmisor();
    return {
      accessToken: props.getProperty('AFIP_ACCESS_TOKEN') || '',
      environment: props.getProperty('AFIP_ENVIRONMENT') || 'dev',
      puntoVenta: parseInt(props.getProperty('AFIP_PUNTO_VENTA') || '11'),
      cuit: props.getProperty('AFIP_CUIT') || emisor.CUIT,
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
   * @param {string} wsid - Web Service ID ('wsfe' para facturación, 'ws_sr_padron_a13' para padrón)
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
    const iva = Math.round(neto * CONFIG_AFIP.getIVA().MULTIPLICADOR * 100) / 100;
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
      Id: CONFIG_AFIP.getIVA().ALICUOTA_ID,
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

    const auth = this.autenticar('ws_sr_padron_a13');

    const payload = {
      environment: config.environment,
      method: 'getPersona',
      wsid: 'ws_sr_padron_a13',
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
    // Obtener datos del emisor
    var emisor = CONFIG_AFIP.getEmisor();

    var tipoLetra = '';
    var tipoNombre = '';
    var tipoCodigo = '';
    switch (f.cbteTipo) {
      case 1: tipoLetra = 'A'; tipoNombre = 'FACTURA'; tipoCodigo = '01'; break;
      case 3: tipoLetra = 'A'; tipoNombre = 'NOTA DE CRÉDITO'; tipoCodigo = '03'; break;
      case 6: tipoLetra = 'B'; tipoNombre = 'FACTURA'; tipoCodigo = '06'; break;
      case 8: tipoLetra = 'B'; tipoNombre = 'NOTA DE CRÉDITO'; tipoCodigo = '08'; break;
    }

    var pv = String(f.ptoVta).padStart(5, '0');
    var nro = String(f.cbteNro).padStart(8, '0');

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
    // Construir fecha en formato YYYY-MM-DD para el QR
    var fechaQR = '';
    if (f.fecha) {
      var fechaParts = String(f.fecha);
      if (fechaParts.length === 8) {
        fechaQR = fechaParts.substring(0, 4) + '-' + fechaParts.substring(4, 6) + '-' + fechaParts.substring(6, 8);
      }
    }
    
    var qrData = JSON.stringify({
      ver: 1,
      fecha: fechaQR,
      cuit: parseInt(emisor.CUIT.replace(/-/g, '')),
      ptoVta: f.ptoVta,
      tipoCmp: f.cbteTipo,
      nroCmp: f.cbteNro,
      importe: f.total,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: f.clienteCuit ? 80 : 99,
      nroDocRec: f.clienteCuit ? parseInt(String(f.clienteCuit).replace(/-/g, '')) : 0,
      tipoCodAut: 'E',
      codAut: parseInt(String(f.cae || '0'))
    });
    var qrBase64 = Utilities.base64Encode(qrData);
    var qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' + qrBase64;

    // Detalle de productos y cálculo de IVA por alícuota
    var detalleHTML = '';
    var items = [];
    try {
      if (f.detalle && typeof f.detalle === 'string') items = JSON.parse(f.detalle);
      else if (Array.isArray(f.detalle)) items = f.detalle;
    } catch (e) {}

    // Inicializar desglose de IVA por alícuota
    var desglosesIVA = {
      '27': { neto: 0, iva: 0 },
      '21': { neto: 0, iva: 0 },
      '10.5': { neto: 0, iva: 0 },
      '5': { neto: 0, iva: 0 },
      '2.5': { neto: 0, iva: 0 },
      '0': { neto: 0, iva: 0 }
    };

    var netoTotal = 0;

    if (items.length > 0) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var cant = item.cantidad || 1;
        var precioUnit = item.precioUnit || item.precioUnitario || 0;
        var subtotal = cant * precioUnit;
        var alicuota = item.alicuotaIVA || item.alicuota || 10.5;
        var montoIVA = subtotal * (alicuota / 100);
        var subtotalConIVA = subtotal + montoIVA;

        // Acumular en desglose
        var alicStr = String(alicuota);
        if (desglosesIVA[alicStr]) {
          desglosesIVA[alicStr].neto += subtotal;
          desglosesIVA[alicStr].iva += montoIVA;
        }
        netoTotal += subtotal;

        detalleHTML += '<tr>' +
          '<td style="text-align:center">' + (item.codigo || '') + '</td>' +
          '<td>' + escapeHtmlGS(item.descripcion || item.nombre || 'Producto') + '</td>' +
          '<td style="text-align:right">' + formatNumero(cant) + '</td>' +
          '<td style="text-align:center">unidades</td>' +
          '<td style="text-align:right">' + formatNumero(precioUnit) + '</td>' +
          '<td style="text-align:right">0.00</td>' +
          '<td style="text-align:right">' + formatNumero(subtotal) + '</td>' +
          '<td style="text-align:right">' + alicuota + '%</td>' +
          '<td style="text-align:right">' + formatNumero(subtotalConIVA) + '</td>' +
          '</tr>';
      }
    } else {
      // Si no hay detalle, mostrar línea genérica
      var alicuota = 10.5;
      var montoIVA = f.neto * (alicuota / 100);
      desglosesIVA['10.5'].neto = f.neto;
      desglosesIVA['10.5'].iva = montoIVA;
      netoTotal = f.neto;

      detalleHTML = '<tr>' +
        '<td style="text-align:center"></td>' +
        '<td>Productos según remito</td>' +
        '<td style="text-align:right">1.00</td>' +
        '<td style="text-align:center">unidades</td>' +
        '<td style="text-align:right">' + formatNumero(f.neto) + '</td>' +
        '<td style="text-align:right">0.00</td>' +
        '<td style="text-align:right">' + formatNumero(f.neto) + '</td>' +
        '<td style="text-align:right">10.5%</td>' +
        '<td style="text-align:right">' + formatNumero(f.total) + '</td>' +
        '</tr>';
    }

    // Formatear fecha inicio actividades si existe
    var fechaInicioStr = '';
    if (emisor.FECHA_INICIO) {
      var partes = emisor.FECHA_INICIO.split('-');
      if (partes.length === 3) {
        fechaInicioStr = partes[2] + '/' + partes[1] + '/' + partes[0];
      }
    }

    // Generar URL de QR con Chart API de Google
    var qrUrl = 'https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=' + encodeURIComponent('https://www.afip.gob.ar/fe/qr/?p=' + qrBase64);

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<style>' +
      '@page{size:A4;margin:1cm}' +
      'body{font-family:Arial,sans-serif;font-size:9pt;line-height:1.2;margin:0;padding:0}' +
      '.factura-container{border:2px solid #000;max-width:19cm;margin:0 auto}' +
      '.header-original{text-align:center;font-weight:bold;font-size:10pt;padding:4px;border-bottom:2px solid #000}' +
      '.header-tipo{display:grid;grid-template-columns:100px 1fr;border-bottom:2px solid #000}' +
      '.tipo-letra{border-right:2px solid #000;text-align:center;padding:10px}' +
      '.tipo-letra-grande{font-size:48pt;font-weight:bold;line-height:1}' +
      '.tipo-codigo{font-size:8pt}' +
      '.tipo-info{padding:8px 12px}' +
      '.tipo-info p{margin:2px 0}' +
      '.section{padding:8px 12px;border-bottom:1px solid #000}' +
      '.section p{margin:3px 0}' +
      '.productos-table{width:100%;border-collapse:collapse;font-size:8pt}' +
      '.productos-table th{background:#f0f0f0;border:1px solid #000;padding:4px 6px;text-align:left;font-weight:bold}' +
      '.productos-table td{border:1px solid #000;padding:4px 6px}' +
      '.text-right{text-align:right}' +
      '.totales{padding:12px;border-top:2px solid #000}' +
      '.totales-left{float:left;width:40%}' +
      '.totales-right{float:right;width:58%;text-align:right}' +
      '.total-line{margin:2px 0;padding-right:12px}' +
      '.total-final{font-size:11pt;font-weight:bold;margin-top:8px;padding-top:4px;border-top:1px solid #000}' +
      '.footer{clear:both;display:grid;grid-template-columns:120px 1fr;padding:12px;border-top:2px solid #000}' +
      '.footer-qr{text-align:center}' +
      '.footer-info{padding-left:12px}' +
      '.footer-info p{margin:2px 0;font-size:8pt}' +
      '.disclaimer{font-size:7pt;color:#666;margin-top:8px}' +
      '.clearfix::after{content:"";display:table;clear:both}' +
      '</style></head><body>' +
      '<div class="factura-container">' +
      // ORIGINAL
      '<div class="header-original">ORIGINAL</div>' +
      // TIPO Y DATOS DEL COMPROBANTE
      '<div class="header-tipo">' +
      '<div class="tipo-letra">' +
      '<div class="tipo-letra-grande">' + tipoLetra + '</div>' +
      '<div class="tipo-codigo">COD ' + tipoCodigo + '</div>' +
      '</div>' +
      '<div class="tipo-info">' +
      '<p><strong>' + tipoNombre + '</strong></p>' +
      '<p><strong>Punto de Venta:</strong> ' + pv + '</p>' +
      '<p><strong>Comp. Nro:</strong> ' + nro + '</p>' +
      '<p><strong>Fecha de Emisión:</strong> ' + fechaStr + '</p>' +
      '</div>' +
      '</div>' +
      // DATOS DEL EMISOR
      '<div class="section">' +
      '<p><strong>Razón Social:</strong> ' + escapeHtmlGS(emisor.RAZON_SOCIAL) + '</p>' +
      '<p><strong>Domicilio Comercial:</strong> ' + escapeHtmlGS(emisor.DOMICILIO || 'N/E') + '</p>' +
      '<p><strong>Condición frente al IVA:</strong> ' + escapeHtmlGS(emisor.CONDICION_IVA) + '</p>' +
      '<p><strong>CUIT:</strong> ' + formatCUIT(emisor.CUIT) + '</p>' +
      (emisor.INGRESOS_BRUTOS ? '<p><strong>Ingresos Brutos:</strong> ' + escapeHtmlGS(emisor.INGRESOS_BRUTOS) + '</p>' : '') +
      (fechaInicioStr ? '<p><strong>Fecha de Inicio de Actividades:</strong> ' + fechaInicioStr + '</p>' : '') +
      '</div>' +
      // DATOS DEL RECEPTOR
      '<div class="section">' +
      '<p><strong>CUIT:</strong> ' + (f.clienteCuit ? formatCUIT(String(f.clienteCuit)) : 'Consumidor Final') + '</p>' +
      '<p><strong>Apellido y Nombre / Razón Social:</strong> ' + escapeHtmlGS(f.clienteRazonSocial || f.clienteNombre || 'CONSUMIDOR FINAL') + '</p>' +
      '<p><strong>Condición frente al IVA:</strong> ' + escapeHtmlGS(f.clienteCondicionTexto || f.clienteCondicion || 'Consumidor Final') + '</p>' +
      (f.clienteDomicilio ? '<p><strong>Domicilio Comercial:</strong> ' + escapeHtmlGS(f.clienteDomicilio) + '</p>' : '') +
      '<p><strong>Condición de Venta:</strong></p>' +
      '</div>' +
      // TABLA DE PRODUCTOS
      '<table class="productos-table">' +
      '<thead><tr>' +
      '<th style="width:60px">Código</th>' +
      '<th>Producto / Servicio</th>' +
      '<th style="width:60px">Cantidad</th>' +
      '<th style="width:60px">U.medida</th>' +
      '<th style="width:90px" class="text-right">Precio Unit.</th>' +
      '<th style="width:60px" class="text-right">% Bonif.</th>' +
      '<th style="width:90px" class="text-right">Subtotal</th>' +
      '<th style="width:70px" class="text-right">Alícuota IVA</th>' +
      '<th style="width:100px" class="text-right">Subtotal c/IVA</th>' +
      '</tr></thead>' +
      '<tbody>' + detalleHTML + '</tbody>' +
      '</table>' +
      // TOTALES
      '<div class="totales clearfix">' +
      '<div class="totales-left">' +
      '<p><strong>Importe Otros Tributos: $</strong> 0.00</p>' +
      '</div>' +
      '<div class="totales-right">' +
      '<div class="total-line"><strong>Importe Neto Gravado: $</strong> ' + formatNumero(netoTotal) + '</div>' +
      '<div class="total-line"><strong>IVA 27%: $</strong> ' + formatNumero(desglosesIVA['27'].iva) + '</div>' +
      '<div class="total-line"><strong>IVA 21%: $</strong> ' + formatNumero(desglosesIVA['21'].iva) + '</div>' +
      '<div class="total-line"><strong>IVA 10.5%: $</strong> ' + formatNumero(desglosesIVA['10.5'].iva) + '</div>' +
      '<div class="total-line"><strong>IVA 5%: $</strong> ' + formatNumero(desglosesIVA['5'].iva) + '</div>' +
      '<div class="total-line"><strong>IVA 2.5%: $</strong> ' + formatNumero(desglosesIVA['2.5'].iva) + '</div>' +
      '<div class="total-line"><strong>IVA 0%: $</strong> ' + formatNumero(desglosesIVA['0'].iva) + '</div>' +
      '<div class="total-line"><strong>Importe Otros Tributos: $</strong> 0.00</div>' +
      '<div class="total-final"><strong>Importe Total: $</strong> ' + formatNumero(f.total) + '</div>' +
      '</div>' +
      '</div>' +
      // FOOTER CON QR Y CAE
      '<div class="footer">' +
      '<div class="footer-qr">' +
      '<img src="' + qrUrl + '" alt="QR ARCA" style="width:100px;height:100px">' +
      '<p style="font-weight:bold;margin-top:4px">ARCA</p>' +
      '<p style="font-size:7pt">Comprobante<br>Autorizado</p>' +
      '</div>' +
      '<div class="footer-info">' +
      '<p style="text-align:right"><strong>Pág. 1/1</strong></p>' +
      '<p style="margin-top:8px"><strong>CAE N°:</strong> ' + (f.cae || 'En trámite') + '</p>' +
      '<p><strong>Fecha de Vto. de CAE:</strong> ' + (caeVtoStr || '-') + '</p>' +
      '<p class="disclaimer">' +
      'Esta Administración no se responsabiliza por los datos ingresados en el detalle de la operación' +
      '</p>' +
      '</div>' +
      '</div>' +
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
    var emisor = CONFIG_AFIP.getEmisor();
    var createPayload = {
      automation: automationType,
      params: {
        cuit: config.cuit || emisor.CUIT,
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
    Logger.log('Autorizando web services wsfe y ws_sr_padron_a13...');
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
 * Autoriza los web services necesarios (wsfe y ws_sr_padron_a13) en ARCA
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
    var emisor = CONFIG_AFIP.getEmisor();
    var env = datos.environment || config.environment || 'dev';
    var alias = datos.alias || 'solyverde';
    var cuit = config.cuit || emisor.CUIT;

    // Web services a autorizar
    var webServices = ['wsfe', 'ws_sr_padron_a13'];
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

  // Primera llamada para iniciar el proceso
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    // Verificar si es un error conocido o si necesita polling
    try {
      var errorData = JSON.parse(text);
      if (errorData.status === 'in_process' || errorData.id) {
        // Necesita polling
        return _pollAutorizacion(url, payload, config.accessToken);
      }
      throw new Error(errorData.message || errorData.error || JSON.stringify(errorData.data_errors || errorData));
    } catch (e) {
      if (e.message.indexOf('in_process') >= 0 || e.message.indexOf('id') >= 0) {
        return _pollAutorizacion(url, payload, config.accessToken);
      }
      throw new Error('Error ' + code + ': ' + text.substring(0, 200));
    }
  }

  var result = JSON.parse(text);

  // Si devuelve status in_process, hacer polling
  if (result.status === 'in_process' || (result.id && !result.status)) {
    return _pollAutorizacion(url, payload, config.accessToken, result.id);
  }

  // Si ya está completo
  if (result.status === 'complete' || result.status === 'completed' || result.success) {
    return { success: true };
  }

  // Si hay error
  if (result.status === 'error' || result.status === 'failed') {
    return { success: false, error: result.error || result.message || 'Error desconocido' };
  }

  return { success: true };
}

/**
 * Polling para esperar que la autorización se complete
 * @private
 */
function _pollAutorizacion(url, payload, accessToken, jobId) {
  var maxIntentos = 24; // 120 segundos max

  for (var i = 0; i < maxIntentos; i++) {
    Utilities.sleep(5000);

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

    var response = UrlFetchApp.fetch(url, options);
    var text = response.getContentText();

    try {
      var result = JSON.parse(text);

      if (result.status === 'complete' || result.status === 'completed' || result.success) {
        return { success: true };
      }

      if (result.status === 'error' || result.status === 'failed') {
        return { success: false, error: result.error || result.message || 'Autorización fallida' };
      }

      // Guardar job id para siguiente intento
      if (result.id) {
        jobId = result.id;
      }

      Logger.log('Polling autorizacion... intento ' + (i + 1) + '/' + maxIntentos + ' (estado: ' + result.status + ')');
    } catch (e) {
      Logger.log('Error parseando respuesta polling: ' + e.message);
    }
  }

  return { success: false, error: 'Tiempo de espera agotado para autorización' };
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
 *                         O {cbteTipo, cliente: {nombre, razonSocial, domicilio, condicion, cuit}, items: [{descripcion, cantidad, precioUnitario}], obs}
 */
function emitirFacturaElectronica(datos) {
  try {
    // Normalizar estructura de datos: soportar tanto el formato antiguo como el nuevo
    var datosNormalizados = {};
    
    // Si viene en formato nuevo (con cliente e items), transformar al formato antiguo
    if (datos.cliente && datos.items) {
      datosNormalizados.cbteTipo = datos.cbteTipo;
      datosNormalizados.clienteNombre = datos.cliente.nombre;
      datosNormalizados.clienteRazonSocial = datos.cliente.razonSocial || datos.cliente.nombre;
      datosNormalizados.clienteDomicilio = datos.cliente.domicilio || '';
      datosNormalizados.clienteCondicion = datos.cliente.condicion || 'CF';
      datosNormalizados.clienteCuit = datos.cliente.cuit || '';
      
      // Calcular importeNeto desde items
      var importeNeto = 0;
      if (datos.items && datos.items.length > 0) {
        datos.items.forEach(function(item) {
          var cantidad = parseFloat(item.cantidad) || 0;
          var precioUnitario = parseFloat(item.precioUnitario) || 0;
          importeNeto += cantidad * precioUnitario;
        });
      }
      
      // Para Factura B (tipo 6), el precio unitario incluye IVA, hay que quitarlo
      // Para Factura A (tipo 1), el precio unitario ya está sin IVA
      if (datos.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.FACTURA_B || 
          datos.cbteTipo === CONFIG_AFIP.CBTE_TIPOS.NOTA_CREDITO_B) {
        // Factura B o Nota de Crédito B: el monto incluye IVA, calcular neto
        var ivaConfig = CONFIG_AFIP.getIVA();
        if (!ivaConfig || typeof ivaConfig.MULTIPLICADOR !== 'number') {
          throw new Error('Configuración de IVA no disponible');
        }
        var multiplicadorIVA = ivaConfig.MULTIPLICADOR;
        importeNeto = Math.round(importeNeto / (1 + multiplicadorIVA) * 100) / 100;
      }
      
      datosNormalizados.importeNeto = importeNeto;
      datosNormalizados.detalle = datos.items;
      
      // Determinar clienteCondicionTexto
      if (datosNormalizados.clienteCondicion === 'RI') {
        datosNormalizados.clienteCondicionTexto = 'Responsable Inscripto';
      } else if (datosNormalizados.clienteCondicion === 'CF') {
        datosNormalizados.clienteCondicionTexto = 'Consumidor Final';
      } else {
        datosNormalizados.clienteCondicionTexto = datosNormalizados.clienteCondicion;
      }
    } else {
      // Formato antiguo, usar tal cual
      datosNormalizados = datos;
    }
    
    // Validaciones
    if (!datosNormalizados.cbteTipo) throw new Error('Tipo de comprobante requerido');
    if (!datosNormalizados.importeNeto || datosNormalizados.importeNeto <= 0) throw new Error('Importe neto debe ser mayor a 0');
    if (!datosNormalizados.clienteNombre) throw new Error('Nombre del cliente requerido');

    // Para Factura A, validar CUIT
    if ((datosNormalizados.cbteTipo === 1 || datosNormalizados.cbteTipo === 3) && !datosNormalizados.clienteCuit) {
      throw new Error('Factura/NC tipo A requiere CUIT del cliente');
    }

    // Limpiar CUIT
    var cuitLimpio = datosNormalizados.clienteCuit ? String(datosNormalizados.clienteCuit).replace(/[-\s]/g, '') : '';

    // Emitir en ARCA
    var resultado = AfipService.emitirComprobante({
      cbteTipo: datosNormalizados.cbteTipo,
      clienteCuit: cuitLimpio,
      importeNeto: datosNormalizados.importeNeto,
      cbteAsocTipo: datosNormalizados.cbteAsocTipo || null,
      cbteAsocNro: datosNormalizados.cbteAsocNro || null,
      cbteAsocFecha: datosNormalizados.cbteAsocFecha || null
    });

    // Registrar en hoja
    var facturaId = FacturasRepository.registrar({
      cbteTipo: resultado.cbteTipo,
      cbteNro: resultado.cbteNro,
      ptoVta: resultado.ptoVta,
      clienteNombre: datosNormalizados.clienteNombre,
      clienteRazonSocial: datosNormalizados.clienteRazonSocial || datosNormalizados.clienteNombre,
      clienteDomicilio: datosNormalizados.clienteDomicilio || '',
      clienteCuit: cuitLimpio,
      clienteCondicion: datosNormalizados.clienteCondicion || 'CF',
      neto: resultado.neto,
      iva: resultado.iva,
      total: resultado.total,
      cae: resultado.cae,
      caeVto: resultado.caeVto,
      estado: 'EMITIDA',
      detalle: datosNormalizados.detalle || []
    });

    // Generar PDF
    var pdfUrl = FacturaPDF.generar({
      cbteTipo: resultado.cbteTipo,
      cbteNro: resultado.cbteNro,
      ptoVta: resultado.ptoVta,
      fecha: resultado.fecha,
      clienteNombre: datosNormalizados.clienteNombre,
      clienteRazonSocial: datosNormalizados.clienteRazonSocial || datosNormalizados.clienteNombre,
      clienteDomicilio: datosNormalizados.clienteDomicilio || '',
      clienteCuit: cuitLimpio,
      clienteCondicion: datosNormalizados.clienteCondicion || 'CF',
      clienteCondicionTexto: datosNormalizados.clienteCondicionTexto || datosNormalizados.clienteCondicion || 'Consumidor Final',
      neto: resultado.neto,
      iva: resultado.iva,
      total: resultado.total,
      cae: resultado.cae,
      caeVto: resultado.caeVto,
      detalle: datosNormalizados.detalle || []
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
