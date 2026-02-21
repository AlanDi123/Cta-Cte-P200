/**
 * ============================================================================
 * CONFIGURACION GLOBAL - SISTEMA SOL & VERDE
 * ============================================================================
 * Sistema de Cuenta Corriente para gestion de clientes y movimientos
 * Version: 2.0.0
 * ============================================================================
 */

const CONFIG = {
  // Nombre del sistema
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
    TIMESTAMP: 7    // H: DateTime
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

  // Valores por defecto
  DEFAULTS: {
    LIMITE_CREDITO: 100000,
    SALDO_INICIAL: 0
  },

  // Configuracion de Claude AI
  CLAUDE: {
    API_URL: 'https://api.anthropic.com/v1/messages',
    MODEL: 'claude-sonnet-4-20250514',
    MAX_TOKENS: 4096,
    VERSION: '2023-06-01'
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
   * Obtiene la configuración de Claude
   */
  getClaude: function() {
    return {
      API_URL: this.CLAUDE.API_URL,
      MODEL: this.get('CLAUDE_MODEL', this.CLAUDE.MODEL),
      MAX_TOKENS: parseInt(this.get('CLAUDE_MAX_TOKENS', this.CLAUDE.MAX_TOKENS)),
      VERSION: this.CLAUDE.VERSION
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
   * Obtiene la lista de inquilinos
   */
  getInquilinos: function() {
    const inquilinosStr = this.get('INQUILINOS', this.INQUILINOS.join(','));
    return inquilinosStr.split(',').map(i => i.trim()).filter(i => i);
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
const DENOMINACIONES = {
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
