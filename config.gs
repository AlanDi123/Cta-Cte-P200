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
    CONFIGURACION: 'CONFIGURACION'
  },

  // Indices de columnas para CLIENTES (0-based)
  COLS_CLIENTES: {
    NOMBRE: 0,      // A: String, UPPERCASE, clave primaria
    TEL: 1,         // B: String
    EMAIL: 2,       // C: String
    LIMITE: 3,      // D: Number (limite de credito)
    SALDO: 4,       // E: Number (calculado automatico)
    TOTAL_MOVS: 5,  // F: Number (contador)
    ALTA: 6,        // G: Date
    ULTIMO_MOV: 7,  // H: Date
    OBS: 8          // I: String
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

  // Tipos de movimiento
  // DEBE = FIADO (aumenta saldo del cliente - nos debe mas)
  // HABER = PAGO (disminuye saldo del cliente - nos pago)
  TIPOS_MOVIMIENTO: {
    DEBE: 'DEBE',   // FIADO
    HABER: 'HABER'  // PAGO
  },

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
