/**
 * ============================================================================
 * SISTEMA DE CAJA - SISTEMA SOL & VERDE
 * ============================================================================
 * Arqueo de efectivo, proveedores, gastos e ingresos
 * ============================================================================
 */

const CajaRepository = {
  /**
   * Obtiene la hoja de CAJA_ARQUEOS
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.CAJA_ARQUEOS);

    // Crear hoja si no existe
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.CAJA_ARQUEOS);
      hoja.appendRow(['ID', 'FECHA', 'SESION_ID', 'TIPO', 'DESCRIPCION', 'MONTO', 'USUARIO', 'TIMESTAMP']);
      hoja.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#FF6F00').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }

    return hoja;
  },

  /**
   * Genera un nuevo ID autoincremental
   * @returns {number} Nuevo ID
   */
  generarNuevoID: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;

    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    let maxId = 0;
    for (const [id] of ids) {
      if (typeof id === 'number' && id > maxId) maxId = id;
    }
    return maxId + 1;
  },

  /**
   * Guarda una sesion completa de arqueo
   * @param {Object} datos - Datos del arqueo
   * @returns {Object} Resultado
   */
  guardarSesion: function(datos) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000);

      const hoja = this.getHoja();
      const sesionId = generarSesionId();
      const fecha = datos.fecha ? new Date(datos.fecha) : new Date();
      const timestamp = new Date();
      const usuario = Session.getActiveUser().getEmail();

      const registros = [];

      // 1. Guardar denominaciones de efectivo (billetes y monedas)
      if (datos.arqueo) {
        for (const [tipo, cantidad] of Object.entries(datos.arqueo)) {
          if (cantidad > 0) {
            const denom = [...DENOMINACIONES.BILLETES, ...DENOMINACIONES.MONEDAS].find(d => d.tipo === tipo);
            if (denom) {
              const monto = cantidad * denom.valor;
              registros.push([
                this.generarNuevoID(),
                fecha,
                sesionId,
                tipo,
                `${cantidad} x ${denom.nombre}`,
                monto,
                usuario,
                timestamp
              ]);
            }
          }
        }
      }

      // 2. Guardar proveedores
      if (datos.proveedores && Array.isArray(datos.proveedores)) {
        for (const prov of datos.proveedores) {
          if (prov.monto > 0) {
            registros.push([
              this.generarNuevoID(),
              fecha,
              sesionId,
              CONFIG.TIPOS_CAJA.PROVEEDOR,
              prov.descripcion || 'Pago proveedor',
              -prov.monto, // Negativo porque es salida
              usuario,
              timestamp
            ]);
          }
        }
      }

      // 3. Guardar gastos extras
      if (datos.gastos && Array.isArray(datos.gastos)) {
        for (const gasto of datos.gastos) {
          if (gasto.monto > 0) {
            registros.push([
              this.generarNuevoID(),
              fecha,
              sesionId,
              CONFIG.TIPOS_CAJA.GASTO_EXTRA,
              gasto.descripcion || 'Gasto extra',
              -gasto.monto, // Negativo porque es salida
              usuario,
              timestamp
            ]);
          }
        }
      }

      // 4. Guardar ingresos adicionales
      if (datos.ingresos && Array.isArray(datos.ingresos)) {
        for (const ingreso of datos.ingresos) {
          if (ingreso.monto > 0) {
            registros.push([
              this.generarNuevoID(),
              fecha,
              sesionId,
              CONFIG.TIPOS_CAJA.INGRESO,
              ingreso.descripcion || 'Ingreso adicional',
              ingreso.monto,
              usuario,
              timestamp
            ]);
          }
        }
      }

      // 5. Guardar resumen de cobranzas del dia
      if (datos.totalCobranzas > 0) {
        registros.push([
          this.generarNuevoID(),
          fecha,
          sesionId,
          CONFIG.TIPOS_CAJA.COBRANZA,
          'Total cobranzas del dia',
          datos.totalCobranzas,
          usuario,
          timestamp
        ]);
      }

      // 6. Guardar total de fiados del dia
      if (datos.totalFiados > 0) {
        registros.push([
          this.generarNuevoID(),
          fecha,
          sesionId,
          CONFIG.TIPOS_CAJA.FIADO_DIA,
          'Total fiados del dia',
          datos.totalFiados,
          usuario,
          timestamp
        ]);
      }

      // Insertar todos los registros
      for (const registro of registros) {
        hoja.appendRow(registro);
      }

      lock.releaseLock();

      // Calcular totales
      const totales = this.calcularTotalesSesion(registros);

      return {
        success: true,
        sesionId: sesionId,
        fecha: fecha.toISOString(),
        registros: registros.length,
        totales: totales
      };

    } catch (error) {
      lock.releaseLock();
      throw error;
    }
  },

  /**
   * Calcula totales de una sesion
   * @param {Array} registros - Registros de la sesion
   * @returns {Object} Totales
   */
  calcularTotalesSesion: function(registros) {
    let totalEfectivo = 0;
    let totalProveedores = 0;
    let totalGastos = 0;
    let totalIngresos = 0;
    let totalCobranzas = 0;
    let totalFiados = 0;

    for (const reg of registros) {
      const tipo = reg[3];
      const monto = reg[5];

      if (tipo.startsWith('BILLETE_') || tipo.startsWith('MONEDA_')) {
        totalEfectivo += monto;
      } else if (tipo === CONFIG.TIPOS_CAJA.PROVEEDOR) {
        totalProveedores += Math.abs(monto);
      } else if (tipo === CONFIG.TIPOS_CAJA.GASTO_EXTRA) {
        totalGastos += Math.abs(monto);
      } else if (tipo === CONFIG.TIPOS_CAJA.INGRESO) {
        totalIngresos += monto;
      } else if (tipo === CONFIG.TIPOS_CAJA.COBRANZA) {
        totalCobranzas += monto;
      } else if (tipo === CONFIG.TIPOS_CAJA.FIADO_DIA) {
        totalFiados += monto;
      }
    }

    return {
      efectivo: totalEfectivo,
      proveedores: totalProveedores,
      gastos: totalGastos,
      ingresos: totalIngresos,
      cobranzas: totalCobranzas,
      fiados: totalFiados,
      neto: totalEfectivo - totalProveedores - totalGastos + totalIngresos
    };
  },

  /**
   * Obtiene el historial de sesiones de caja
   * @param {number} limite - Cantidad maxima de sesiones
   * @returns {Array<Object>} Array de sesiones
   */
  obtenerHistorial: function(limite = 30) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    // Agrupar por sesion_id
    const sesiones = new Map();

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const sesionId = fila[CONFIG.COLS_CAJA.SESION_ID];

      if (!sesiones.has(sesionId)) {
        sesiones.set(sesionId, {
          sesionId: sesionId,
          fecha: fila[CONFIG.COLS_CAJA.FECHA] instanceof Date ? fila[CONFIG.COLS_CAJA.FECHA].toISOString() : fila[CONFIG.COLS_CAJA.FECHA],
          usuario: fila[CONFIG.COLS_CAJA.USUARIO],
          registros: []
        });
      }

      sesiones.get(sesionId).registros.push({
        id: fila[CONFIG.COLS_CAJA.ID],
        tipo: fila[CONFIG.COLS_CAJA.TIPO],
        descripcion: fila[CONFIG.COLS_CAJA.DESCRIPCION],
        monto: fila[CONFIG.COLS_CAJA.MONTO]
      });
    }

    // Convertir a array y ordenar por fecha descendente
    const resultado = Array.from(sesiones.values());
    resultado.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Calcular totales para cada sesion
    for (const sesion of resultado) {
      sesion.totales = {
        efectivo: 0,
        proveedores: 0,
        gastos: 0,
        ingresos: 0
      };

      for (const reg of sesion.registros) {
        if (reg.tipo.startsWith('BILLETE_') || reg.tipo.startsWith('MONEDA_')) {
          sesion.totales.efectivo += reg.monto;
        } else if (reg.tipo === CONFIG.TIPOS_CAJA.PROVEEDOR) {
          sesion.totales.proveedores += Math.abs(reg.monto);
        } else if (reg.tipo === CONFIG.TIPOS_CAJA.GASTO_EXTRA) {
          sesion.totales.gastos += Math.abs(reg.monto);
        } else if (reg.tipo === CONFIG.TIPOS_CAJA.INGRESO) {
          sesion.totales.ingresos += reg.monto;
        }
      }

      sesion.totales.neto = sesion.totales.efectivo - sesion.totales.proveedores - sesion.totales.gastos + sesion.totales.ingresos;
    }

    return resultado.slice(0, limite);
  },

  /**
   * Obtiene detalle de una sesion especifica
   * @param {string} sesionId - ID de la sesion
   * @returns {Object} Detalle de la sesion
   */
  obtenerSesion: function(sesionId) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    const registros = [];
    let fecha = null;
    let usuario = null;

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (fila[CONFIG.COLS_CAJA.SESION_ID] === sesionId) {
        if (!fecha) {
          fecha = fila[CONFIG.COLS_CAJA.FECHA];
          usuario = fila[CONFIG.COLS_CAJA.USUARIO];
        }

        registros.push({
          id: fila[CONFIG.COLS_CAJA.ID],
          tipo: fila[CONFIG.COLS_CAJA.TIPO],
          descripcion: fila[CONFIG.COLS_CAJA.DESCRIPCION],
          monto: fila[CONFIG.COLS_CAJA.MONTO]
        });
      }
    }

    if (registros.length === 0) return null;

    return {
      sesionId: sesionId,
      fecha: fecha instanceof Date ? fecha.toISOString() : fecha,
      usuario: usuario,
      registros: registros
    };
  }
};

