// Venta Nocturna Module Configuration

const BANK_NAMES = ['Santander Río', 'Mercado Pago', 'Macro'];

const EMPTY_VALUES_CONFIG = [2000, 3000, 4000, 5000];

const PRINTER_SETTINGS = {
    printerType: 'Thermal',
    resolution: '300dpi',
    duplex: false
};

const SHEET_NAMES = {
    main: 'MainSheet',
    settings: 'Settings',
    logs: 'Logs'
};

const COLUMN_INDICES = {
    bankName: 0,
    emptyValue: 1,
    settings: 2
};

const MODULE_CONSTANTS = {
    maxTransactionLimit: 10000,
    minTransactionLimit: 100,
    defaultCurrency: 'ARS'
};

module.exports = {
    BANK_NAMES,
    EMPTY_VALUES_CONFIG,
    PRINTER_SETTINGS,
    SHEET_NAMES,
    COLUMN_INDICES,
    MODULE_CONSTANTS
};