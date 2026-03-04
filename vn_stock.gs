// ============================================================
//  MÓDULO: VENTA NOCTURNA — Repositorio de Stock
//  Compras de proveedor, Merma, Correcciones de Existencias
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
        SpreadsheetApp.flush(); // ← LÍNEA AGREGADA
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
        SpreadsheetApp.flush(); // ← LÍNEA AGREGADA
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

// ── Wrappers para main.gs ─────────────────────────────────────

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