/**
 * Genera datos para la Hoja de Ruta del dia
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {Object} Datos de la hoja de ruta
 */
function generarHojaRuta(fecha) {
  const fechaObj = fecha ? new Date(fecha) : new Date();
  fechaObj.setHours(0, 0, 0, 0);

  const fechaFin = new Date(fechaObj);
  fechaFin.setHours(23, 59, 59, 999);

  // Obtener movimientos del dia
  const movimientos = MovimientosRepository.obtenerPorRango(fechaObj, fechaFin);

  // Separar cobranzas (HABER/PAGO) y fiados (DEBE)
  const cobranzas = movimientos.filter(m => m.tipo === CONFIG.TIPOS_MOVIMIENTO.HABER);
  const fiados = movimientos.filter(m => m.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE);

  // Calcular totales
  const totalCobranzas = cobranzas.reduce((sum, m) => sum + m.monto, 0);
  const totalFiados = fiados.reduce((sum, m) => sum + m.monto, 0);

  return {
    fecha: fechaObj.toISOString(),
    fechaFormateada: formatearFecha(fechaObj),
    cobranzas: cobranzas.map(m => ({
      cliente: m.cliente,
      monto: m.monto,
      obs: m.obs
    })),
    fiados: fiados.map(m => ({
      cliente: m.cliente,
      monto: m.monto,
      obs: m.obs
    })),
    totalCobranzas: totalCobranzas,
    totalFiados: totalFiados,
    diferencia: totalCobranzas - totalFiados
  };
}

