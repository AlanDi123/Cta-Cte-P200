/**
 * ============================================================================
 * MAIN - SISTEMA SOL & VERDE
 * ============================================================================
 * Punto de entrada y APIs publicas expuestas al frontend
 * Version: 2.0.0
 * ============================================================================
 */

// Variable global para el spreadsheet
let _spreadsheet = null;

/**
 * Obtiene el spreadsheet activo o por ID
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  if (_spreadsheet) return _spreadsheet;

  const propiedades = PropertiesService.getScriptProperties();

  // Intentar obtener por ID guardado
  const spreadsheetId = propiedades.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    try {
      _spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      return _spreadsheet;
    } catch (e) {
      Logger.log('No se pudo abrir por ID, intentando activo...');
    }
  }

  // Intentar obtener el activo
  try {
    _spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (_spreadsheet) {
      // Guardar ID para futuro
      propiedades.setProperty('SPREADSHEET_ID', _spreadsheet.getId());
      return _spreadsheet;
    }
  } catch (e) {
    Logger.log('Error obteniendo spreadsheet activo: ' + e.message);
  }

  throw new Error('No se pudo acceder al spreadsheet. Ejecuta inicializarSistema() desde el editor.');
}

/**
 * Punto de entrada para Web App
 * @returns {HtmlOutput}
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('SistemaSolVerde')
    .setTitle('Sol & Verde - Sistema de Cuenta Corriente')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Inicializa el sistema
 * @returns {Object} Resultado de la inicializacion
 */
