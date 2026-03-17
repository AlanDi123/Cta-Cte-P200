// ============================================================
//  MÓDULO: VENTA NOCTURNA — Configuración, Hojas y Sesiones
//  Sol & Verde — Sistema POS Nocturno
// ============================================================

// Configuración de Venta Nocturna (accesible globalmente)
// Usamos asignación directa para evitar problemas con IIFE en GAS
var CONFIG_VN = {
  HOJAS: {
    SESIONES:      'VN_SESIONES',
    PRODUCTOS:     'VN_PRODUCTOS',
    VENTAS:        'VN_VENTAS',
    VALES:         'VN_VALES',
    PAGOS:         'VN_PAGOS_CUENTA',
    COMPRAS:       'VN_STOCK_COMPRAS',
    MERMA:         'VN_STOCK_MERMA',
    CORRECCIONES:  'VN_STOCK_CORRECCIONES'
  },
  BANCOS: ['Santander', 'Mercado Pago', 'Macro'],
  MEDIOS_PAGO: ['EFECTIVO', 'TRANSFERENCIA', 'VALE', 'FIADO', 'A_CUENTA'],
  ESTADOS_SESION: { ABIERTA: 'ABIERTA', CERRADA: 'CERRADA' },
  ESTADOS_VENTA:  { CONFIRMADA: 'CONFIRMADA', CANCELADA: 'CANCELADA' },
  ESTADOS_VALE:   { DISPONIBLE: 'DISPONIBLE', CANJEADO: 'CANJEADO', ANULADO: 'ANULADO' },
  TIPOS_PAGO:     { FIADO: 'FIADO', COBRO: 'COBRO', A_CUENTA: 'PAGO_A_CUENTA' },

  // Columnas de cada hoja (índice base 1 para setValues/getValues)
  COLS_SESIONES: {
    ID: 1, FECHA: 2, HORA_APERTURA: 3, HORA_CIERRE: 4, ESTADO: 5,
    TOTAL_VENTAS: 6, TOTAL_EFECTIVO: 7, TOTAL_TRANSFERENCIA: 8,
    TOTAL_VALES: 9, TOTAL_FIADO: 10, TOTAL_A_CUENTA: 11,
    RAZON_REAPERTURA: 12, USUARIO: 13
  },
  COLS_PRODUCTOS: {
    ID: 1, NOMBRE: 2, PRECIO: 3, STOCK: 4, ACTIVO: 5
  },
  COLS_VENTAS: {
    ID: 1, SESION_ID: 2, FECHA: 3, HORA: 4, CLIENTE: 5,
    ITEMS_JSON: 6, SUBTOTAL: 7, TOTAL: 8,
    MEDIOS_PAGO_JSON: 9, ESTADO: 10, OBS: 11, USUARIO: 12
  },
  COLS_VALES: {
    ID: 1, NUMERO: 2, FECHA_EMISION: 3, MONTO: 4, CLIENTE: 5,
    MOTIVO: 6, ESTADO: 7, FECHA_CANJE: 8, VENTA_ID_CANJE: 9,
    OBS: 10, USUARIO: 11
  },
  COLS_PAGOS: {
    ID: 1, SESION_ID: 2, FECHA: 3, CLIENTE: 4, TIPO: 5,
    MONTO: 6, SALDO_DEUDA: 7, VENTA_ID_REF: 8, OBS: 9, USUARIO: 10
  },
  COLS_COMPRAS: {
    ID: 1, FECHA: 2, PROVEEDOR: 3, PRODUCTO_ID: 4, PRODUCTO_NOMBRE: 5,
    CANTIDAD: 6, COSTO_UNIT: 7, TOTAL: 8, OBS: 9, USUARIO: 10
  },
  COLS_MERMA: {
    ID: 1, FECHA: 2, PRODUCTO_ID: 3, PRODUCTO_NOMBRE: 4,
    CANTIDAD: 5, RAZON: 6, USUARIO: 7
  },
  COLS_CORRECCIONES: {
    ID: 1, FECHA: 2, PRODUCTO_ID: 3, PRODUCTO_NOMBRE: 4,
    STOCK_ANTERIOR: 5, STOCK_NUEVO: 6, RAZON: 7, USUARIO: 8
  }
};

// ─────────────────────────────────────────────────────────────
//  INICIALIZACIÓN DE HOJAS
// ─────────────────────────────────────────────────────────────

