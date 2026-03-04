// ============================================================
//  MÓDULO: VENTA NOCTURNA — Repositorio de Pagos a Cuenta y Fiados
//  Fiados: ventas a crédito. Cobros: cobranza de fiados.
//  Pagos a cuenta: pagos parciales o anticipados de clientes.
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
      const nuevoSaldo = Math.max(0, restaFinanciera(saldoActual, Number(data.monto))); // ← LÍNEA CORREGIDA
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
        nuevoSaldo,     // ← CORREGIDO: guarda el saldo POST-pago
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
      if (tipo === CONFIG_VN.TIPOS_PAGO.A_CUENTA) clientesMap[cliente] -= monto; // ← LÍNEA AGREGADA
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
      if (tipo === CONFIG_VN.TIPOS_PAGO.A_CUENTA) saldo -= monto; // ← LÍNEA AGREGADA
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

// ── Wrappers para main.gs ─────────────────────────────────────

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
