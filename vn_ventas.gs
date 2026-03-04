// ============================================================
//  MÓDULO: VENTA NOCTURNA — Repositorio de Ventas (POS)
//  Registro de ventas con pagos mixtos, descuento de stock,
//  manejo de vales y fiados.
// ============================================================

const VnVentasRepo = {

  // ── Registrar nueva venta ────────────────────────────────
  registrar(data) {
    // Validaciones básicas
    if (!data.sesionId) return { success: false, error: 'Se requiere una sesión activa.' };
    if (!data.items || data.items.length === 0) return { success: false, error: 'El carrito no puede estar vacío.' };
    if (!data.mediosPago || data.mediosPago.length === 0) return { success: false, error: 'Seleccioná al menos un medio de pago.' };

    const total = Number(data.total) || 0;
    if (total <= 0) return { success: false, error: 'El total debe ser mayor a cero.' };

    // Validar suma de medios de pago
    const sumaMedios = data.mediosPago.reduce((s, m) => s + (Number(m.monto) || 0), 0);
    if (Math.abs(sumaMedios - total) > 0.01) { // tolerancia de $0.01 (un centavo)
      return { success: false, error: 'La suma de los medios de pago ($' + sumaMedios + ') no coincide con el total ($' + total + ').' };
    }

    // Validar fiado requiere cliente identificado
    const tieneFiado = data.mediosPago.some(m => m.tipo === 'FIADO');
    if (tieneFiado && (!data.cliente || data.cliente === 'CONSUMIDOR FINAL')) {
      return { success: false, error: 'Los fiados requieren un cliente identificado, no Consumidor Final.' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // Validar stock (solo si hay items con ID de producto)
      const itemsConId = data.items.filter(i => i.prodId);
      if (itemsConId.length > 0) {
        const erroresStock = VnStockRepo.validarStock(itemsConId);
        if (erroresStock.length > 0 && !data.forzarSinStock) {
          return { success: false, error: erroresStock.join(' '), stockInsuficiente: true };
        }
      }

      // Validar vales incluidos en el pago
      const mediosVale = data.mediosPago.filter(m => m.tipo === 'VALE');
      for (const mv of mediosVale) {
        if (!mv.detalle || !mv.detalle.numero) {
          return { success: false, error: 'Número de vale requerido para el pago con vale.' };
        }
        const valeRes = VnValesRepo.buscar(mv.detalle.numero);
        if (!valeRes.success) return { success: false, error: valeRes.error };
        if (valeRes.vale.estado !== CONFIG_VN.ESTADOS_VALE.DISPONIBLE) {
          return { success: false, error: 'El vale ' + mv.detalle.numero + ' no está disponible.' };
        }
        if (valeRes.vale.monto < Number(mv.monto)) {
          return { success: false, error: 'El vale ' + mv.detalle.numero + ' tiene un monto de $' + valeRes.vale.monto + ', menor al aplicado ($' + mv.monto + ').' };
        }
      }

      // --- Todo OK, procesar la venta ---

      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VENTAS);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VENTAS); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      const ahora = new Date();
      const usuario = Session.getActiveUser().getEmail();
      const subtotal = Number(data.subtotal) || total;

      // M-05: Usar conRetry para el appendRow de la venta
      conRetry(() => hoja.appendRow([
        nuevoId,
        Number(data.sesionId),
        Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        ahora,
        (data.cliente || 'CONSUMIDOR FINAL').toUpperCase().trim(),
        JSON.stringify(data.items),
        subtotal,
        total,
        JSON.stringify(data.mediosPago),
        CONFIG_VN.ESTADOS_VENTA.CONFIRMADA,
        data.obs || '',
        usuario
      ]), { contexto: 'VN.registrar.appendRow', maxIntentos: 3 });

      // M-03: Descontar stock (batch: 1 read + 1 write por fila modificada)
      const batchResult = VnStockRepo.descontarStockBatch(
        itemsConId.map(i => ({ prodId: i.prodId, qty: i.qty }))
      );
      if (!batchResult.success) {
        throw new Error('Error al descontar stock: ' + (batchResult.error || 'desconocido'));
      }
      if (batchResult.insuficiente && batchResult.insuficiente.length > 0) {
        Logger.log('[VN_VENTAS] Stock negativo evitado en venta #' + nuevoId + ' para prods: ' + batchResult.insuficiente.join(','));
      }

      // Canjear vales usados
      mediosVale.forEach(mv => {
        VnValesRepo.canjear(mv.detalle.numero, nuevoId);
      });

      // Registrar fiados
      const mediosFiado = data.mediosPago.filter(m => m.tipo === 'FIADO');
      mediosFiado.forEach(mf => {
        VnPagosRepo.registrarFiado({
          sesionId: data.sesionId,
          cliente: data.cliente,
          monto: Number(mf.monto),
          ventaIdRef: nuevoId,
          obs: 'Venta #' + nuevoId + ' - Fiado'
        });
      });

      return {
        success: true,
        venta: {
          id: nuevoId,
          sesionId: data.sesionId,
          fecha: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
          hora: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'HH:mm'),
          cliente: (data.cliente || 'CONSUMIDOR FINAL').toUpperCase().trim(),
          items: data.items,
          total,
          mediosPago: data.mediosPago,
          estado: CONFIG_VN.ESTADOS_VENTA.CONFIRMADA
        }
      };
    } catch (e) {
      Logger.log('[VN_VENTAS] Error en registrar: ' + e.message);
      return { success: false, error: 'Error al registrar venta: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Cancelar venta (restaura stock y vales) ──────────────
  cancelar(ventaId) {
    if (!ventaId) return { success: false, error: 'ID de venta requerido.' };

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VENTAS);
      const datos = hoja.getDataRange().getValues();

      let filaIdx = -1, venta = null;
      for (let i = 1; i < datos.length; i++) {
        if (Number(datos[i][0]) === Number(ventaId)) {
          filaIdx = i + 1;
          venta = this._mapear(datos[i]);
          break;
        }
      }

      if (!venta) return { success: false, error: 'Venta no encontrada.' };
      if (venta.estado === CONFIG_VN.ESTADOS_VENTA.CANCELADA) {
        return { success: false, error: 'La venta ya fue cancelada.' };
      }

      // ✅ BLOQUE NUEVO: verificar que la sesión esté ABIERTA
      const hojaSesiones = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
      if (hojaSesiones) {
        const datosSesiones = hojaSesiones.getDataRange().getValues();
        for (let i = 1; i < datosSesiones.length; i++) {
          if (Number(datosSesiones[i][CONFIG_VN.COLS_SESIONES.ID - 1]) === Number(venta.sesionId)) {
            const estadoSesion = datosSesiones[i][CONFIG_VN.COLS_SESIONES.ESTADO - 1];
            if (estadoSesion === CONFIG_VN.ESTADOS_SESION.CERRADA) {
              lock.releaseLock();
              return {
                success: false,
                error: 'No se puede cancelar una venta de una sesión ya cerrada (Sesión #' + venta.sesionId + '). Reabra la sesión primero si es necesario.'
              };
            }
            break;
          }
        }
      }
      // FIN BLOQUE NUEVO

      // Cancelar en la hoja
      hoja.getRange(filaIdx, CONFIG_VN.COLS_VENTAS.ESTADO).setValue(CONFIG_VN.ESTADOS_VENTA.CANCELADA);

      // Restaurar stock
      const items = venta.items || [];
      items.filter(i => i.prodId).forEach(item => {
        VnStockRepo.restaurarStock(item.prodId, item.qty);
      });

      // Revertir vales canjeados
      const medios = venta.mediosPago || [];
      medios.filter(m => m.tipo === 'VALE' && m.detalle && m.detalle.numero).forEach(mv => {
        VnValesRepo.revertirCanje(mv.detalle.numero);
      });

      return { success: true };
    } catch (e) {
      Logger.log('[VN_VENTAS] Error en cancelar: ' + e.message);
      return { success: false, error: 'Error al cancelar venta: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Obtener ventas de una sesión ─────────────────────────
  obtenerPorSesion(sesionId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VENTAS);
    if (!hoja) return { success: true, ventas: [] };

    const datos = hoja.getDataRange().getValues();
    const ventas = datos.slice(1)
      .filter(f => Number(f[CONFIG_VN.COLS_VENTAS.SESION_ID - 1]) === Number(sesionId))
      .map(f => this._mapear(f))
      .reverse();

    return { success: true, ventas };
  },

  // ── Resumen de totales de la sesión ──────────────────────
  obtenerResumenSesion(sesionId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const totales = _calcularTotalesSesion(ss, sesionId);
    return { success: true, resumen: totales };
  },

  // ── Mapper interno ───────────────────────────────────────
  _mapear(fila) {
    const C = CONFIG_VN.COLS_VENTAS;
    let items = [], mediosPago = [];
    try { items = JSON.parse(fila[C.ITEMS_JSON - 1] || '[]'); } catch (_) {}
    try { mediosPago = JSON.parse(fila[C.MEDIOS_PAGO_JSON - 1] || '[]'); } catch (_) {}

    return {
      id:          fila[C.ID - 1],
      sesionId:    fila[C.SESION_ID - 1],
      fecha:       fila[C.FECHA - 1],
      hora:        fila[C.HORA - 1],
      cliente:     fila[C.CLIENTE - 1] || 'CONSUMIDOR FINAL',
      items,
      subtotal:    Number(fila[C.SUBTOTAL - 1]) || 0,
      total:       Number(fila[C.TOTAL - 1]) || 0,
      mediosPago,
      estado:      fila[C.ESTADO - 1],
      obs:         fila[C.OBS - 1] || '',
      usuario:     fila[C.USUARIO - 1]
    };
  }
};

// ── Wrappers para main.gs ─────────────────────────────────────

function vnRegistrarVenta(data) {
  return VnVentasRepo.registrar(data);
}

function vnCancelarVenta(ventaId) {
  return VnVentasRepo.cancelar(ventaId);
}

function vnGetVentasSesion(sesionId) {
  return VnVentasRepo.obtenerPorSesion(sesionId);
}

function vnGetResumenSesion(sesionId) {
  return VnVentasRepo.obtenerResumenSesion(sesionId);
}