function inicializarHojasVN() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const definiciones = [
    {
      nombre: CONFIG_VN.HOJAS.SESIONES,
      headers: ['ID','FECHA','HORA_APERTURA','HORA_CIERRE','ESTADO',
                'TOTAL_VENTAS','TOTAL_EFECTIVO','TOTAL_TRANSFERENCIA',
                'TOTAL_VALES','TOTAL_FIADO','TOTAL_A_CUENTA',
                'RAZON_REAPERTURA','USUARIO'],
      color: '#1A237E', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.PRODUCTOS,
      headers: ['ID','NOMBRE','PRECIO','STOCK','ACTIVO'],
      color: '#1B5E20', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.VENTAS,
      headers: ['ID','SESION_ID','FECHA','HORA','CLIENTE',
                'ITEMS_JSON','SUBTOTAL','TOTAL',
                'MEDIOS_PAGO_JSON','ESTADO','OBS','USUARIO'],
      color: '#0D47A1', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.VALES,
      headers: ['ID','NUMERO','FECHA_EMISION','MONTO','CLIENTE',
                'MOTIVO','ESTADO','FECHA_CANJE','VENTA_ID_CANJE',
                'OBS','USUARIO'],
      color: '#4A148C', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.PAGOS,
      headers: ['ID','SESION_ID','FECHA','CLIENTE','TIPO',
                'MONTO','SALDO_DEUDA','VENTA_ID_REF','OBS','USUARIO'],
      color: '#BF360C', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.COMPRAS,
      headers: ['ID','FECHA','PROVEEDOR','PRODUCTO_ID','PRODUCTO_NOMBRE',
                'CANTIDAD','COSTO_UNIT','TOTAL','OBS','USUARIO'],
      color: '#37474F', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.MERMA,
      headers: ['ID','FECHA','PRODUCTO_ID','PRODUCTO_NOMBRE',
                'CANTIDAD','RAZON','USUARIO'],
      color: '#B71C1C', colorTexto: '#FFFFFF'
    },
    {
      nombre: CONFIG_VN.HOJAS.CORRECCIONES,
      headers: ['ID','FECHA','PRODUCTO_ID','PRODUCTO_NOMBRE',
                'STOCK_ANTERIOR','STOCK_NUEVO','RAZON','USUARIO'],
      color: '#E65100', colorTexto: '#FFFFFF'
    }
  ];

  definiciones.forEach(def => {
    let hoja = ss.getSheetByName(def.nombre);
    if (!hoja) {
      hoja = ss.insertSheet(def.nombre);
      hoja.appendRow(def.headers);
      hoja.getRange(1, 1, 1, def.headers.length)
          .setFontWeight('bold')
          .setBackground(def.color)
          .setFontColor(def.colorTexto);
      hoja.setFrozenRows(1);
      hoja.setColumnWidth(1, 60);
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  GESTIÓN DE SESIONES
// ─────────────────────────────────────────────────────────────

function vnAbrirSesion() {
  const usuario = Session.getActiveUser().getEmail();
  const sesionActiva = obtenerSesionActivaVN(usuario);
  if (sesionActiva) {
    return { success: false, error: 'Ya tenés una sesión abierta (#' + sesionActiva.id + ').' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
    if (!hoja) inicializarHojasVN();

    const datos = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES).getDataRange().getValues();
    const ultimoId = datos.length > 1
      ? Math.max(...datos.slice(1).map(r => Number(r[0]) || 0))
      : 0;
    const nuevoId = ultimoId + 1;
    const ahora = new Date();

    ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES).appendRow([
      nuevoId,
      Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      ahora,
      '',
      CONFIG_VN.ESTADOS_SESION.ABIERTA,
      0, 0, 0, 0, 0, 0,
      '',
      usuario
    ]);

    return { success: true, sesion: { id: nuevoId, fecha: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'dd/MM/yyyy'), estado: 'ABIERTA', usuario } };
  } catch (e) {
    return { success: false, error: 'Error al abrir sesión: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

function vnCerrarSesion(sesionId) {
  if (!sesionId) return { success: false, error: 'ID de sesión requerido.' };

  const usuario = Session.getActiveUser().getEmail();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
    const datos = hoja.getDataRange().getValues();

    let filaIdx = -1;
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(sesionId)) { filaIdx = i + 1; break; }
    }
    if (filaIdx === -1) return { success: false, error: 'Sesión no encontrada.' };

    // Calcular totales de la sesión
    const totales = _calcularTotalesSesion(ss, sesionId);

    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.HORA_CIERRE).setValue(new Date());
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.ESTADO).setValue(CONFIG_VN.ESTADOS_SESION.CERRADA);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_VENTAS).setValue(totales.totalVentas);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_EFECTIVO).setValue(totales.efectivo);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_TRANSFERENCIA).setValue(totales.transferencia);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_VALES).setValue(totales.vales);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_FIADO).setValue(totales.fiado);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.TOTAL_A_CUENTA).setValue(totales.aCuenta);

    return { success: true, totales };
  } catch (e) {
    return { success: false, error: 'Error al cerrar sesión: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

function vnGetSesionActiva() {
  const usuario = Session.getActiveUser().getEmail();
  const sesion = obtenerSesionActivaVN(usuario);
  return { success: true, sesion };
}

function obtenerSesionActivaVN(usuario) {
  const email = usuario || Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
  if (!hoja) return null;

  const datos = hoja.getDataRange().getValues();
  for (let i = datos.length - 1; i >= 1; i--) {
    const fila = datos[i];
    if (fila[CONFIG_VN.COLS_SESIONES.ESTADO - 1] === CONFIG_VN.ESTADOS_SESION.ABIERTA &&
        fila[CONFIG_VN.COLS_SESIONES.USUARIO - 1] === email) {
      return _mapearSesion(fila);
    }
  }
  return null;
}

function vnReabrirSesion(data) {
  if (!data.sesionId || !data.razon || data.razon.trim() === '') {
    return { success: false, error: 'Se requiere ID de sesión y razón de reapertura.' };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
    const datos = hoja.getDataRange().getValues();
    let filaIdx = -1;
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(data.sesionId)) { filaIdx = i + 1; break; }
    }
    if (filaIdx === -1) return { success: false, error: 'Sesión no encontrada.' };

    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.ESTADO).setValue(CONFIG_VN.ESTADOS_SESION.ABIERTA);
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.HORA_CIERRE).setValue('');
    hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.RAZON_REAPERTURA).setValue(data.razon.trim());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function vnGetHistorialSesiones(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.SESIONES);
  if (!hoja) return { success: true, sesiones: [] };

  const datos = hoja.getDataRange().getValues();
  const sesiones = datos.slice(1)
    .map(fila => _mapearSesion(fila))
    .reverse()
    .slice(0, limit || 30);

  return { success: true, sesiones };
}

