// ============================================================
//  MÓDULO: VENTA NOCTURNA — Módulos Unificados
//  Incluye: Vales, Ventas, Stock, Pagos
//  Todos los repositorios en un solo archivo
// ============================================================

// ============================================================
//  SECCIÓN 1: VALES DE CANJE
// ============================================================

const VnValesRepo = {

  // ── Generación de número único ───────────────────────────
  _generarNumero() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
    if (!hoja) return 'VL-' + new Date().getFullYear() + '-00001';

    const datos = hoja.getDataRange().getValues();
    let maxNum = 0;
    datos.slice(1).forEach(fila => {
      const num = fila[CONFIG_VN.COLS_VALES.NUMERO - 1];
      if (typeof num === 'string' && num.startsWith('VL-')) {
        const partes = num.split('-');
        const n = parseInt(partes[partes.length - 1]) || 0;
        if (n > maxNum) maxNum = n;
      }
    });
    const siguiente = maxNum + 1;
    return 'VL-' + new Date().getFullYear() + '-' + String(siguiente).padStart(5, '0');
  },

  // ── Crear nuevo vale ─────────────────────────────────────
  crear(data) {
    if (!data.monto || Number(data.monto) <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }
    if (!data.motivo || data.motivo.trim() === '') {
      return { success: false, error: 'El motivo de emisión es requerido.' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES); }

      const numero = this._generarNumero();
      const ahora = new Date();
      const usuario = Session.getActiveUser().getEmail();
      const ultimoId = _obtenerUltimoId(hoja);
      const nuevoId = ultimoId + 1;

      hoja.appendRow([
        nuevoId,
        numero,
        ahora,
        Number(data.monto),
        (data.cliente || 'CONSUMIDOR FINAL').toUpperCase().trim(),
        data.motivo.trim(),
        CONFIG_VN.ESTADOS_VALE.DISPONIBLE,
        '',
        '',
        data.obs || '',
        usuario
      ]);

      return {
        success: true,
        vale: {
          id: nuevoId,
          numero,
          fecha: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
          monto: Number(data.monto),
          cliente: (data.cliente || 'CONSUMIDOR FINAL').toUpperCase().trim(),
          motivo: data.motivo.trim(),
          estado: CONFIG_VN.ESTADOS_VALE.DISPONIBLE
        }
      };
    } catch (e) {
      Logger.log('[VN_VALES] Error en crear: ' + e.message);
      return { success: false, error: 'Error al crear vale: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Buscar por número exacto ─────────────────────────────
  buscar(numero) {
    if (!numero) return { success: false, error: 'Número requerido.' };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
    if (!hoja) return { success: false, error: 'Sin datos de vales.' };

    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_VN.COLS_VALES.NUMERO - 1] === numero.trim().toUpperCase()) {
        return { success: true, vale: this._mapear(datos[i]) };
      }
    }
    return { success: false, error: 'Vale ' + numero + ' no encontrado.' };
  },

  // ── Canjear vale en una venta ────────────────────────────
  canjear(numero, ventaId) {
    if (!numero || !ventaId) {
      return { success: false, error: 'Número de vale y ID de venta requeridos.' };
    }
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
      const datos = hoja.getDataRange().getValues();

      let filaIdx = -1, vale = null;
      for (let i = 1; i < datos.length; i++) {
        if (datos[i][CONFIG_VN.COLS_VALES.NUMERO - 1] === numero.trim().toUpperCase()) {
          filaIdx = i + 1;
          vale = this._mapear(datos[i]);
          break;
        }
      }

      if (!vale) return { success: false, error: 'Vale no encontrado.' };
      if (vale.estado !== CONFIG_VN.ESTADOS_VALE.DISPONIBLE) {
        return { success: false, error: 'El vale ' + numero + ' no está disponible (estado: ' + vale.estado + ').' };
      }

      hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.ESTADO).setValue(CONFIG_VN.ESTADOS_VALE.CANJEADO);
      hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.FECHA_CANJE).setValue(new Date());
      hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.VENTA_ID_CANJE).setValue(ventaId);

      return { success: true, vale: { ...vale, estado: CONFIG_VN.ESTADOS_VALE.CANJEADO } };
    } catch (e) {
      Logger.log('[VN_VALES] Error en canjear: ' + e.message);
      return { success: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Revertir canje (al cancelar venta) ──────────────────
  revertirCanje(numero) {
    if (!numero) return { success: false, error: 'Número requerido.' };
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
      const datos = hoja.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        if (datos[i][CONFIG_VN.COLS_VALES.NUMERO - 1] === numero.trim().toUpperCase()) {
          const filaIdx = i + 1;
          hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.ESTADO).setValue(CONFIG_VN.ESTADOS_VALE.DISPONIBLE);
          hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.FECHA_CANJE).setValue('');
          hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.VENTA_ID_CANJE).setValue('');
          return { success: true };
        }
      }
      return { success: false, error: 'Vale no encontrado.' };
    } catch (e) {
      Logger.log('[VN_VALES] Error en revertirCanje: ' + e.message);
      return { success: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Anular vale ──────────────────────────────────────────
  anular(numero, razon) {
    if (!numero) return { success: false, error: 'Número requerido.' };
    if (!razon || razon.trim() === '') return { success: false, error: 'La razón de anulación es requerida.' };

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
      const datos = hoja.getDataRange().getValues();

      for (let i = 1; i < datos.length; i++) {
        if (datos[i][CONFIG_VN.COLS_VALES.NUMERO - 1] === numero.trim().toUpperCase()) {
          const filaIdx = i + 1;
          const estado = datos[i][CONFIG_VN.COLS_VALES.ESTADO - 1];
          if (estado !== CONFIG_VN.ESTADOS_VALE.DISPONIBLE) {
            return { success: false, error: 'Solo se pueden anular vales DISPONIBLES.' };
          }
          hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.ESTADO).setValue(CONFIG_VN.ESTADOS_VALE.ANULADO);
          hoja.getRange(filaIdx, CONFIG_VN.COLS_VALES.OBS).setValue('ANULADO: ' + razon.trim());
          return { success: true };
        }
      }
      return { success: false, error: 'Vale no encontrado.' };
    } catch (e) {
      Logger.log('[VN_VALES] Error en anular: ' + e.message);
      return { success: false, error: e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Obtener vales disponibles de un cliente ──────────────
  buscarPorCliente(nombreCliente) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
    if (!hoja) return { success: true, vales: [] };

    const datos = hoja.getDataRange().getValues();
    const nombre = (nombreCliente || '').toUpperCase().trim();
    const vales = datos.slice(1)
      .filter(f => f[CONFIG_VN.COLS_VALES.CLIENTE - 1] === nombre &&
                   f[CONFIG_VN.COLS_VALES.ESTADO - 1] === CONFIG_VN.ESTADOS_VALE.DISPONIBLE)
      .map(f => this._mapear(f));

    return { success: true, vales };
  },

  // ── Obtener todos los vales con filtros opcionales ───────
  obtenerTodos(filtros) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.VALES);
    if (!hoja) return { success: true, vales: [] };

    const datos = hoja.getDataRange().getValues();
    let vales = datos.slice(1).map(f => this._mapear(f));

    if (filtros) {
      if (filtros.estado) vales = vales.filter(v => v.estado === filtros.estado);
      if (filtros.cliente) vales = vales.filter(v => v.cliente.includes(filtros.cliente.toUpperCase()));
    }
    return { success: true, vales: vales.reverse() };
  },

  // ── Mapper interno ───────────────────────────────────────
  _mapear(fila) {
    const C = CONFIG_VN.COLS_VALES;
    return {
      id:           fila[C.ID - 1],
      numero:       fila[C.NUMERO - 1],
      fechaEmision: fila[C.FECHA_EMISION - 1],
      monto:        Number(fila[C.MONTO - 1]) || 0,
      cliente:      fila[C.CLIENTE - 1] || 'CONSUMIDOR FINAL',
      motivo:       fila[C.MOTIVO - 1] || '',
      estado:       fila[C.ESTADO - 1],
      fechaCanje:   fila[C.FECHA_CANJE - 1] || '',
      ventaIdCanje: fila[C.VENTA_ID_CANJE - 1] || '',
      obs:          fila[C.OBS - 1] || ''
    };
  }
};

