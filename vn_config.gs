/**
 * ============================================================================
 * VENTA NOCTURNA - CONFIGURACIÓN
 * ============================================================================
 * 
 * Configuración del módulo Venta Nocturna
 * Todas las constantes son globales (Google Apps Script no soporta módulos)
 */

const VN_BANK_NAMES = ['Santander Río', 'Mercado Pago', 'Macro'];

const VN_EMPTY_VALUES_CONFIG = [2000, 3000, 4000, 5000];

const VN_PRINTER_SETTINGS = {
  printerType: 'Thermal',
  resolution: '300dpi',
  duplex: false
};

const VN_SHEET_NAMES = {
  main: 'VN_VENTAS',
  cierres: 'VN_CIERRES',
  config: 'VN_CONFIG'
};

const VN_COLUMN_INDICES = {
  bankName: 0,
  emptyValue: 1,
  settings: 2
};

const VN_MODULE_CONSTANTS = {
  maxTransactionLimit: 10000,
  minTransactionLimit: 100,
  defaultCurrency: 'ARS'
};

// Nota: En Google Apps Script, todas las constantes son automáticamente globales
// No se necesita module.exports