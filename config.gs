/**
 * ============================================================================
 * CONFIGURACION GLOBAL - SISTEMA SOL & VERDE
 * ============================================================================
 * Sistema de Cuenta Corriente para gestion de clientes y movimientos
 * Version: 2.0.0
 * ============================================================================
 */

var CONFIG = {
  SISTEMA: {
    NOMBRE: 'Sol & Verde',
    VERSION: '2.0.0'
  },

  // Nombres de las hojas de Google Sheets
  HOJAS: {
    CLIENTES: 'CLIENTES',
    MOVIMIENTOS: 'MOVIMIENTOS',
    CAJA_ARQUEOS: 'CAJA_ARQUEOS',
    CONFIGURACION: 'CONFIGURACION',
    ALQUILERES: 'ALQUILERES',
    ALQUILERES_CONFIG: 'ALQUILERES_CONFIG',
    // Contabilidad - Caja Diaria
    CAJA_DIARIA: 'CAJA_DIARIA',
    CAJA_MOV_MANUAL: 'CAJA_MOV_MANUAL'
  },

  // Configuracion base para los nuevos modulos logisticos
  //
  // El PIN NO vive aqui. Antes estaba escrito literalmente en este archivo,
  // lo que lo hacia publico para cualquiera que viera el repositorio en
  // GitHub. Ahora se guarda unicamente en la propiedad de script
  // PIN_MODULOS_EXTRA, que se configura desde Configuracion > Logistica y
  // nunca se versiona.
  MODULOS_EXTRA: {
    ENVASES_DEFAULT: [
      { id: 'E1', nombre: 'Jaulas', valor: 5000 },
      { id: 'E2', nombre: 'Bandejas Rúcula', valor: 4000 },
      { id: 'E3', nombre: 'Cajones ST', valor: 4000 },
      { id: 'E4', nombre: 'S/S', valor: 0 }
    ]
  },

  // Indices de columnas para CLIENTES (0-based)
  COLS_CLIENTES: {
    NOMBRE: 0,      // A: String, UPPERCASE, clave primaria (Nombre de Fantasía)
    TEL: 1,         // B: String
    EMAIL: 2,       // C: String
    LIMITE: 3,      // D: Number (limite de credito)
    SALDO: 4,       // E: Number (calculado automatico)
    TOTAL_MOVS: 5,  // F: Number (contador)
    ALTA: 6,        // G: Date
    ULTIMO_MOV: 7,  // H: Date
    OBS: 8,         // I: String
    CUIT: 9,        // J: String (XX-XXXXXXXX-X)
    CONDICION_FISCAL: 10,  // K: String (Consumidor Final / Responsable Inscripto)
    RAZON_SOCIAL: 11,      // L: String (Razón Social del contribuyente - para RI)
    DOMICILIO_FISCAL: 12   // M: String (Domicilio Fiscal completo - para facturas)
  },

  /**
   * Convención: usar siempre CONFIG.COLS_* / COLS_MOVS / COLS_CLIENTES
   * en código nuevo en lugar de literales de columna (plan optimización #27).
   * Transferencias: ver CONFIG_FACTURACION.COLS_TRANSFERENCIAS en facturacion.gs
   */
  // Indices de columnas para MOVIMIENTOS (0-based)
  COLS_MOVS: {
    ID: 0,          // A: Number autoincremental
    FECHA: 1,       // B: Date
    CLIENTE: 2,     // C: String, UPPERCASE
    TIPO: 3,        // D: "DEBE" o "HABER"
    MONTO: 4,       // E: Number positivo
    SALDO_POST: 5,  // F: Number (saldo despues del movimiento)
    OBS: 6,         // G: String
    USUARIO: 7      // H: Email (auditoria)
  },

  // Indices de columnas para CAJA_ARQUEOS (0-based)
  COLS_CAJA: {
    ID: 0,          // A: Number autoincremental
    FECHA: 1,       // B: Date
    SESION_ID: 2,   // C: String (identificador de sesion)
    TIPO: 3,        // D: String (tipo de registro)
    DESCRIPCION: 4, // E: String
    MONTO: 5,       // F: Number
    USUARIO: 6,     // G: Email
    TIMESTAMP: 7,   // H: DateTime
    DETALLE_JSON: 8 // I: String (JSON con items del remito, solo en filas de PROVEEDOR)
  },

  // Indices de columnas para CAJA_DIARIA (0-based)
  COLS_CAJA_DIARIA: {
    ID: 0,                // A: Number autoincremental
    FECHA: 1,             // B: Date
    CAJA_INICIAL: 2,      // C: Number (saldo al abrir)
    CAJA_FINAL: 3,        // D: Number (saldo físico al cerrar)
    ESTADO: 4,            // E: 'ABIERTA' | 'CERRADA'
    CAJA_SIGUIENTE: 5,    // F: Number (propuesto para la caja del dia siguiente)
    RAZON_REAPERTURA: 6,  // G: String (motivo de reapertura, obligatorio)
    RAZON_DIFERENCIA: 7,  // H: String (motivo de diferencia al cerrar)
    USUARIO: 8,           // I: Email del usuario que opera
    TIMESTAMP_APERTURA: 9,  // J: DateTime
    TIMESTAMP_CIERRE: 10    // K: DateTime
  },

  // Indices de columnas para CAJA_MOV_MANUAL (0-based)
  COLS_CAJA_MOV: {
    ID: 0,           // A: Number autoincremental
    CAJA_ID: 1,      // B: FK a CAJA_DIARIA.ID
    TIPO: 2,         // C: 'HABER' (ingreso) | 'DEBE' (egreso)
    DESCRIPCION: 3,  // D: String
    MONTO: 4,        // E: Number positivo (monto negativo = prohibido)
    USUARIO: 5,      // F: Email
    TIMESTAMP: 6     // G: DateTime
  },

  // Estados posibles de una Caja Diaria
  ESTADOS_CAJA: {
    ABIERTA: 'ABIERTA',
    CERRADA: 'CERRADA'
  },

  // Indices de columnas para ALQUILERES (0-based)
  COLS_ALQUILERES: {
    ID: 0,              // A: Number autoincremental
    FECHA: 1,           // B: Date
    INQUILINO: 2,       // C: String UPPERCASE
    TIPO: 3,            // D: PAGO_SEMANAL, FACTURA_MENSUAL, AJUSTE
    MONTO: 4,           // E: Number
    SEMANA: 5,          // F: Number (1-53)
    ANIO: 6,            // G: Number (2026...)
    MES: 7,             // H: Number (1-12)
    SEMANAS_CUBIERTAS: 8, // I: String "1,2,3"
    OBS: 9,             // J: String
    TIMESTAMP: 10       // K: DateTime
  },

  // Indices de columnas para ALQUILERES_CONFIG (0-based)
  COLS_ALQ_CONFIG: {
    INQUILINO: 0,       // A: String UPPERCASE
    MONTO_SEMANAL: 1,   // B: Number
    AJUSTE_OBRA: 2,     // C: Number (+ suma al alquiler)
    AJUSTE_MERCADERIA: 3, // D: Number (- resta al alquiler)
    SALDO: 4,           // E: Number
    ULTIMO_PAGO: 5,     // F: Date
    OBS: 6              // G: String
  },

  // Tipos de movimiento
  // DEBE = FIADO (aumenta saldo del cliente - nos debe mas)
  // HABER = PAGO (disminuye saldo del cliente - nos pago)
  TIPOS_MOVIMIENTO: {
    DEBE: 'DEBE',   // FIADO
    HABER: 'HABER'  // PAGO
  },

  // Tipos de movimiento de alquiler
  TIPOS_ALQUILER: {
    PAGO_SEMANAL: 'PAGO_SEMANAL',
    FACTURA_MENSUAL: 'FACTURA_MENSUAL',
    AJUSTE: 'AJUSTE'
  },

  // Inquilinos iniciales
  INQUILINOS: ['ORTIZ JESUS', 'FLORES FLORIBEL'],

  // Tipos de registro de caja
  TIPOS_CAJA: {
    // Billetes (pesos argentinos actualizados)
    BILLETE_20000: 'BILLETE_20000',
    BILLETE_10000: 'BILLETE_10000',
    BILLETE_2000: 'BILLETE_2000',
    BILLETE_1000: 'BILLETE_1000',
    BILLETE_500: 'BILLETE_500',
    BILLETE_200: 'BILLETE_200',
    BILLETE_100: 'BILLETE_100',
    // Otros
    PROVEEDOR: 'PROVEEDOR',
    GASTO_EXTRA: 'GASTO_EXTRA',
    INGRESO: 'INGRESO',
    COBRANZA: 'COBRANZA',
    FIADO_DIA: 'FIADO_DIA'
  },

  // Configuracion de busqueda fuzzy
  FUZZY: {
    MIN_SCORE: 65,
    MAX_SUGERENCIAS: 5,
    PESO_EXACTO: 100,
    PESO_COMIENZA: 85,
    PESO_CONTIENE: 70,
    PESO_LEVENSHTEIN: 50
  },

  // Paginacion
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100
  },

  // Limites de visualizacion (editables desde Configuracion)
  // 0 = sin limite (mostrar todos)
  VISOR: {
    MOVS_DEFAULT: 20,                            // Movimientos que muestra el Visor de Cliente al abrir
    MOVS_OPCIONES: [20, 50, 100, 200, 500, 0],   // Opciones del selector del Visor (0 = Todos)
    MOVS_TABLA: 25,                              // Filas por pagina en el listado de Movimientos
    CLIENTES_TABLA: 50,                          // Filas por pagina en Gestion de Clientes
    AUTOCOMPLETE: 8                              // Sugerencias mostradas en los autocompletados
  },

  // Valores por defecto
  DEFAULTS: {
    LIMITE_CREDITO: 100000,
    SALDO_INICIAL: 0
  },

  // Formato de presentacion de numeros y fechas
  FORMATO: {
    MONEDA_SIMBOLO: '$',
    FORMATO_FECHA: 'DD/MM/AAAA',   // DD/MM/AAAA | AAAA-MM-DD | DD-MM-AAAA
    DECIMALES: 0                   // Decimales a mostrar en los montos
  },

  // Comportamiento de la interfaz
  UI: {
    DURACION_AVISO: 3000,          // ms que dura un aviso en pantalla
    FILAS_POR_PAGINA: 25,          // Filas por pagina en las tablas con paginador
    TAMANIO_FUENTE: 100,           // Escala de la tipografia, en porcentaje
    TEMA_INICIAL: 'light'          // light | dark
  },

  // Reglas del negocio
  NEGOCIO: {
    ALERTA_SALDO: 0,               // Saldo desde el que se destaca un cliente. 0 = usar su limite
    DIAS_INACTIVO: 60,             // Dias sin movimientos para considerarlo inactivo
    DIAS_BACKUP: 1,                // Cada cuantos dias se espera un respaldo
    RETENCION_BACKUP: 30           // Dias que se conservan los respaldos
  },

  // Configuracion del OCR gratuito (sin IA ni API de pago)
  OCR: {
    IDIOMA: 'es',             // FIJO: solo español. getOcr() lo fuerza, no se configura
    MOTOR_SERVIDOR: true,     // OCR de Drive (gratis, usa el motor de Google)
    MOTOR_NAVEGADOR: true,    // Tesseract.js (gratis, aporta posicion de palabras)
    CONFIANZA_MINIMA: 60,     // Debajo de este valor la celda se marca para revision
    BINARIZACION: 20,         // Agresividad del umbral adaptativo (0-50)
    ANCHO_MAXIMO: 2000,       // Redimensionado previo, en pixeles
    AUTO_ROTAR: true,         // Corregir inclinacion antes de reconocer
    REINTENTOS: 3,            // Vueltas de relectura de las filas sin coincidencia (0 = no reintenta)
    PRESUPUESTO_SEG: 45,      // Tope de tiempo para todos los reintentos juntos
    UMBRAL_NOMBRE: 90         // Parecido (%) para aceptar un nombre solo, sin preguntar
  },

  // Colores del sistema (para referencia en el frontend)
  COLORES: {
    PRIMARIO: '#2E7D32',
    SECUNDARIO: '#FF6F00',
    EXITO: '#4CAF50',
    PELIGRO: '#C62828',
    ADVERTENCIA: '#FBC02D',
    INFO: '#00ACC1'
  },

  // Configuracion de impresion
  PRINT: {
    FONT_SIZE_SALDOS: 10,   // Tamaño de fuente en pt para impresión de saldos
    FONT_SIZE_HEADER: 14,   // Tamaño de fuente en pt para encabezados de impresión
    ORIENTATION: 'portrait', // Orientación de página (portrait/landscape)
    SCALE: 100,             // Escala de impresión (%)
    MARGIN: 0.8,            // Márgenes de página (cm)
    FIT_TO_WIDTH: false,    // Ajustar al ancho de página
    PAGE_MODE: 'auto',      // auto | single | multi
    SHOW_LOGO: true,        // Mostrar logo en impresiones
    SHOW_COMPANY: true,     // Mostrar nombre de empresa
    FOOTER: '',             // Texto de pie de página personalizado
    PAGE_BREAK: false       // Forzar salto de página entre secciones
  },

  /**
   * Obtiene una configuración, priorizando ScriptProperties sobre valores por defecto
   * @param {string} key - Clave de la propiedad
   * @param {*} defaultValue - Valor por defecto si no existe en ScriptProperties
   * @returns {*} Valor configurado o por defecto
   */
  get: function(key, defaultValue) {
    try {
      const props = PropertiesService.getScriptProperties();
      const value = props.getProperty(key);
      return value !== null ? value : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  },

  /**
   * Obtiene el límite de crédito por defecto
   */
  getLimiteCredito: function() {
    const value = this.get('LIMITE_CREDITO_DEFAULT', this.DEFAULTS.LIMITE_CREDITO);
    return parseFloat(value);
  },

  /**
   * Obtiene la configuración de IVA
   */
  getIVA: function() {
    const porcentaje = parseFloat(this.get('IVA_PORCENTAJE', '10.5'));
    return {
      PORCENTAJE: porcentaje,
      MULTIPLICADOR: porcentaje / 100
    };
  },

  /**
   * Obtiene la configuración del OCR gratuito.
   * Todo valor inválido cae al valor por defecto, nunca a NaN.
   * @returns {Object} Configuración normalizada del OCR
   */
  getOcr: function() {
    const self = this;
    function entero(clave, porDefecto, minimo, maximo) {
      const valor = parseInt(self.get(clave, porDefecto), 10);
      if (isNaN(valor) || valor < minimo || valor > maximo) return porDefecto;
      return valor;
    }
    function booleano(clave, porDefecto) {
      return self.get(clave, porDefecto.toString()) !== 'false';
    }
    return {
      // El idioma es siempre español. Antes se podia escribir cualquiera (y
      // 'es+en' mezclaba el ingles, que solo mete ruido al leer nombres): ahora
      // se ignora lo que haya guardado en OCR_IDIOMA.
      IDIOMA:           'es',
      MOTOR_SERVIDOR:   booleano('OCR_MOTOR_SERVIDOR',  this.OCR.MOTOR_SERVIDOR),
      MOTOR_NAVEGADOR:  booleano('OCR_MOTOR_NAVEGADOR', this.OCR.MOTOR_NAVEGADOR),
      CONFIANZA_MINIMA: entero('OCR_CONFIANZA_MINIMA', this.OCR.CONFIANZA_MINIMA, 0, 100),
      BINARIZACION:     entero('OCR_BINARIZACION',     this.OCR.BINARIZACION, 0, 50),
      ANCHO_MAXIMO:     entero('OCR_ANCHO_MAXIMO',     this.OCR.ANCHO_MAXIMO, 600, 5000),
      AUTO_ROTAR:       booleano('OCR_AUTO_ROTAR',     this.OCR.AUTO_ROTAR),
      REINTENTOS:       entero('OCR_REINTENTOS',       this.OCR.REINTENTOS, 0, 6),
      PRESUPUESTO_SEG:  entero('OCR_PRESUPUESTO_SEG',  this.OCR.PRESUPUESTO_SEG, 10, 180),
      UMBRAL_NOMBRE:    entero('OCR_UMBRAL_NOMBRE',    this.OCR.UMBRAL_NOMBRE, 60, 100)
    };
  },

  /**
   * Obtiene la configuración de Fuzzy Search
   */
  getFuzzy: function() {
    return {
      MIN_SCORE: parseInt(this.get('FUZZY_MIN_SCORE', this.FUZZY.MIN_SCORE)),
      MAX_SUGERENCIAS: parseInt(this.get('FUZZY_MAX_SUGERENCIAS', this.FUZZY.MAX_SUGERENCIAS)),
      PESO_EXACTO: parseInt(this.get('FUZZY_PESO_EXACTO', this.FUZZY.PESO_EXACTO)),
      PESO_COMIENZA: parseInt(this.get('FUZZY_PESO_COMIENZA', this.FUZZY.PESO_COMIENZA)),
      PESO_CONTIENE: parseInt(this.get('FUZZY_PESO_CONTIENE', this.FUZZY.PESO_CONTIENE)),
      PESO_LEVENSHTEIN: parseInt(this.get('FUZZY_PESO_LEVENSHTEIN', this.FUZZY.PESO_LEVENSHTEIN))
    };
  },

  /**
   * Obtiene la configuración de paginación
   */
  getPagination: function() {
    return {
      DEFAULT_PAGE_SIZE: parseInt(this.get('PAGINATION_DEFAULT_SIZE', this.PAGINATION.DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE: parseInt(this.get('PAGINATION_MAX_SIZE', this.PAGINATION.MAX_PAGE_SIZE))
    };
  },

  /**
   * Obtiene los limites de visualizacion configurables.
   * Cualquier valor invalido cae al valor por defecto, nunca a NaN.
   * MOVS_DEFAULT = 0 significa "mostrar todos".
   * @returns {Object} Limites normalizados
   */
  getVisor: function() {
    const self = this;
    function entero(clave, porDefecto, minimo, maximo) {
      const valor = parseInt(self.get(clave, porDefecto), 10);
      if (isNaN(valor) || valor < minimo || valor > maximo) return porDefecto;
      return valor;
    }
    return {
      MOVS_DEFAULT:   entero('VISOR_MOVS_DEFAULT',   this.VISOR.MOVS_DEFAULT,   0, 100000),
      MOVS_TABLA:     entero('VISOR_MOVS_TABLA',     this.VISOR.MOVS_TABLA,     1, 1000),
      CLIENTES_TABLA: entero('VISOR_CLIENTES_TABLA', this.VISOR.CLIENTES_TABLA, 1, 1000),
      AUTOCOMPLETE:   entero('VISOR_AUTOCOMPLETE',   this.VISOR.AUTOCOMPLETE,   1, 50),
      MOVS_OPCIONES:  this.VISOR.MOVS_OPCIONES
    };
  },

  /**
   * Obtiene el formato de presentacion de montos y fechas.
   * @returns {Object} Formato normalizado
   */
  getFormato: function() {
    const simbolo = String(this.get('FORMATO_MONEDA', this.FORMATO.MONEDA_SIMBOLO)).trim();
    const formatoFecha = String(this.get('FORMATO_FECHA', this.FORMATO.FORMATO_FECHA)).trim().toUpperCase();
    const validos = ['DD/MM/AAAA', 'AAAA-MM-DD', 'DD-MM-AAAA'];
    let decimales = parseInt(this.get('FORMATO_DECIMALES', this.FORMATO.DECIMALES), 10);
    if (isNaN(decimales) || decimales < 0 || decimales > 2) decimales = this.FORMATO.DECIMALES;
    return {
      MONEDA_SIMBOLO: (simbolo && simbolo.length <= 5) ? simbolo : this.FORMATO.MONEDA_SIMBOLO,
      FORMATO_FECHA:  validos.indexOf(formatoFecha) > -1 ? formatoFecha : this.FORMATO.FORMATO_FECHA,
      DECIMALES:      decimales
    };
  },

  /**
   * Obtiene los ajustes de comportamiento de la interfaz.
   * @returns {Object} Ajustes normalizados
   */
  getUI: function() {
    const self = this;
    function entero(clave, porDefecto, minimo, maximo) {
      const valor = parseInt(self.get(clave, porDefecto), 10);
      if (isNaN(valor) || valor < minimo || valor > maximo) return porDefecto;
      return valor;
    }
    const tema = String(this.get('UI_TEMA_INICIAL', this.UI.TEMA_INICIAL)).trim().toLowerCase();
    return {
      DURACION_AVISO:   entero('UI_DURACION_AVISO',   this.UI.DURACION_AVISO,   500, 30000),
      FILAS_POR_PAGINA: entero('UI_FILAS_POR_PAGINA', this.UI.FILAS_POR_PAGINA, 5, 500),
      TAMANIO_FUENTE:   entero('UI_TAMANIO_FUENTE',   this.UI.TAMANIO_FUENTE,   70, 150),
      TEMA_INICIAL:     (tema === 'dark') ? 'dark' : 'light'
    };
  },

  /**
   * Obtiene las reglas del negocio.
   * @returns {Object} Reglas normalizadas
   */
  getNegocio: function() {
    const self = this;
    function entero(clave, porDefecto, minimo, maximo) {
      const valor = parseInt(self.get(clave, porDefecto), 10);
      if (isNaN(valor) || valor < minimo || valor > maximo) return porDefecto;
      return valor;
    }
    return {
      ALERTA_SALDO:      entero('NEGOCIO_ALERTA_SALDO',      this.NEGOCIO.ALERTA_SALDO,      0, 100000000),
      DIAS_INACTIVO:     entero('NEGOCIO_DIAS_INACTIVO',     this.NEGOCIO.DIAS_INACTIVO,     1, 3650),
      DIAS_BACKUP:       entero('NEGOCIO_DIAS_BACKUP',       this.NEGOCIO.DIAS_BACKUP,       1, 365),
      RETENCION_BACKUP:  entero('NEGOCIO_RETENCION_BACKUP',  this.NEGOCIO.RETENCION_BACKUP,  1, 3650)
    };
  },

  /**
   * Obtiene las denominaciones de billetes para el arqueo.
   *
   * Antes estaban fijas en el codigo (var DENOMINACIONES), asi que cada vez
   * que el Banco Central saca o retira un billete habia que editar el archivo
   * y volver a desplegar. Ahora se pueden editar desde Configuracion.
   *
   * @returns {Array<{tipo: string, valor: number, nombre: string}>}
   */
  getDenominaciones: function() {
    try {
      const guardado = this.get('DENOMINACIONES_BILLETES', '');
      if (guardado) {
        const lista = JSON.parse(guardado);
        if (Array.isArray(lista) && lista.length > 0) {
          const validas = lista
            .map(function(d) {
              const valor = Number(d && d.valor);
              if (!isFinite(valor) || valor <= 0) return null;
              return {
                tipo: 'BILLETE_' + Math.round(valor),
                valor: Math.round(valor),
                nombre: String((d && d.nombre) || ('Billete $' + Math.round(valor)))
              };
            })
            .filter(function(d) { return d !== null; })
            .sort(function(a, b) { return b.valor - a.valor; });
          if (validas.length > 0) return validas;
        }
      }
    } catch (e) {
      Logger.log('[CONFIG] Denominaciones guardadas ilegibles, se usan las de fábrica: ' + e.message);
    }
    return DENOMINACIONES.BILLETES.slice();
  },

  /**
   * Obtiene la lista de inquilinos
   */
  getInquilinos: function() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const hoja = ss.getSheetByName(this.HOJAS.ALQUILERES_CONFIG);
      if (hoja && hoja.getLastRow() > 1) {
        const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
        const inquilinos = datos
          .map(fila => String(fila[0] || '').trim().toUpperCase())
          .filter(nombre => nombre.length > 0);
        if (inquilinos.length > 0) return inquilinos;
      }
    } catch (e) {
      Logger.log('[CONFIG] Error al leer inquilinos de hoja: ' + e.message + '. Usando lista por defecto.');
    }
    // Fallback al array fijo si la hoja no existe o está vacía
    return ['ORTIZ JESUS', 'FLORES FLORIBEL'];
  },

  /**
   * Obtiene la configuración de impresión
   */
  getPrint: function() {
    return {
      FONT_SIZE_SALDOS: parseInt(this.get('PRINT_FONT_SIZE_SALDOS', this.PRINT.FONT_SIZE_SALDOS)),
      FONT_SIZE_HEADER: parseInt(this.get('PRINT_FONT_SIZE_HEADER', this.PRINT.FONT_SIZE_HEADER)),
      ORIENTATION: this.get('PRINT_ORIENTATION', this.PRINT.ORIENTATION),
      SCALE: parseInt(this.get('PRINT_SCALE', this.PRINT.SCALE)),
      MARGIN: parseFloat(this.get('PRINT_MARGIN', this.PRINT.MARGIN)),
      FIT_TO_WIDTH: this.get('PRINT_FIT_TO_WIDTH', this.PRINT.FIT_TO_WIDTH.toString()) === 'true',
      PAGE_MODE: this.get('PRINT_PAGE_MODE', this.PRINT.PAGE_MODE),
      SHOW_LOGO: this.get('PRINT_SHOW_LOGO', this.PRINT.SHOW_LOGO.toString()) !== 'false',
      SHOW_COMPANY: this.get('PRINT_SHOW_COMPANY', this.PRINT.SHOW_COMPANY.toString()) !== 'false',
      FOOTER: this.get('PRINT_FOOTER', this.PRINT.FOOTER),
      PAGE_BREAK: this.get('PRINT_PAGE_BREAK', this.PRINT.PAGE_BREAK.toString()) === 'true'
    };
  }
};