// ============================================================
//  SECCIÓN 2: VENTAS (POS)
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

// ============================================================
//  SECCIÓN 3: STOCK (COMPRAS, MERMAS, CORRECCIONES)
// ============================================================

const VnStockRepo = {

  // ── Obtener existencias actuales ─────────────────────────
  obtenerExistencias() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    if (!hoja) return { success: true, productos: [] };

    const datos = hoja.getDataRange().getValues();
    const productos = datos.slice(1).map(f => _mapearProducto(f));
    return { success: true, productos };
  },

  // ── Registrar compra de proveedor ────────────────────────
  registrarCompra(data) {
    const errores = [];
    if (!data.proveedor || data.proveedor.trim() === '') errores.push('Proveedor requerido.');
    if (!data.productoId) errores.push('Producto requerido.');
    if (!data.cantidad || Number(data.cantidad) <= 0) errores.push('Cantidad debe ser mayor a cero.');
    if (errores.length > 0) return { success: false, error: errores.join(' ') };

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // Obtener datos del producto
      const prod = this._obtenerProductoPorId(ss, data.productoId);
      if (!prod) return { success: false, error: 'Producto no encontrado.' };

      const cantidad = Number(data.cantidad);
      const costoUnit = Number(data.costoUnit) || 0;
      const total = cantidad * costoUnit;
      const usuario = Session.getActiveUser().getEmail();
      const ahora = new Date();

      // Registrar en historial de compras
      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.COMPRAS);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.COMPRAS); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      hoja.appendRow([
        nuevoId,
        ahora,
        data.proveedor.trim().toUpperCase(),
        prod.id,
        prod.nombre,
        cantidad,
        costoUnit,
        total,
        data.obs || '',
        usuario
      ]);

      // Actualizar stock del producto
      this._aumentarStock(ss, data.productoId, cantidad);

      return { success: true, id: nuevoId, nuevoStock: prod.stock + cantidad };
    } catch (e) {
      Logger.log('[VN_STOCK] Error en registrarCompra: ' + e.message);
      return { success: false, error: 'Error al registrar compra: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Registrar merma (productos tirados/perdidos) ─────────
  registrarMerma(data) {
    const errores = [];
    if (!data.productoId) errores.push('Producto requerido.');
    if (!data.cantidad || Number(data.cantidad) <= 0) errores.push('Cantidad debe ser mayor a cero.');
    if (!data.razon || data.razon.trim() === '') errores.push('La razón de la merma es requerida.');
    if (errores.length > 0) return { success: false, error: errores.join(' ') };

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const prod = this._obtenerProductoPorId(ss, data.productoId);
      if (!prod) return { success: false, error: 'Producto no encontrado.' };

      const cantidad = Number(data.cantidad);
      if (prod.stock < cantidad) {
        return { success: false, error: 'Stock insuficiente. Stock actual: ' + prod.stock + ', intentando registrar merma de: ' + cantidad };
      }

      const usuario = Session.getActiveUser().getEmail();

      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.MERMA);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.MERMA); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      hoja.appendRow([
        nuevoId,
        new Date(),
        prod.id,
        prod.nombre,
        cantidad,
        data.razon.trim(),
        usuario
      ]);

      this._reducirStock(ss, data.productoId, cantidad);

      return { success: true, id: nuevoId, nuevoStock: prod.stock - cantidad };
    } catch (e) {
      Logger.log('[VN_STOCK] Error en registrarMerma: ' + e.message);
      return { success: false, error: 'Error al registrar merma: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Corrección de existencias (razón obligatoria) ────────
  registrarCorreccion(data) {
    if (!data.productoId) return { success: false, error: 'Producto requerido.' };
    if (data.stockNuevo === undefined || data.stockNuevo === null || data.stockNuevo === '') {
      return { success: false, error: 'El stock nuevo es requerido.' };
    }
    if (!data.razon || data.razon.trim().length < 5) {
      return { success: false, error: 'La razón de la corrección es obligatoria (mínimo 5 caracteres).' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const prod = this._obtenerProductoPorId(ss, data.productoId);
      if (!prod) return { success: false, error: 'Producto no encontrado.' };

      const stockNuevo = Number(data.stockNuevo);
      if (stockNuevo < 0) return { success: false, error: 'El stock no puede ser negativo.' };

      const usuario = Session.getActiveUser().getEmail();

      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.CORRECCIONES);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.CORRECCIONES); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      hoja.appendRow([
        nuevoId,
        new Date(),
        prod.id,
        prod.nombre,
        prod.stock,
        stockNuevo,
        data.razon.trim(),
        usuario
      ]);

      // Actualizar stock directamente
      this._setStock(ss, data.productoId, stockNuevo);

      return { success: true, id: nuevoId, stockAnterior: prod.stock, stockNuevo };
    } catch (e) {
      Logger.log('[VN_STOCK] Error en registrarCorreccion: ' + e.message);
      return { success: false, error: 'Error al registrar corrección: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Historial de compras ─────────────────────────────────
  obtenerHistorialCompras(filtros) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.COMPRAS);
    if (!hoja) return { success: true, compras: [] };

    const datos = hoja.getDataRange().getValues();
    let compras = datos.slice(1).map(f => this._mapearCompra(f)).reverse();

    if (filtros && filtros.productoId) {
      compras = compras.filter(c => Number(c.productoId) === Number(filtros.productoId));
    }
    return { success: true, compras };
  },

  // ── Historial de mermas ──────────────────────────────────
  obtenerHistorialMermas(filtros) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.MERMA);
    if (!hoja) return { success: true, mermas: [] };

    const datos = hoja.getDataRange().getValues();
    let mermas = datos.slice(1).map(f => this._mapearMerma(f)).reverse();

    if (filtros && filtros.productoId) {
      mermas = mermas.filter(m => Number(m.productoId) === Number(filtros.productoId));
    }
    return { success: true, mermas };
  },

  // ── Historial de correcciones ────────────────────────────
  obtenerHistorialCorrecciones(filtros) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.CORRECCIONES);
    if (!hoja) return { success: true, correcciones: [] };

    const datos = hoja.getDataRange().getValues();
    let correcciones = datos.slice(1).map(f => this._mapearCorreccion(f)).reverse();

    if (filtros && filtros.productoId) {
      correcciones = correcciones.filter(c => Number(c.productoId) === Number(filtros.productoId));
    }
    return { success: true, correcciones };
  },

  // ── Métodos internos de stock ────────────────────────────

  _obtenerProductoPorId(ss, productoId) {
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    if (!hoja) return null;
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(productoId)) {
        return _mapearProducto(datos[i]);
      }
    }
    return null;
  },

  _aumentarStock(ss, productoId, cantidad) {
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(productoId)) {
        const stockActual = Number(datos[i][CONFIG_VN.COLS_PRODUCTOS.STOCK - 1]) || 0;
        hoja.getRange(i + 1, CONFIG_VN.COLS_PRODUCTOS.STOCK).setValue(stockActual + Number(cantidad));
        SpreadsheetApp.flush();
        return;
      }
    }
  },

  _reducirStock(ss, productoId, cantidad) {
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(productoId)) {
        const stockActual = Number(datos[i][CONFIG_VN.COLS_PRODUCTOS.STOCK - 1]) || 0;
        hoja.getRange(i + 1, CONFIG_VN.COLS_PRODUCTOS.STOCK).setValue(Math.max(0, stockActual - Number(cantidad)));
        SpreadsheetApp.flush();
        return;
      }
    }
  },

  _setStock(ss, productoId, nuevoStock) {
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(productoId)) {
        hoja.getRange(i + 1, CONFIG_VN.COLS_PRODUCTOS.STOCK).setValue(Number(nuevoStock));
        return;
      }
    }
  },

  // ── Descontar stock (llamado por ventas) ─────────────────
  descontarStock(productoId, cantidad) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this._reducirStock(ss, productoId, cantidad);
  },

  // ── Restaurar stock (llamado al cancelar venta) ──────────
  restaurarStock(productoId, cantidad) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this._aumentarStock(ss, productoId, cantidad);
  },

  // ✅ M-03: NUEVO MÉTODO — procesa múltiples descuentos en una sola lectura+escritura
  /**
   * Descuenta stock de múltiples productos en una sola operación Sheets.
   * Reduce N reads + N writes a exactamente 1 read + 1 write.
   * @param {Array<{prodId: number, qty: number}>} items - Items a descontar
   * @returns {Object} { success: boolean, insuficiente: Array<number> }
   *   insuficiente: array de prodIds que quedaron en stock < 0 (advertencia)
   */
  descontarStockBatch: function(items) {
    if (!items || items.length === 0) return { success: true, insuficiente: [] };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    if (!hoja) return { success: false, error: 'Hoja PRODUCTOS no encontrada' };

    const datos = hoja.getDataRange().getValues(); // ← 1 SOLA LECTURA
    const colStock = CONFIG_VN.COLS_PRODUCTOS.STOCK - 1;
    const colId    = 0; // ID siempre en columna A (índice 0)

    // Construir mapa prodId → índice de fila para O(1) lookup
    const indiceProd = new Map();
    for (let i = 1; i < datos.length; i++) {
      indiceProd.set(Number(datos[i][colId]), i);
    }

    const insuficiente = [];
    const filasMod = new Set(); // filas que fueron modificadas

    for (const item of items) {
      const idx = indiceProd.get(Number(item.prodId));
      if (idx === undefined) {
        Logger.log('[VN_STOCK_BATCH] Producto no encontrado: ' + item.prodId);
        continue;
      }
      const stockActual = Number(datos[idx][colStock]) || 0;
      const nuevoStock  = stockActual - Number(item.qty);
      if (nuevoStock < 0) insuficiente.push(item.prodId);
      datos[idx][colStock] = Math.max(0, nuevoStock);
      filasMod.add(idx);
    }

    // Escribir solo las filas que cambiaron, en una sola llamada por fila
    for (const idx of filasMod) {
      hoja.getRange(idx + 1, 1, 1, datos[idx].length).setValues([datos[idx]]);
    }
    SpreadsheetApp.flush();

    if (insuficiente.length > 0) {
      Logger.log('[VN_STOCK_BATCH] Stock insuficiente detectado en productos: ' + insuficiente.join(', '));
    }

    return { success: true, insuficiente };
  },

  // ── Validar stock disponible ─────────────────────────────
  validarStock(items) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const errores = [];
    items.forEach(item => {
      const prod = this._obtenerProductoPorId(ss, item.prodId);
      if (!prod) {
        errores.push('Producto ID ' + item.prodId + ' no encontrado.');
      } else if (prod.stock < item.qty) {
        errores.push(prod.nombre + ': stock insuficiente (disponible: ' + prod.stock + ', solicitado: ' + item.qty + ').');
      }
    });
    return errores;
  },

  // ── Mappers ──────────────────────────────────────────────
  _mapearCompra(fila) {
    const C = CONFIG_VN.COLS_COMPRAS;
    return {
      id: fila[C.ID-1], fecha: fila[C.FECHA-1],
      proveedor: fila[C.PROVEEDOR-1], productoId: fila[C.PRODUCTO_ID-1],
      productoNombre: fila[C.PRODUCTO_NOMBRE-1], cantidad: Number(fila[C.CANTIDAD-1])||0,
      costoUnit: Number(fila[C.COSTO_UNIT-1])||0, total: Number(fila[C.TOTAL-1])||0,
      obs: fila[C.OBS-1]||'', usuario: fila[C.USUARIO-1]
    };
  },

  _mapearMerma(fila) {
    const C = CONFIG_VN.COLS_MERMA;
    return {
      id: fila[C.ID-1], fecha: fila[C.FECHA-1],
      productoId: fila[C.PRODUCTO_ID-1], productoNombre: fila[C.PRODUCTO_NOMBRE-1],
      cantidad: Number(fila[C.CANTIDAD-1])||0, razon: fila[C.RAZON-1]||'',
      usuario: fila[C.USUARIO-1]
    };
  },

  _mapearCorreccion(fila) {
    const C = CONFIG_VN.COLS_CORRECCIONES;
    return {
      id: fila[C.ID-1], fecha: fila[C.FECHA-1],
      productoId: fila[C.PRODUCTO_ID-1], productoNombre: fila[C.PRODUCTO_NOMBRE-1],
      stockAnterior: Number(fila[C.STOCK_ANTERIOR-1])||0,
      stockNuevo: Number(fila[C.STOCK_NUEVO-1])||0,
      razon: fila[C.RAZON-1]||'', usuario: fila[C.USUARIO-1]
    };
  }
};