/**
 * Genera el resumen de arqueo para impresion
 * @param {string} sesionId - ID de la sesion (opcional, ultima si no se especifica)
 * @returns {Object} Datos del arqueo para imprimir
 */
function generarResumenArqueo(sesionId) {
  let sesion;

  if (sesionId) {
    sesion = CajaRepository.obtenerSesion(sesionId);
  } else {
    const historial = CajaRepository.obtenerHistorial(1);
    sesion = historial.length > 0 ? CajaRepository.obtenerSesion(historial[0].sesionId) : null;
  }

  if (!sesion) {
    return { error: 'No se encontro la sesion de caja' };
  }

  // Organizar datos por tipo
  const efectivo = {
    billetes: [],
    monedas: [],
    total: 0
  };
  const proveedores = [];
  const gastos = [];
  const ingresos = [];

  for (const reg of sesion.registros) {
    if (reg.tipo.startsWith('BILLETE_')) {
      const denom = DENOMINACIONES.BILLETES.find(d => d.tipo === reg.tipo);
      efectivo.billetes.push({
        denominacion: denom ? denom.nombre : reg.tipo,
        descripcion: reg.descripcion,
        monto: reg.monto
      });
      efectivo.total += reg.monto;
    } else if (reg.tipo.startsWith('MONEDA_')) {
      const denom = DENOMINACIONES.MONEDAS.find(d => d.tipo === reg.tipo);
      efectivo.monedas.push({
        denominacion: denom ? denom.nombre : reg.tipo,
        descripcion: reg.descripcion,
        monto: reg.monto
      });
      efectivo.total += reg.monto;
    } else if (reg.tipo === CONFIG.TIPOS_CAJA.PROVEEDOR) {
      proveedores.push({
        descripcion: reg.descripcion,
        monto: Math.abs(reg.monto)
      });
    } else if (reg.tipo === CONFIG.TIPOS_CAJA.GASTO_EXTRA) {
      gastos.push({
        descripcion: reg.descripcion,
        monto: Math.abs(reg.monto)
      });
    } else if (reg.tipo === CONFIG.TIPOS_CAJA.INGRESO) {
      ingresos.push({
        descripcion: reg.descripcion,
        monto: reg.monto
      });
    }
  }

  const totalProveedores = proveedores.reduce((sum, p) => sum + p.monto, 0);
  const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0);
  const totalIngresos = ingresos.reduce((sum, i) => sum + i.monto, 0);

  return {
    sesionId: sesion.sesionId,
    fecha: sesion.fecha,
    fechaFormateada: formatearFecha(new Date(sesion.fecha)),
    usuario: sesion.usuario,
    efectivo: efectivo,
    proveedores: proveedores,
    gastos: gastos,
    ingresos: ingresos,
    totales: {
      efectivo: efectivo.total,
      proveedores: totalProveedores,
      gastos: totalGastos,
      ingresos: totalIngresos,
      neto: efectivo.total - totalProveedores - totalGastos + totalIngresos
    }
  };
}