// ─────────────────────────────────────────────────────────────
//  GESTIÓN DE PRODUCTOS VN
// ─────────────────────────────────────────────────────────────

function vnGetProductos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
  if (!hoja) return { success: true, productos: [] };

  const datos = hoja.getDataRange().getValues();
  const productos = datos.slice(1).map(f => _mapearProducto(f));
  return { success: true, productos };
}

function vnCrearProducto(data) {
  if (!data.nombre || !data.precio) {
    return { success: false, error: 'Nombre y precio son requeridos.' };
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    const ultimoId = datos.length > 1 ? Math.max(...datos.slice(1).map(r => Number(r[0]) || 0)) : 0;
    const nuevoId = ultimoId + 1;

    hoja.appendRow([
      nuevoId,
      data.nombre.toUpperCase().trim(),
      Number(data.precio) || 0,
      Number(data.stock) || 0,
      true
    ]);
    return { success: true, id: nuevoId };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function vnActualizarProducto(data) {
  if (!data.id) return { success: false, error: 'ID requerido.' };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    let filaIdx = -1;
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(data.id)) { filaIdx = i + 1; break; }
    }
    if (filaIdx === -1) return { success: false, error: 'Producto no encontrado.' };

    if (data.nombre !== undefined) hoja.getRange(filaIdx, CONFIG_VN.COLS_PRODUCTOS.NOMBRE).setValue(data.nombre.toUpperCase().trim());
    if (data.precio !== undefined) hoja.getRange(filaIdx, CONFIG_VN.COLS_PRODUCTOS.PRECIO).setValue(Number(data.precio));
    if (data.stock !== undefined)  hoja.getRange(filaIdx, CONFIG_VN.COLS_PRODUCTOS.STOCK).setValue(Number(data.stock));
    if (data.activo !== undefined) hoja.getRange(filaIdx, CONFIG_VN.COLS_PRODUCTOS.ACTIVO).setValue(Boolean(data.activo));

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function vnToggleProducto(id) {
  if (!id) return { success: false, error: 'ID requerido.' };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG_VN.HOJAS.PRODUCTOS);
    const datos = hoja.getDataRange().getValues();
    let filaIdx = -1, estadoActual;
    for (let i = 1; i < datos.length; i++) {
      if (Number(datos[i][0]) === Number(id)) {
        filaIdx = i + 1;
        estadoActual = datos[i][CONFIG_VN.COLS_PRODUCTOS.ACTIVO - 1];
        break;
      }
    }
    if (filaIdx === -1) return { success: false, error: 'Producto no encontrado.' };
    hoja.getRange(filaIdx, CONFIG_VN.COLS_PRODUCTOS.ACTIVO).setValue(!estadoActual);
    return { success: true, activo: !estadoActual };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────
//  CLIENTES (lectura del sheet CLIENTES existente)
// ─────────────────────────────────────────────────────────────

function vnGetClientes(termino) {
  try {
    if (!termino || termino.trim().length < 2) {
      return { success: true, clientes: [] };
    }
    // FIX: era ClientesRepo (indefinido) → ClientesRepository
    var resultado = ClientesRepository.buscarConSugerencias(termino.trim());
    var lista = [];
    if (resultado.exacto) lista.push(resultado.exacto.nombre);
    if (resultado.sugerencias) {
      resultado.sugerencias.forEach(function(c) {
        var nombre = typeof c === 'string' ? c : (c.nombre || '');
        if (nombre && lista.indexOf(nombre) === -1) lista.push(nombre);
      });
    }
    return { success: true, clientes: lista };
  } catch (e) {
    Logger.log('[VN] vnGetClientes error: ' + e.message);
    return { success: false, error: e.message, clientes: [] };
  }
}

function vnCrearClienteRapido(data) {
  if (!data.nombre || data.nombre.trim() === '') {
    return { success: false, error: 'El nombre es requerido.' };
  }
  try {
    // FIX: era ClientesRepo (indefinido) → ClientesRepository
    var resultado = ClientesRepository.crear({
      nombre: data.nombre.toUpperCase().trim(),
      tel:    data.tel   || '',
      email:  data.email || '',
      obs:    'Creado desde Venta Nocturna'
    });
    return resultado;
  } catch (e) {
    Logger.log('[VN] vnCrearClienteRapido error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────

function _mapearSesion(fila) {
  const C = CONFIG_VN.COLS_SESIONES;
  return {
    id:           fila[C.ID - 1],
    fecha:        fila[C.FECHA - 1],
    horaApertura: fila[C.HORA_APERTURA - 1],
    horaCierre:   fila[C.HORA_CIERRE - 1],
    estado:       fila[C.ESTADO - 1],
    totalVentas:  fila[C.TOTAL_VENTAS - 1] || 0,
    totalEfectivo: fila[C.TOTAL_EFECTIVO - 1] || 0,
    totalTransferencia: fila[C.TOTAL_TRANSFERENCIA - 1] || 0,
    totalVales:   fila[C.TOTAL_VALES - 1] || 0,
    totalFiado:   fila[C.TOTAL_FIADO - 1] || 0,
    totalACuenta: fila[C.TOTAL_A_CUENTA - 1] || 0,
    razonReapertura: fila[C.RAZON_REAPERTURA - 1] || '',
    usuario:      fila[C.USUARIO - 1]
  };
}

function _mapearProducto(fila) {
  const C = CONFIG_VN.COLS_PRODUCTOS;
  return {
    id:     fila[C.ID - 1],
    nombre: fila[C.NOMBRE - 1],
    precio: fila[C.PRECIO - 1] || 0,
    stock:  fila[C.STOCK - 1] || 0,
    activo: fila[C.ACTIVO - 1] === true || fila[C.ACTIVO - 1] === 'TRUE'
  };
}

function _calcularTotalesSesion(ss, sesionId) {
  const hVentas = ss.getSheetByName(CONFIG_VN.HOJAS.VENTAS);
  const totales = { totalVentas: 0, efectivo: 0, transferencia: 0, vales: 0, fiado: 0, aCuenta: 0 };

  if (!hVentas) return totales;
  const datos = hVentas.getDataRange().getValues();

  datos.slice(1).forEach(fila => {
    const C = CONFIG_VN.COLS_VENTAS;
    if (Number(fila[C.SESION_ID - 1]) !== Number(sesionId)) return;
    if (fila[C.ESTADO - 1] === CONFIG_VN.ESTADOS_VENTA.CANCELADA) return;

    const total = Number(fila[C.TOTAL - 1]) || 0;
    totales.totalVentas += total;

    try {
      const medios = JSON.parse(fila[C.MEDIOS_PAGO_JSON - 1] || '[]');
      medios.forEach(m => {
        const monto = Number(m.monto) || 0;
        switch (m.tipo) {
          case 'EFECTIVO':       totales.efectivo += monto; break;
          case 'TRANSFERENCIA':  totales.transferencia += monto; break;
          case 'VALE':           totales.vales += monto; break;
          case 'FIADO':          totales.fiado += monto; break;
          case 'A_CUENTA':       totales.aCuenta += monto; break;
        }
      });
    } catch (_) {}
  });

  return totales;
}

function _obtenerUltimoId(hoja) {
  const datos = hoja.getDataRange().getValues();
  if (datos.length <= 1) return 0;
  return Math.max(...datos.slice(1).map(r => Number(r[0]) || 0));
}

// ─────────────────────────────────────────────────────────────
//  DISPATCHER — Llamado directo desde el frontend via
//  google.script.run.ejecutarAccionVN(data)
// ─────────────────────────────────────────────────────────────

function ejecutarAccionVN(data) {
  if (!data || !data.action) return { success: false, error: 'Acción requerida.' };
  try {
    switch (data.action) {
      // Inicialización
      case 'vnInicializarHojas':   return (inicializarHojasVN(), { success: true });
      // Sesiones
      case 'vnAbrirSesion':        return vnAbrirSesion();
      case 'vnCerrarSesion':       return vnCerrarSesion(data.sesionId);
      case 'vnGetSesionActiva':    return vnGetSesionActiva();
      case 'vnReabrirSesion':      return vnReabrirSesion(data);
      case 'vnGetHistorialSesiones': return vnGetHistorialSesiones(data.limit);
      // Productos VN
      case 'vnGetProductos':       return vnGetProductos();
      case 'vnCrearProducto':      return vnCrearProducto(data);
      case 'vnActualizarProducto': return vnActualizarProducto(data);
      case 'vnToggleProducto':     return vnToggleProducto(data.id);
      // Ventas
      case 'vnRegistrarVenta':     return vnRegistrarVenta(data);
      case 'vnCancelarVenta':      return vnCancelarVenta(data.ventaId);
      case 'vnGetVentasSesion':    return vnGetVentasSesion(data.sesionId);
      case 'vnGetResumenSesion':   return vnGetResumenSesion(data.sesionId);
      // Vales
      case 'vnCrearVale':          return vnCrearVale(data);
      case 'vnBuscarVale':         return vnBuscarVale(data.numero);
      case 'vnAnularVale':         return vnAnularVale(data);
      case 'vnGetVales':           return vnGetVales(data.filtros);
      case 'vnGetValesCliente':    return vnGetValesCliente(data.cliente);
      // Stock
      case 'vnGetExistencias':     return vnGetExistencias();
      case 'vnRegistrarCompra':    return vnRegistrarCompra(data);
      case 'vnRegistrarMerma':     return vnRegistrarMerma(data);
      case 'vnRegistrarCorreccion': return vnRegistrarCorreccion(data);
      case 'vnGetHistorialCompras':    return vnGetHistorialCompras(data.filtros);
      case 'vnGetHistorialMermas':     return vnGetHistorialMermas(data.filtros);
      case 'vnGetHistorialCorrecciones': return vnGetHistorialCorrecciones(data.filtros);
      // Pagos
      case 'vnRegistrarFiado':     return vnRegistrarFiado(data);
      case 'vnRegistrarCobro':     return vnRegistrarCobro(data);
      case 'vnRegistrarPagoACuenta': return vnRegistrarPagoACuenta(data);
      case 'vnGetDeudas':          return vnGetDeudas(data.cliente);
      case 'vnGetPagosSesion':     return vnGetPagosSesion(data.sesionId);
      case 'vnGetSaldoCliente':    return vnGetSaldoCliente(data.cliente);
      // Clientes
      case 'vnGetClientes':        return vnGetClientes(data.termino);
      case 'vnCrearClienteRapido': return vnCrearClienteRapido(data);
      default:
        return { success: false, error: 'Acción VN no reconocida: ' + data.action };
    }
  } catch (e) {
    Logger.log('Error en ejecutarAccionVN (' + data.action + '): ' + e.message);
    return { success: false, error: e.message };
  }
}