// ============================================================
//  SECCIÓN 4: PAGOS A CUENTA Y FIADOS
// ============================================================

const VnPagosRepo = {

  // ── Registrar fiado (deuda del cliente) ──────────────────
  registrarFiado(data) {
    if (!data.cliente || data.cliente === 'CONSUMIDOR FINAL') {
      return { success: false, error: 'Los fiados requieren un cliente identificado.' };
    }
    if (!data.monto || Number(data.monto) <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      const saldoActual = this._calcularSaldoDeuda(ss, data.cliente);
      const nuevoSaldo = saldoActual + Number(data.monto);

      hoja.appendRow([
        nuevoId,
        data.sesionId || '',
        new Date(),
        data.cliente.toUpperCase().trim(),
        CONFIG_VN.TIPOS_PAGO.FIADO,
        Number(data.monto),
        nuevoSaldo,
        data.ventaIdRef || '',
        data.obs || '',
        Session.getActiveUser().getEmail()
      ]);

      return { success: true, id: nuevoId, saldoDeuda: nuevoSaldo };
    } catch (e) {
      Logger.log('[VN_PAGOS] Error en registrarFiado: ' + e.message);
      return { success: false, error: 'Error al registrar fiado: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Registrar cobro de fiado ─────────────────────────────
  registrarCobro(data) {
    if (!data.cliente || data.cliente === 'CONSUMIDOR FINAL') {
      return { success: false, error: 'Se requiere cliente identificado para cobros.' };
    }
    if (!data.monto || Number(data.monto) <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      const saldoActual = this._calcularSaldoDeuda(ss, data.cliente);
      const montoCobro = Number(data.monto);
      if (montoCobro > saldoActual) {
        Logger.log('[VN_PAGOS] ADVERTENCIA: Cobro de $' + montoCobro + ' supera la deuda de $' + saldoActual + ' para cliente: ' + data.cliente);
      }
      const nuevoSaldo = Math.max(0, restaFinanciera(saldoActual, montoCobro));

      hoja.appendRow([
        nuevoId,
        data.sesionId || '',
        new Date(),
        data.cliente.toUpperCase().trim(),
        CONFIG_VN.TIPOS_PAGO.COBRO,
        Number(data.monto),
        nuevoSaldo,
        data.ventaIdRef || '',
        data.obs || '',
        Session.getActiveUser().getEmail()
      ]);

      return { success: true, id: nuevoId, saldoDeuda: nuevoSaldo };
    } catch (e) {
      Logger.log('[VN_PAGOS] Error en registrarCobro: ' + e.message);
      return { success: false, error: 'Error al registrar cobro: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Registrar pago a cuenta (genérico) ──────────────────
  registrarPagoACuenta(data) {
    if (!data.cliente || data.cliente.trim() === '') {
      return { success: false, error: 'El cliente es requerido.' };
    }
    if (!data.monto || Number(data.monto) <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
      if (!hoja) { inicializarHojasVN(); hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS); }

      const nuevoId = _obtenerUltimoId(hoja) + 1;
      const saldoActual = this._calcularSaldoDeuda(ss, data.cliente);
      const nuevoSaldo = Math.max(0, restaFinanciera(saldoActual, Number(data.monto)));
      if (Number(data.monto) > saldoActual) {
        Logger.log('[VN_PAGOS] ADVERTENCIA: Pago a cuenta de $' + data.monto + ' supera la deuda de $' + saldoActual + ' para cliente: ' + data.cliente);
      }

      hoja.appendRow([
        nuevoId,
        data.sesionId || '',
        new Date(),
        data.cliente.toUpperCase().trim(),
        CONFIG_VN.TIPOS_PAGO.A_CUENTA,
        Number(data.monto),
        nuevoSaldo,
        '',
        data.obs || '',
        Session.getActiveUser().getEmail()
      ]);

      return { success: true, id: nuevoId };
    } catch (e) {
      Logger.log('[VN_PAGOS] Error en registrarPagoACuenta: ' + e.message);
      return { success: false, error: 'Error al registrar pago a cuenta: ' + e.message };
    } finally {
      lock.releaseLock();
    }
  },

  // ── Obtener deudas activas de un cliente ─────────────────
  obtenerDeudas(cliente) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
    if (!hoja) return { success: true, deudas: [], saldoTotal: 0 };

    const datos = hoja.getDataRange().getValues();
    const nombre = (cliente || '').toUpperCase().trim();

    const movimientos = datos.slice(1)
      .filter(f => !nombre || f[CONFIG_VN.COLS_PAGOS.CLIENTE - 1] === nombre)
      .filter(f => f[CONFIG_VN.COLS_PAGOS.TIPO - 1] === CONFIG_VN.TIPOS_PAGO.FIADO ||
                   f[CONFIG_VN.COLS_PAGOS.TIPO - 1] === CONFIG_VN.TIPOS_PAGO.COBRO)
      .map(f => this._mapear(f));

    const saldoTotal = this._calcularSaldoDeuda(ss, nombre);
    return { success: true, movimientos, saldoTotal };
  },

  // ── Obtener todos los clientes con deuda ─────────────────
  obtenerTodosDeudores() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
    if (!hoja) return { success: true, deudores: [] };

    const datos = hoja.getDataRange().getValues();

    // Agrupar por cliente
    const clientesMap = {};
    datos.slice(1).forEach(fila => {
      const cliente = fila[CONFIG_VN.COLS_PAGOS.CLIENTE - 1];
      const tipo = fila[CONFIG_VN.COLS_PAGOS.TIPO - 1];
      const monto = Number(fila[CONFIG_VN.COLS_PAGOS.MONTO - 1]) || 0;

      if (!clientesMap[cliente]) clientesMap[cliente] = 0;
      if (tipo === CONFIG_VN.TIPOS_PAGO.FIADO)    clientesMap[cliente] += monto;
      if (tipo === CONFIG_VN.TIPOS_PAGO.COBRO)    clientesMap[cliente] -= monto;
      if (tipo === CONFIG_VN.TIPOS_PAGO.A_CUENTA) clientesMap[cliente] -= monto;
    });

    const deudores = Object.entries(clientesMap)
      .filter(([_, saldo]) => saldo > 0)
      .map(([cliente, saldo]) => ({ cliente, saldo }))
      .sort((a, b) => b.saldo - a.saldo);

    return { success: true, deudores };
  },

  // ── Movimientos de una sesión ────────────────────────────
  obtenerPorSesion(sesionId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
    if (!hoja) return { success: true, pagos: [] };

    const datos = hoja.getDataRange().getValues();
    const pagos = datos.slice(1)
      .filter(f => Number(f[CONFIG_VN.COLS_PAGOS.SESION_ID - 1]) === Number(sesionId))
      .map(f => this._mapear(f));

    return { success: true, pagos };
  },

  // ── Calcular saldo de deuda de un cliente ────────────────
  calcularSaldoCliente(cliente) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saldo = this._calcularSaldoDeuda(ss, cliente);
    return { success: true, saldo, cliente: cliente.toUpperCase().trim() };
  },

  // ── Helpers internos ─────────────────────────────────────

  _calcularSaldoDeuda(ss, cliente) {
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PAGOS);
    if (!hoja) return 0;
    const datos = hoja.getDataRange().getValues();
    const nombre = (cliente || '').toUpperCase().trim();
    let saldo = 0;

    datos.slice(1).forEach(fila => {
      if (fila[CONFIG_VN.COLS_PAGOS.CLIENTE - 1] !== nombre) return;
      const tipo = fila[CONFIG_VN.COLS_PAGOS.TIPO - 1];
      const monto = Number(fila[CONFIG_VN.COLS_PAGOS.MONTO - 1]) || 0;
      if (tipo === CONFIG_VN.TIPOS_PAGO.FIADO)    saldo += monto;
      if (tipo === CONFIG_VN.TIPOS_PAGO.COBRO)    saldo -= monto;
      if (tipo === CONFIG_VN.TIPOS_PAGO.A_CUENTA) saldo -= monto;
    });

    return Math.max(0, saldo);
  },

  _mapear(fila) {
    const C = CONFIG_VN.COLS_PAGOS;
    return {
      id:          fila[C.ID - 1],
      sesionId:    fila[C.SESION_ID - 1],
      fecha:       fila[C.FECHA - 1],
      cliente:     fila[C.CLIENTE - 1],
      tipo:        fila[C.TIPO - 1],
      monto:       Number(fila[C.MONTO - 1]) || 0,
      saldoDeuda:  Number(fila[C.SALDO_DEUDA - 1]) || 0,
      ventaIdRef:  fila[C.VENTA_ID_REF - 1] || '',
      obs:         fila[C.OBS - 1] || '',
      usuario:     fila[C.USUARIO - 1]
    };
  }
};

// ============================================================
//  SECCIÓN 5: WRAPPERS PARA MAIN.GS (TODOS LOS MÓDULOS)
// ============================================================

// ── Wrappers: VALES ────────────────────────────────────────
function vnCrearVale(data) {
  return VnValesRepo.crear(data);
}

function vnBuscarVale(numero) {
  return VnValesRepo.buscar(numero);
}

function vnAnularVale(data) {
  return VnValesRepo.anular(data.numero, data.razon);
}

function vnGetVales(filtros) {
  return VnValesRepo.obtenerTodos(filtros);
}

function vnGetValesCliente(cliente) {
  return VnValesRepo.buscarPorCliente(cliente);
}

// ── Wrappers: VENTAS ───────────────────────────────────────
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

// ── Wrappers: STOCK ────────────────────────────────────────
function vnGetExistencias() {
  return VnStockRepo.obtenerExistencias();
}

function vnRegistrarCompra(data) {
  return VnStockRepo.registrarCompra(data);
}

function vnRegistrarMerma(data) {
  return VnStockRepo.registrarMerma(data);
}

function vnRegistrarCorreccion(data) {
  return VnStockRepo.registrarCorreccion(data);
}

function vnGetHistorialCompras(filtros) {
  return VnStockRepo.obtenerHistorialCompras(filtros);
}

function vnGetHistorialMermas(filtros) {
  return VnStockRepo.obtenerHistorialMermas(filtros);
}

function vnGetHistorialCorrecciones(filtros) {
  return VnStockRepo.obtenerHistorialCorrecciones(filtros);
}

// ── Wrappers: PAGOS ────────────────────────────────────────
function vnRegistrarFiado(data) {
  return VnPagosRepo.registrarFiado(data);
}

function vnRegistrarCobro(data) {
  return VnPagosRepo.registrarCobro(data);
}

function vnRegistrarPagoACuenta(data) {
  return VnPagosRepo.registrarPagoACuenta(data);
}

function vnGetDeudas(cliente) {
  if (cliente) return VnPagosRepo.obtenerDeudas(cliente);
  return VnPagosRepo.obtenerTodosDeudores();
}

function vnGetPagosSesion(sesionId) {
  return VnPagosRepo.obtenerPorSesion(sesionId);
}

function vnGetSaldoCliente(cliente) {
  return VnPagosRepo.calcularSaldoCliente(cliente);
}