// Denominaciones de billetes (pesos argentinos - solo billetes)
var DENOMINACIONES = {
  BILLETES: [
    { tipo: 'BILLETE_20000', valor: 20000, nombre: 'Billete $20.000' },
    { tipo: 'BILLETE_10000', valor: 10000, nombre: 'Billete $10.000' },
    { tipo: 'BILLETE_2000', valor: 2000, nombre: 'Billete $2.000' },
    { tipo: 'BILLETE_1000', valor: 1000, nombre: 'Billete $1.000' },
    { tipo: 'BILLETE_500', valor: 500, nombre: 'Billete $500' },
    { tipo: 'BILLETE_200', valor: 200, nombre: 'Billete $200' },
    { tipo: 'BILLETE_100', valor: 100, nombre: 'Billete $100' }
  ],
  MONEDAS: [] // Sin monedas segun requerimiento
};

// ============================================================================
// FASE 5: CONFIGURACIÓN VISUAL (colores personalizados + módulos ocultos)
// ============================================================================

/**
 * Obtiene la configuración visual guardada (colores CSS y módulos ocultos).
 * @returns {{ success: boolean, config: Object|null }}
 */
function obtenerConfiguracionVisual() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('sv_config_visual');
    return { success: true, config: raw ? JSON.parse(raw) : null };
  } catch (e) {
    return { success: false, config: null };
  }
}

/**
 * Guarda la configuración visual (colores y módulos visibles).
 * @param {string} configJSON - JSON stringificado con { colores, modulosOcultos }
 * @returns {{ success: boolean }}
 */
function guardarConfiguracionVisualBackend(configJSON) {
  try {
    PropertiesService.getScriptProperties().setProperty('sv_config_visual', configJSON);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
