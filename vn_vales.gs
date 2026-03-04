// ============================================================
//  MÓDULO: VENTA NOCTURNA — Repositorio de Vales
//  Vales de canje: numeración única VL-YYYY-NNNNN
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

// ── Wrappers para main.gs ─────────────────────────────────────

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
