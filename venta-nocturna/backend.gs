/**
 * ============================================================================
 * VENTA NOCTURNA - BACKEND
 * ============================================================================
 * 
 * Funciones backend para el módulo de ventas nocturnas
 * Se integra con vn_config.gs para configuración
 */

// ============================================================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================================================

const VN_CONFIG = {
  HOJA_VENTAS: 'VN_VENTAS',
  HOJA_CIERRES: 'VN_CIERRES',
  HOJA_CONFIG: 'VN_CONFIG',
  COLS_VENTAS: {
    ID: 0,
    FECHA: 1,
    BANCO: 2,
    MONTO: 3,
    OBS: 4,
    USUARIO: 5,
    TIMESTAMP: 6,
    CIERRE_ID: 7
  },
  COLS_CIERRES: {
    ID: 0,
    FECHA: 1,
    TOTAL_EFECTIVO: 2,
    TOTAL_TARJETAS: 3,
    TOTAL_GENERAL: 4,
    USUARIO: 5,
    TIMESTAMP: 6,
    OBS: 7
  }
};

// ============================================================================
// REPOSITORY DE VENTAS
// ============================================================================

const VentaNocturnaRepository = {
  /**
   * Obtiene o crea la hoja de ventas
   */
  getHojaVentas: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(VN_CONFIG.HOJA_VENTAS);

    if (!hoja) {
      hoja = ss.insertSheet(VN_CONFIG.HOJA_VENTAS);
      hoja.appendRow([
        'ID', 'FECHA', 'BANCO', 'MONTO', 'OBS', 'USUARIO', 'TIMESTAMP', 'CIERRE_ID'
      ]);
      hoja.getRange(1, 1, 1, 8)
        .setFontWeight('bold')
        .setBackground('#667eea')
        .setFontColor('#FFFFFF');
      Logger.log('[OK] Hoja VN_VENTAS creada');
    }

    return hoja;
  },

  /**
   * Genera ID autoincremental
   */
  generarId: function() {
    const hoja = this.getHojaVentas();
    const ultimaFila = hoja.getLastRow();
    if (ultimaFila <= 1) return 1;
    
    const ultimoId = hoja.getRange(ultimaFila, 1).getValue();
    return (parseInt(ultimoId) || 0) + 1;
  },

  /**
   * Registra una nueva venta
   */
  registrarVenta: function(datos) {
    try {
      const hoja = this.getHojaVentas();
      const id = this.generarId();
      const usuario = Session.getEffectiveUser().getEmail();
      const timestamp = new Date();

      const fila = [
        id,
        datos.fecha || new Date(),
        datos.banco,
        datos.monto,
        datos.obs || '',
        usuario,
        timestamp,
        datos.cierreId || ''
      ];

      hoja.appendRow(fila);

      Logger.log('[VN] Venta registrada: ID ' + id);
      
      return {
        success: true,
        id: id,
        mensaje: 'Venta registrada correctamente'
      };
    } catch (error) {
      Logger.log('[VN ERROR] Error al registrar venta: ' + error.message);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Obtiene ventas por rango de fechas
   */
  obtenerVentasPorRango: function(desde, hasta) {
    try {
      const hoja = this.getHojaVentas();
      const datos = hoja.getDataRange().getValues();

      if (datos.length <= 1) return [];

      const fechaDesde = new Date(desde);
      fechaDesde.setHours(0, 0, 0, 0);
      const fechaHasta = new Date(hasta);
      fechaHasta.setHours(23, 59, 59, 999);

      const ventas = [];

      for (let i = 1; i < datos.length; i++) {
        const fila = datos[i];
        const fechaVenta = new Date(fila[VN_CONFIG.COLS_VENTAS.FECHA]);

        if (fechaVenta >= fechaDesde && fechaVenta <= fechaHasta) {
          ventas.push({
            id: fila[VN_CONFIG.COLS_VENTAS.ID],
            fecha: fila[VN_CONFIG.COLS_VENTAS.FECHA] instanceof Date 
              ? fila[VN_CONFIG.COLS_VENTAS.FECHA].toISOString() 
              : fila[VN_CONFIG.COLS_VENTAS.FECHA],
            banco: fila[VN_CONFIG.COLS_VENTAS.BANCO],
            monto: fila[VN_CONFIG.COLS_VENTAS.MONTO],
            obs: fila[VN_CONFIG.COLS_VENTAS.OBS] || '',
            usuario: fila[VN_CONFIG.COLS_VENTAS.USUARIO] || '',
            cierreId: fila[VN_CONFIG.COLS_VENTAS.CIERRE_ID] || ''
          });
        }
      }

      return ventas;
    } catch (error) {
      Logger.log('[VN ERROR] Error al obtener ventas: ' + error.message);
      return [];
    }
  },

  /**
   * Obtiene ventas por banco
   */
  obtenerVentasPorBanco: function(banco) {
    try {
      const hoja = this.getHojaVentas();
      const datos = hoja.getDataRange().getValues();

      if (datos.length <= 1) return [];

      const ventas = [];

      for (let i = 1; i < datos.length; i++) {
        const fila = datos[i];
        if (fila[VN_CONFIG.COLS_VENTAS.BANCO] === banco) {
          ventas.push({
            id: fila[VN_CONFIG.COLS_VENTAS.ID],
            fecha: fila[VN_CONFIG.COLS_VENTAS.FECHA] instanceof Date 
              ? fila[VN_CONFIG.COLS_VENTAS.FECHA].toISOString() 
              : fila[VN_CONFIG.COLS_VENTAS.FECHA],
            banco: fila[VN_CONFIG.COLS_VENTAS.BANCO],
            monto: fila[VN_CONFIG.COLS_VENTAS.MONTO],
            obs: fila[VN_CONFIG.COLS_VENTAS.OBS] || '',
            usuario: fila[VN_CONFIG.COLS_VENTAS.USUARIO] || '',
            cierreId: fila[VN_CONFIG.COLS_VENTAS.CIERRE_ID] || ''
          });
        }
      }

      return ventas;
    } catch (error) {
      Logger.log('[VN ERROR] Error al obtener ventas por banco: ' + error.message);
      return [];
    }
  },

  /**
   * Elimina una venta por ID
   */
  eliminarVenta: function(id) {
    try {
      const hoja = this.getHojaVentas();
      const datos = hoja.getDataRange().getValues();

      for (let i = datos.length - 1; i >= 1; i--) {
        if (datos[i][VN_CONFIG.COLS_VENTAS.ID] === id) {
          hoja.deleteRow(i + 1);
          Logger.log('[VN] Venta eliminada: ID ' + id);
          return { success: true, mensaje: 'Venta eliminada' };
        }
      }

      return { success: false, error: 'Venta no encontrada' };
    } catch (error) {
      Logger.log('[VN ERROR] Error al eliminar venta: ' + error.message);
      return { success: false, error: error.message };
    }
  }
};

// ============================================================================
// REPOSITORY DE CIERRES
// ============================================================================

const CierreNocturnoRepository = {
  /**
   * Obtiene o crea la hoja de cierres
   */
  getHojaCierres: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(VN_CONFIG.HOJA_CIERRES);

    if (!hoja) {
      hoja = ss.insertSheet(VN_CONFIG.HOJA_CIERRES);
      hoja.appendRow([
        'ID', 'FECHA', 'TOTAL_EFECTIVO', 'TOTAL_TARJETAS', 
        'TOTAL_GENERAL', 'USUARIO', 'TIMESTAMP', 'OBS'
      ]);
      hoja.getRange(1, 1, 1, 8)
        .setFontWeight('bold')
        .setBackground('#764ba2')
        .setFontColor('#FFFFFF');
      Logger.log('[OK] Hoja VN_CIERRES creada');
    }

    return hoja;
  },

  /**
   * Genera ID autoincremental
   */
  generarId: function() {
    const hoja = this.getHojaCierres();
    const ultimaFila = hoja.getLastRow();
    if (ultimaFila <= 1) return 1;
    
    const ultimoId = hoja.getRange(ultimaFila, 1).getValue();
    return (parseInt(ultimoId) || 0) + 1;
  },

  /**
   * Realiza un cierre de caja
   */
  realizarCierre: function(datos) {
    try {
      const hoja = this.getHojaCierres();
      const id = this.generarId();
      const usuario = Session.getEffectiveUser().getEmail();
      const timestamp = new Date();

      const fila = [
        id,
        datos.fecha || new Date(),
        datos.totalEfectivo,
        datos.totalTarjetas,
        datos.totalGeneral,
        usuario,
        timestamp,
        datos.obs || ''
      ];

      hoja.appendRow(fila);

      // Actualizar ventas con el cierreId
      if (datos.ventasIds && datos.ventasIds.length > 0) {
        const hojaVentas = VentaNocturnaRepository.getHojaVentas();
        const datosVentas = hojaVentas.getDataRange().getValues();

        for (let i = 1; i < datosVentas.length; i++) {
          if (datos.ventasIds.includes(datosVentas[i][VN_CONFIG.COLS_VENTAS.ID])) {
            hojaVentas.getRange(i + 1, VN_CONFIG.COLS_VENTAS.CIERRE_ID + 1)
              .setValue(id);
          }
        }
      }

      Logger.log('[VN] Cierre realizado: ID ' + id);
      
      return {
        success: true,
        id: id,
        mensaje: 'Cierre realizado correctamente'
      };
    } catch (error) {
      Logger.log('[VN ERROR] Error al realizar cierre: ' + error.message);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Obtiene todos los cierres
   */
  obtenerCierres: function() {
    try {
      const hoja = this.getHojaCierres();
      const datos = hoja.getDataRange().getValues();

      if (datos.length <= 1) return [];

      return datos.slice(1).map(fila => ({
        id: fila[VN_CONFIG.COLS_CIERRES.ID],
        fecha: fila[VN_CONFIG.COLS_CIERRES.FECHA] instanceof Date 
          ? fila[VN_CONFIG.COLS_CIERRES.FECHA].toISOString() 
          : fila[VN_CONFIG.COLS_CIERRES.FECHA],
        totalEfectivo: fila[VN_CONFIG.COLS_CIERRES.TOTAL_EFECTIVO],
        totalTarjetas: fila[VN_CONFIG.COLS_CIERRES.TOTAL_TARJETAS],
        totalGeneral: fila[VN_CONFIG.COLS_CIERRES.TOTAL_GENERAL],
        usuario: fila[VN_CONFIG.COLS_CIERRES.USUARIO] || '',
        obs: fila[VN_CONFIG.COLS_CIERRES.OBS] || ''
      }));
    } catch (error) {
      Logger.log('[VN ERROR] Error al obtener cierres: ' + error.message);
      return [];
    }
  }
};

// ============================================================================
// API PÚBLICA - FUNCIONES EXPUESTAS AL HTML
// ============================================================================

/**
 * Registra una nueva venta nocturna
 * @param {Object} datos - Datos de la venta
 */
function vnRegistrarVenta(datos) {
  // Validaciones
  if (!datos.banco || !datos.monto || datos.monto <= 0) {
    return {
      success: false,
      error: 'Datos inválidos'
    };
  }

  return VentaNocturnaRepository.registrarVenta(datos);
}

/**
 * Obtiene ventas por rango de fechas
 * @param {string} desde - Fecha inicio (ISO string)
 * @param {string} hasta - Fecha fin (ISO string)
 */
function vnObtenerVentasPorRango(desde, hasta) {
  return serializarParaWeb(
    VentaNocturnaRepository.obtenerVentasPorRango(new Date(desde), new Date(hasta))
  );
}

/**
 * Obtiene ventas por banco
 * @param {string} banco - Nombre del banco
 */
function vnObtenerVentasPorBanco(banco) {
  return serializarParaWeb(
    VentaNocturnaRepository.obtenerVentasPorBanco(banco)
  );
}

/**
 * Realiza cierre de caja nocturno
 * @param {Object} datos - Datos del cierre
 */
function vnRealizarCierre(datos) {
  return CierreNocturnoRepository.realizarCierre(datos);
}

/**
 * Obtiene todos los cierres
 */
function vnObtenerCierres() {
  return serializarParaWeb(
    CierreNocturnoRepository.obtenerCierres()
  );
}

/**
 * Elimina una venta
 * @param {number} id - ID de la venta
 */
function vnEliminarVenta(id) {
  return VentaNocturnaRepository.eliminarVenta(id);
}

/**
 * Obtiene configuración de Venta Nocturna
 */
function vnObtenerConfiguracion() {
  return {
    success: true,
    config: {
      bancos: typeof BANK_NAMES !== 'undefined' ? BANK_NAMES : [],
      valoresVacios: typeof EMPTY_VALUES_CONFIG !== 'undefined' ? EMPTY_VALUES_CONFIG : [],
      constantes: typeof MODULE_CONSTANTS !== 'undefined' ? MODULE_CONSTANTS : {}
    }
  };
}
