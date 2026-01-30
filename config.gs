/**
 * ============================================================================
 * CONFIGURACIÓN GLOBAL - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: config.js
 * Descripción: Constantes y configuración global del sistema
 *
 * ============================================================================
 */

const CONFIG = {
  // Nombres de hojas en Google Sheets
  HOJAS: {
    CLIENTES: 'CLIENTES',
    MOVIMIENTOS: 'MOVIMIENTOS'
  },

  // Índices de columnas en hoja CLIENTES (base 0)
  COLS_CLIENTES: {
    NOMBRE: 0,      // A: String, UPPERCASE, PK
    TEL: 1,         // B: String
    EMAIL: 2,       // C: String
    LIMITE: 3,      // D: Number (default: 100000)
    SALDO: 4,       // E: Number (calculado automático)
    TOTAL_MOVS: 5,  // F: Number (contador)
    ALTA: 6,        // G: Date
    ULTIMO_MOV: 7,  // H: Date
    OBS: 8          // I: String
  },

  // Índices de columnas en hoja MOVIMIENTOS (base 0)
  COLS_MOVS: {
    ID: 0,          // A: Number autoincremental, PK
    FECHA: 1,       // B: Date ISO
    CLIENTE: 2,     // C: String, UPPERCASE, FK
    TIPO: 3,        // D: "DEBE" | "HABER"
    MONTO: 4,       // E: Number positivo
    SALDO_POST: 5,  // F: Number (saldo después del movimiento)
    OBS: 6,         // G: String
    USUARIO: 7      // H: Email (auditoría)
  },

  // Tipos de movimiento válidos
  TIPOS_MOVIMIENTO: {
    DEBE: 'DEBE',
    HABER: 'HABER'
  },

  // Configuración de Claude AI
  CLAUDE: {
    API_URL: 'https://api.anthropic.com/v1/messages',
    MODEL: 'claude-opus-4-5-20251101',
    MAX_TOKENS: 4096,
    VERSION: '2023-06-01'
  },

  // Parámetros de fuzzy matching
  FUZZY: {
    MIN_SCORE: 65,           // Score mínimo para considerar match
    MAX_SUGERENCIAS: 5,      // Máximo de sugerencias a devolver
    PESO_EXACTO: 100,        // Peso para match exacto
    PESO_COMIENZA: 85,       // Peso para "comienza con"
    PESO_CONTIENE: 70,       // Peso para "contiene"
    PESO_LEVENSHTEIN: 50     // Peso base para distancia Levenshtein
  },

  // Claves de PropertiesService
  PROPS: {
    API_KEY: 'CLAUDE_API_KEY'
  },

  // Configuración de cache
  CACHE: {
    CLIENTES_TTL: 60,        // Segundos de cache para clientes
    ENABLED: true             // Habilitar/deshabilitar cache
  },

  // Configuración de paginación
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 50,   // Tamaño de página por defecto (reducido de 100)
    MAX_PAGE_SIZE: 100       // Tamaño máximo de página
  },

  // Configuración de logging
  LOGGING: {
    ENABLED: false,          // Deshabilitar logging verbose en producción
    DEBUG_MODE: false        // Modo debug solo para desarrollo
  }
};

// Configuración específica para Recaudación
const RECAUDACION_CONFIG = {
  HOJA: 'RECAUDACION_EFECTIVO',
  COLS: {
    ID: 0,
    FECHA: 1,
    CLIENTE: 2,
    MONTO: 3,
    FORMA_PAGO: 4,
    OBS: 5,
    USUARIO: 6,
    TIMESTAMP: 7,
    ESTADO: 8
  },
  FORMAS_PAGO: ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'TARJETA', 'OTRO'],
  ESTADOS: ['REGISTRADO', 'DEPOSITADO', 'CONCILIADO']
};