function inicializarSistema() {
  try {
    Logger.log('=== INICIALIZANDO SISTEMA SOL & VERDE V2.0 ===');

    // Verificar spreadsheet
    const ss = getSpreadsheet();
    Logger.log('Spreadsheet: ' + ss.getName());

    // Verificar/crear hojas
    ClientesRepository.getHoja();
    Logger.log('Hoja CLIENTES: OK');

    MovimientosRepository.getHoja();
    Logger.log('Hoja MOVIMIENTOS: OK');

    CajaRepository.getHoja();
    Logger.log('Hoja CAJA_ARQUEOS: OK');

    Logger.log('=== SISTEMA INICIALIZADO CORRECTAMENTE ===');

    return {
      success: true,
      mensaje: 'Sistema inicializado correctamente',
      spreadsheet: ss.getName()
    };

  } catch (error) {
    Logger.log('ERROR en inicializacion: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - DATOS INICIALES
// ============================================================================

/**
 * Obtiene datos iniciales para el dashboard
 * @returns {Object} {clientes, movimientos, estadisticas}
 */
function obtenerDatosParaHTML() {
  try {
    const clientes = ClientesRepository.obtenerTodos(0, CONFIG.PAGINATION.DEFAULT_PAGE_SIZE);
    const movimientos = MovimientosRepository.obtenerRecientes(50);
    const totalClientes = ClientesRepository.contarTotal();

    return {
      success: true,
      clientes: serializarParaWeb(clientes),
      movimientos: serializarParaWeb(movimientos),
      totalClientes: totalClientes,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    Logger.log('Error en obtenerDatosParaHTML: ' + error.message);
    return {
      success: false,
      error: error.message,
      clientes: [],
      movimientos: []
    };
  }
}

/**
 * Obtiene estadisticas del sistema
 * @returns {Object} Estadisticas completas
 */
function obtenerEstadisticas() {
  try {
    const totalClientes = ClientesRepository.contarTotal();
    const deudores = ClientesRepository.obtenerDeudores();
    const estadsMov = MovimientosRepository.obtenerEstadisticas();

    // Top 10 deudores
    const topDeudores = deudores.slice(0, 10).map(c => ({
      nombre: c.nombre,
      saldo: c.saldo
    }));

    // Total adeudado
    const totalAdeudado = deudores.reduce((sum, c) => sum + c.saldo, 0);

    return {
      success: true,
      totalClientes: totalClientes,
      totalDeudores: deudores.length,
      totalAdeudado: totalAdeudado,
      topDeudores: topDeudores,
      movimientos: estadsMov,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    Logger.log('Error en obtenerEstadisticas: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - CLIENTES
// ============================================================================

/**
 * Crea un nuevo cliente
 * @param {Object} clienteData - Datos del cliente
 * @returns {Object} Cliente creado
 */
function crearCliente(clienteData) {
  try {
    const cliente = ClientesRepository.crear(clienteData);
    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      mensaje: 'Cliente creado: ' + cliente.nombre
    };
  } catch (error) {
    Logger.log('Error en crearCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Actualiza un cliente existente
 * @param {string} nombre - Nombre del cliente
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Cliente actualizado
 */
function actualizarCliente(nombre, datos) {
  try {
    const cliente = ClientesRepository.actualizar(nombre, datos);
    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      mensaje: 'Cliente actualizado'
    };
  } catch (error) {
    Logger.log('Error en actualizarCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Elimina un cliente y todos sus movimientos
 * @param {string} nombre - Nombre del cliente
 * @returns {Object} Resultado
 */
function eliminarCliente(nombre) {
  try {
    // Primero eliminar movimientos
    MovimientosRepository.eliminarPorCliente(nombre);

    // Luego eliminar cliente
    ClientesRepository.eliminar(nombre);

    return {
      success: true,
      mensaje: 'Cliente eliminado: ' + nombre
    };
  } catch (error) {
    Logger.log('Error en eliminarCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Busca un cliente con sugerencias fuzzy
 * @param {string} termino - Termino de busqueda
 * @returns {Object} {exacto, sugerencias}
 */
function buscarCliente(termino) {
  try {
    const resultado = ClientesRepository.buscarConSugerencias(termino);
    return {
      success: true,
      exacto: resultado.exacto ? serializarParaWeb(resultado.exacto) : null,
      sugerencias: serializarParaWeb(resultado.sugerencias)
    };
  } catch (error) {
    Logger.log('Error en buscarCliente: ' + error.message);
    return {
      success: false,
      error: error.message,
      exacto: null,
      sugerencias: []
    };
  }
}

/**
 * Obtiene el historial completo de un cliente
 * @param {string} nombre - Nombre del cliente
 * @returns {Object} {cliente, movimientos}
 */
function obtenerHistorialCliente(nombre) {
  try {
    const cliente = ClientesRepository.buscarPorNombre(nombre);
    if (!cliente) {
      return {
        success: false,
        error: 'Cliente no encontrado: ' + nombre
      };
    }

    const movimientos = MovimientosRepository.obtenerPorCliente(nombre);

    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      movimientos: serializarParaWeb(movimientos)
    };
  } catch (error) {
    Logger.log('Error en obtenerHistorialCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene todos los clientes deudores (para impresion)
 * @returns {Object} {deudores}
 */
function obtenerDeudores() {
  try {
    const deudores = ClientesRepository.obtenerDeudores();
    return {
      success: true,
      deudores: serializarParaWeb(deudores),
      totalAdeudado: deudores.reduce((sum, c) => sum + c.saldo, 0)
    };
  } catch (error) {
    Logger.log('Error en obtenerDeudores: ' + error.message);
    return {
      success: false,
      error: error.message,
      deudores: []
    };
  }
}

/**
 * Obtiene saldos de deudores con movimientos del dia especificado
 * @param {string} fecha - Fecha en formato YYYY-MM-DD (opcional, default hoy)
 * @returns {Object} {deudores: [{nombre, saldo, pagosDia, fiadosDia}], totalAdeudado}
 */
function obtenerSaldosConMovimientosDia(fecha) {
  try {
    const fechaFiltro = fecha ? parsearFechaLocal(fecha) : new Date();
    fechaFiltro.setHours(0, 0, 0, 0);
    const fechaFin = new Date(fechaFiltro);
    fechaFin.setHours(23, 59, 59, 999);

    // Obtener todos los deudores
    const deudores = ClientesRepository.obtenerDeudores();

    // Obtener movimientos del dia
    const movimientosDia = MovimientosRepository.obtenerPorRango(fechaFiltro, fechaFin);

    // Agrupar movimientos por cliente
    const movsPorCliente = {};
    for (const mov of movimientosDia) {
      if (!movsPorCliente[mov.cliente]) {
        movsPorCliente[mov.cliente] = { pagos: 0, fiados: 0 };
      }
      if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.HABER) {
        movsPorCliente[mov.cliente].pagos += mov.monto;
      } else {
        movsPorCliente[mov.cliente].fiados += mov.monto;
      }
    }

    // Enriquecer deudores con movimientos del dia
    const resultado = deudores.map(d => ({
      nombre: d.nombre,
      saldo: d.saldo,
      pagosDia: movsPorCliente[d.nombre]?.pagos || 0,
      fiadosDia: movsPorCliente[d.nombre]?.fiados || 0
    }));

    // Calcular totales
    let totalPagos = 0;
    let totalFiados = 0;
    for (const cliente in movsPorCliente) {
      totalPagos += movsPorCliente[cliente].pagos;
      totalFiados += movsPorCliente[cliente].fiados;
    }

    return {
      success: true,
      fecha: fechaFiltro.toISOString(),
      deudores: serializarParaWeb(resultado),
      totalAdeudado: deudores.reduce((sum, c) => sum + c.saldo, 0),
      totalPagosDia: totalPagos,
      totalFiadosDia: totalFiados
    };
  } catch (error) {
    Logger.log('Error en obtenerSaldosConMovimientosDia: ' + error.message);
    return { success: false, error: error.message, deudores: [] };
  }
}

// ============================================================================
// API PUBLICA - MOVIMIENTOS
// ============================================================================

/**
 * Guarda un nuevo movimiento
 * @param {Object} movimientoData - {fecha, cliente, tipo, monto, obs}
 * @returns {Object} Movimiento guardado
 */
function guardarMovimiento(movimientoData) {
  try {
    const movimiento = MovimientosRepository.registrar(movimientoData);
    const cliente = ClientesRepository.buscarPorNombre(movimiento.cliente);

    return {
      success: true,
      movimiento: serializarParaWeb(movimiento),
      cliente: cliente ? serializarParaWeb(cliente) : null,
      mensaje: movimientoData.tipo === 'DEBE' ? 'Fiado registrado' : 'Pago registrado'
    };
  } catch (error) {
    Logger.log('Error en guardarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Edita un movimiento existente
 * @param {number} id - ID del movimiento
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Movimiento actualizado
 */
function editarMovimiento(id, datos) {
  try {
    const movimiento = MovimientosRepository.editar(id, datos);
    return {
      success: true,
      movimiento: serializarParaWeb(movimiento),
      mensaje: 'Movimiento actualizado'
    };
  } catch (error) {
    Logger.log('Error en editarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Elimina un movimiento
 * @param {number} id - ID del movimiento
 * @returns {Object} Resultado
 */
function eliminarMovimiento(id) {
  try {
    MovimientosRepository.eliminar(id);
    return {
      success: true,
      mensaje: 'Movimiento eliminado'
    };
  } catch (error) {
    Logger.log('Error en eliminarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Recalcula todos los saldos
 * @returns {Object} Resultado
 */
function recalcularSaldos() {
  try {
    const resultado = MovimientosRepository.recalcularTodosSaldos();
    return {
      success: true,
      clientesActualizados: resultado.clientesActualizados,
      mensaje: resultado.clientesActualizados + ' clientes actualizados'
    };
  } catch (error) {
    Logger.log('Error en recalcularSaldos: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - VISUAL REASONING (CLAUDE AI)
// ============================================================================

/**
 * Verifica si la API Key esta configurada
 * @returns {Object} {presente: boolean}
 */
function verificarApiKey() {
  return {
    presente: ClaudeService.tieneApiKey()
  };
}

/**
 * Guarda la API Key de Claude
 * @param {string} apiKey - API Key
 * @returns {Object} Resultado
 */
function guardarApiKey(apiKey) {
  try {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new Error('API Key invalida');
    }

    ClaudeService.setApiKey(apiKey.trim());

    return {
      success: true,
      mensaje: 'API Key guardada correctamente'
    };
  } catch (error) {
    Logger.log('Error en guardarApiKey: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Guarda imagen temporalmente para analisis
 * @param {string} imageBase64 - Imagen en base64
 * @returns {Object} {token}
 */
function guardarImagenTemporal(imageBase64) {
  try {
    const token = ImageCache.guardar(imageBase64);
    return {
      success: true,
      token: token
    };
  } catch (error) {
    Logger.log('Error en guardarImagenTemporal: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analiza una imagen con Claude AI
 * @param {string} token - Token de la imagen
 * @param {string} fecha - Fecha del dia
 * @returns {Object} Movimientos extraidos
 */
function analizarImagen(token, fecha) {
  try {
    // Recuperar imagen del cache
    const imageBase64 = ImageCache.recuperar(token);
    if (!imageBase64) {
      throw new Error('Imagen no encontrada o expirada. Sube la imagen nuevamente.');
    }

    // Analizar con Claude
    const resultado = ClaudeService.analizarImagen(imageBase64, fecha);

    // Validar movimientos contra clientes existentes
    if (resultado.movimientos && resultado.movimientos.length > 0) {
      const validacion = ClaudeService.validarMovimientos(resultado.movimientos);

      return {
        success: true,
        movimientosValidos: validacion.validos,
        movimientosConSugerencias: validacion.conSugerencias,
        totalExtraidos: resultado.movimientos.length,
        observaciones: resultado.observaciones || ''
      };
    }

    return {
      success: true,
      movimientosValidos: [],
      movimientosConSugerencias: [],
      totalExtraidos: 0,
      observaciones: resultado.observaciones || 'No se detectaron movimientos'
    };

  } catch (error) {
    Logger.log('Error en analizarImagen: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Guarda multiples movimientos (desde Visual Reasoning)
 * @param {Array} movimientos - Array de movimientos
 * @returns {Object} Resultado
 */
function guardarMovimientosLote(movimientos) {
  try {
    const resultado = MovimientosRepository.registrarLote(movimientos);

    return {
      success: true,
      exitosos: resultado.exitosos.length,
      errores: resultado.errores.length,
      detalleExitosos: serializarParaWeb(resultado.exitosos),
      detalleErrores: resultado.errores,
      mensaje: `${resultado.exitosos.length} movimientos guardados, ${resultado.errores.length} errores`
    };
  } catch (error) {
    Logger.log('Error en guardarMovimientosLote: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - SISTEMA DE CAJA
// ============================================================================

/**
 * Guarda un arqueo de caja
 * @param {Object} datos - Datos del arqueo
 * @returns {Object} Resultado
 */
function guardarArqueo(datos) {
  try {
    const resultado = CajaRepository.guardarSesion(datos);
    return resultado;
  } catch (error) {
    Logger.log('Error en guardarArqueo: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene historial de sesiones de caja
 * @param {number} limite - Cantidad maxima
 * @returns {Object} Historial
 */
function obtenerHistorialCaja(limite) {
  try {
    const historial = CajaRepository.obtenerHistorial(limite || 30);
    return {
      success: true,
      sesiones: serializarParaWeb(historial)
    };
  } catch (error) {
    Logger.log('Error en obtenerHistorialCaja: ' + error.message);
    return {
      success: false,
      error: error.message,
      sesiones: []
    };
  }
}

/**
 * Genera hoja de ruta del dia
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {Object} Datos de la hoja de ruta
 */
function obtenerHojaRuta(fecha) {
  try {
    const hojaRuta = generarHojaRuta(fecha);
    return {
      success: true,
      ...serializarParaWeb(hojaRuta)
    };
  } catch (error) {
    Logger.log('Error en obtenerHojaRuta: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Genera resumen de arqueo para impresion
 * @param {string} sesionId - ID de sesion (opcional)
 * @returns {Object} Resumen del arqueo
 */
function obtenerResumenArqueo(sesionId) {
  try {
    const resumen = generarResumenArqueo(sesionId);
    if (resumen.error) {
      return { success: false, error: resumen.error };
    }
    return {
      success: true,
      ...serializarParaWeb(resumen)
    };
  } catch (error) {
    Logger.log('Error en obtenerResumenArqueo: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene la configuracion del sistema
 * @returns {Object} Configuracion
 */
function obtenerConfiguracion() {
  return {
    denominaciones: DENOMINACIONES,
    tiposMovimiento: CONFIG.TIPOS_MOVIMIENTO,
    colores: CONFIG.COLORES,
    sistema: CONFIG.SISTEMA
  };
}
