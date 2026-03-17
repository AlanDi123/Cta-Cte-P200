/**
 * ============================================================================
 * FACTURACION ELECTRONICA ARCA - SISTEMA SOL & VERDE
 * ============================================================================
 * Wrapper de compatibilidad para la nueva capa AFIP
 * Todas las funciones delegan a /afip/*.gs
 * ============================================================================
 */

// ============================================================================
// WRAPPERS DE COMPATIBILIDAD - AFIP SDK
 * ============================================================================

/**
 * Consulta datos de un CUIT en el padrón de AFIP
 * @param {string} cuit - CUIT a consultar (sin guiones)
 * @returns {Object} Datos del contribuyente
 */
function afipConsultarCUITWrapper(cuit) {
  try {
    // Delegar a la nueva implementación
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
 * Emite una factura electrónica
 * @param {Object} datosFactura - Datos de la factura
 * @returns {Object} {success, cae, caeVencimiento, cbteNro, mensaje}
 */
function afipEmitirFacturaWrapper(datosFactura) {
  try {
    // Delegar a la nueva implementación
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
 * Verifica la configuración de AFIP
 * @returns {Object} {configurado, tieneCertificado, error}
 */
function afipVerificarConfiguracionWrapper() {
  return afipVerificarConfiguracion();
}

/**
 * Obtiene configuración del emisor
 * @returns {Object} Datos del emisor
 */
function afipGetEmisorConfigWrapper() {
  return afipGetEmisorConfig();
}

/**
 * Obtiene credenciales de AFIP SDK
 * @returns {Object} Credenciales
 */
function afipGetCredentialsWrapper() {
  return afipGetCredentials();
}

/**
 * Verifica si hay certificado configurado
 * @returns {boolean} True si hay certificado válido
 */
function afipTieneCertificadoWrapper() {
  return afipTieneCertificado();
}

// ============================================================================
// FUNCIONES DE UTILIDAD PARA FACTURACION
 * ============================================================================

/**
 * Valida datos de cliente para facturación electrónica
 * @param {Object} cliente - Datos del cliente
 * @param {string} tipoComprobante - 'A' o 'B'
 * @returns {{valid: boolean, errors: Array, advertencias: Array}}
 */
function validarClienteFacturacion(cliente, tipoComprobante) {
  const errors = [];
  const advertencias = [];
  const tipo = (tipoComprobante || 'B').toUpperCase();

  // Validación básica de nombre
  if (!cliente.nombre || typeof cliente.nombre !== 'string' || cliente.nombre.trim() === '') {
    errors.push('Nombre del cliente es requerido');
    return { valid: false, errors: errors, advertencias: advertencias };
  }

  // Si tiene CUIT, validarlo con algoritmo oficial
  if (cliente.cuit) {
    const validacionCUIT = validarCUIT(cliente.cuit);
    if (!validacionCUIT.valido) {
      errors.push('CUIT inválido: ' + validacionCUIT.error);
    }
  }

  // Para Factura A: CUIT obligatorio y debe ser RI o Monotributista
  if (tipo === 'A') {
    if (!cliente.cuit) {
      errors.push('Factura A requiere CUIT del cliente');
    } else if (!cliente.condicionFiscal ||
               (cliente.condicionFiscal !== 'RI' &&
                cliente.condicionFiscal !== 'Responsable Inscripto' &&
                cliente.condicionFiscal !== 'M' &&
                cliente.condicionFiscal !== 'Monotributista' &&
                cliente.condicionFiscal !== 'Monotributo')) {
      errors.push('Factura A requiere cliente RI o Monotributista. Condición actual: ' + (cliente.condicionFiscal || 'No especificada'));
    }

    // Para RI/Monotributo, razón social es obligatoria
    if (!cliente.razonSocial || cliente.razonSocial.trim() === '') {
      errors.push('Cliente RI/Monotributista requiere razón social');
    }
  }

  // Para Factura B con CUIT: NO exigir razón social ni domicilio (Consumidor Final válido)
  if (tipo === 'B' && cliente.cuit) {
    const esConsumidorFinal = !cliente.condicionFiscal ||
                              cliente.condicionFiscal === 'CF' ||
                              cliente.condicionFiscal === 'Consumidor Final';

    if (esConsumidorFinal) {
      // VÁLIDO: CF con CUIT sin razón social ni domicilio
      if (!cliente.razonSocial || cliente.razonSocial.trim() === '') {
        advertencias.push('Cliente CF con CUIT sin razón social. Se usará el nombre como razón social.');
      }
      if (!cliente.domicilioFiscal || cliente.domicilioFiscal.trim() === '') {
        advertencias.push('Cliente CF con CUIT sin domicilio fiscal. No requerido para Consumidor Final.');
      }
    }
  }

  return { valid: errors.length === 0, errors: errors, advertencias: advertencias };
}
