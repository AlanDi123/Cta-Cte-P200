/**
 * ============================================================================
 * AFIP CONFIGURACION - SISTEMA SOL & VERDE
 * ============================================================================
 * Configuración HARD CODED para producción - NO EDITABLE
 * Integración con AFIP SDK REST API
 * ============================================================================
 */

/**
 * Configuración fija de AFIP
 * NO existe modo test / sandbox / homologación
 * NO existe configuración dinámica de environment
 */
var AFIP_CONFIG = {
  /** URL base de AFIP SDK */
  API_URL: 'https://app.afipsdk.com/api/v1/afip',
  
  /** Ambiente: SIEMPRE producción */
  ENVIRONMENT: 'prod',
  
  /** Timeout para requests HTTP (ms) */
  TIMEOUT_MS: 30000,
  
  /** Web services utilizados */
  WS: {
    FE: 'wsfe',           // Facturación electrónica
    PADRON_A13: 'ws_sr_padron_a13'  // Padrón alcance 13
  },
  
  /** Tipos de comprobante */
  CBTE_TIPOS: {
    FACTURA_A: 1,
    NOTA_CREDITO_A: 3,
    FACTURA_B: 6,
    NOTA_CREDITO_B: 8
  },
  
  /** Tipos de documento */
  DOC_TIPOS: {
    CUIT: 80,
    DNI: 96,
    CONSUMIDOR_FINAL: 99
  },
  
  /** Conceptos */
  CONCEPTO: {
    PRODUCTOS: 1,
    SERVICIOS: 2,
    AMBOS: 3
  },
  
  /** Monedas */
  MONEDA: {
    PESOS: 'PES',
    DOLARES: 'DOL'
  },
  
  /** Hoja de registro */
  HOJA_FACTURAS: 'FACTURAS_EMITIDAS'
};

/**
 * Obtiene configuración del emisor desde ScriptProperties
 * @returns {Object} Datos del emisor
 */
function afipGetEmisorConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    CUIT: props.getProperty('EMISOR_CUIT') || '',
    RAZON_SOCIAL: props.getProperty('EMISOR_RAZON_SOCIAL') || '',
    NOMBRE_FANTASIA: props.getProperty('EMISOR_NOMBRE_FANTASIA') || '',
    DOMICILIO: props.getProperty('EMISOR_DOMICILIO') || '',
    INGRESOS_BRUTOS: props.getProperty('EMISOR_IIBB') || '',
    CONDICION_IVA: props.getProperty('EMISOR_CONDICION_IVA') || 'Responsable Inscripto'
  };
}

/**
 * Obtiene credenciales de AFIP SDK desde ScriptProperties
 * @returns {Object} Credenciales
 */
function afipGetCredentials() {
  var props = PropertiesService.getScriptProperties();
  return {
    accessToken: props.getProperty('AFIP_ACCESS_TOKEN') || '',
    puntoVenta: parseInt(props.getProperty('AFIP_PUNTO_VENTA') || '1'),
    cuit: props.getProperty('AFIP_CUIT') || '',
    cert: props.getProperty('AFIP_CERT') || '',
    key: props.getProperty('AFIP_KEY') || ''
  };
}

/**
 * Verifica si hay certificado configurado
 * @returns {boolean} True si hay certificado válido
 */
function afipTieneCertificado() {
  var creds = afipGetCredentials();
  return creds.cert && creds.cert.length > 50 && creds.key && creds.key.length > 50;
}

/**
 * Verifica si AFIP está configurado correctamente
 * @returns {Object} {configurado, tieneCertificado, error}
 */
function afipVerificarConfiguracion() {
  var creds = afipGetCredentials();
  var emisor = afipGetEmisorConfig();
  
  if (!creds.accessToken || creds.accessToken.length < 10) {
    return {
      configurado: false,
      tieneCertificado: false,
      error: 'Access Token de AFIP SDK no configurado'
    };
  }
  
  if (!emisor.CUIT) {
    return {
      configurado: false,
      tieneCertificado: false,
      error: 'CUIT del emisor no configurado'
    };
  }
  
  return {
    configurado: true,
    tieneCertificado: afipTieneCertificado(),
    error: null
  };
}
