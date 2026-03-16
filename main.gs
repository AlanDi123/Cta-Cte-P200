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
 * Punto de entrada para Web App y API REST
 * @param {Object} e - Evento con parámetros de la petición
 * @returns {HtmlOutput|TextOutput}
 */
function doGet(e) {
  // Si tiene parámetro 'action', es una petición API REST
  if (e && e.parameter && e.parameter.action) {
    return manejarApiGet(e);
  }

  // Si no, devolver la Web App
  return HtmlService.createHtmlOutputFromFile('SistemaSolVerde')
    .setTitle('Sol & Verde - Sistema de Cuenta Corriente')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Punto de entrada para peticiones POST (API REST)
 * @param {Object} e - Evento con datos POST
 * @returns {TextOutput} Respuesta JSON
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Registrar en log para debugging
    Logger.log('API POST recibida - Acción: ' + data.action);

    if (data.action === 'addTransfers') {
      return agregarTransferenciasAPI(data.data);
    }

    if (data.action === 'addMovements') {
      return agregarMovimientosAPI(data.data);
    }

    if (data.action === 'saveBackup') {
      return guardarBackupAPI(data.data);
    }

    // ─── VENTA NOCTURNA ───────────────────────────────────────────
    // Inicialización
    if (data.action === 'vnInicializarHojas') {
      return _vnJsonOk(inicializarHojasVN());
    }

    // Sesiones
    if (data.action === 'vnAbrirSesion') return _vnJsonOk(vnAbrirSesion());
    if (data.action === 'vnCerrarSesion') return _vnJsonOk(vnCerrarSesion(data.sesionId));
    if (data.action === 'vnGetSesionActiva') return _vnJsonOk(vnGetSesionActiva());
    if (data.action === 'vnReabrirSesion') return _vnJsonOk(vnReabrirSesion(data));
    if (data.action === 'vnGetHistorialSesiones') return _vnJsonOk(vnGetHistorialSesiones(data.limit));

    // Productos VN
    if (data.action === 'vnGetProductos') return _vnJsonOk(vnGetProductos());
    if (data.action === 'vnCrearProducto') return _vnJsonOk(vnCrearProducto(data));
    if (data.action === 'vnActualizarProducto') return _vnJsonOk(vnActualizarProducto(data));
    if (data.action === 'vnToggleProducto') return _vnJsonOk(vnToggleProducto(data.id));

    // Ventas POS
    if (data.action === 'vnRegistrarVenta') return _vnJsonOk(vnRegistrarVenta(data));
    if (data.action === 'vnCancelarVenta') return _vnJsonOk(vnCancelarVenta(data.ventaId));
    if (data.action === 'vnGetVentasSesion') return _vnJsonOk(vnGetVentasSesion(data.sesionId));
    if (data.action === 'vnGetResumenSesion') return _vnJsonOk(vnGetResumenSesion(data.sesionId));

    // Vales
    if (data.action === 'vnCrearVale') return _vnJsonOk(vnCrearVale(data));
    if (data.action === 'vnBuscarVale') return _vnJsonOk(vnBuscarVale(data.numero));
    if (data.action === 'vnAnularVale') return _vnJsonOk(vnAnularVale(data));
    if (data.action === 'vnGetVales') return _vnJsonOk(vnGetVales(data.filtros));
    if (data.action === 'vnGetValesCliente') return _vnJsonOk(vnGetValesCliente(data.cliente));

    // Stock
    if (data.action === 'vnGetExistencias') return _vnJsonOk(vnGetExistencias());
    if (data.action === 'vnRegistrarCompra') return _vnJsonOk(vnRegistrarCompra(data));
    if (data.action === 'vnRegistrarMerma') return _vnJsonOk(vnRegistrarMerma(data));
    if (data.action === 'vnRegistrarCorreccion') return _vnJsonOk(vnRegistrarCorreccion(data));
    if (data.action === 'vnGetHistorialCompras') return _vnJsonOk(vnGetHistorialCompras(data.filtros));
    if (data.action === 'vnGetHistorialMermas') return _vnJsonOk(vnGetHistorialMermas(data.filtros));
    if (data.action === 'vnGetHistorialCorrecciones') return _vnJsonOk(vnGetHistorialCorrecciones(data.filtros));

    // Pagos / Fiados
    if (data.action === 'vnRegistrarFiado') return _vnJsonOk(vnRegistrarFiado(data));
    if (data.action === 'vnRegistrarCobro') return _vnJsonOk(vnRegistrarCobro(data));
    if (data.action === 'vnRegistrarPagoACuenta') return _vnJsonOk(vnRegistrarPagoACuenta(data));
    if (data.action === 'vnGetDeudas') return _vnJsonOk(vnGetDeudas(data.cliente));
    if (data.action === 'vnGetPagosSesion') return _vnJsonOk(vnGetPagosSesion(data.sesionId));
    if (data.action === 'vnGetSaldoCliente') return _vnJsonOk(vnGetSaldoCliente(data.cliente));

    // Clientes (lectura del módulo principal)
    if (data.action === 'vnGetClientes') return _vnJsonOk(vnGetClientes(data.termino));
    if (data.action === 'vnCrearClienteRapido') return _vnJsonOk(vnCrearClienteRapido(data));
    // ─────────────────────────────────────────────────────────────

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: 'Acción no reconocida: ' + data.action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en doPost: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Maneja peticiones GET de la API REST
 * @param {Object} e - Evento con parámetros
 * @returns {TextOutput} Respuesta JSON
 */
function manejarApiGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getClients') {
      return obtenerClientesAPI();
    }

    if (action === 'getLatestBackup') {
      return obtenerUltimoBackupAPI();
    }

    if (action === 'exportData') {
      return exportarDatosCompletos();
    }

    if (action === 'status') {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          status: 'POS Sol y Verde API activa',
          version: CONFIG.SISTEMA.VERSION,
          timestamp: new Date().toISOString()
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Acción por defecto
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        status: 'POS Sol y Verde API activa',
        availableActions: ['getClients', 'getLatestBackup', 'exportData', 'status'],
        postActions: ['addTransfers', 'addMovements', 'saveBackup']
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en manejarApiGet: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// API REST - FUNCIONES PRIVADAS
// ============================================================================

/**
 * Agrega múltiples transferencias desde API externa
 * @param {Array} transferencias - Array de objetos transferencia
 * @returns {TextOutput} Respuesta JSON
 */
function agregarTransferenciasAPI(transferencias) {
  try {
    if (!Array.isArray(transferencias) || transferencias.length === 0) {
      throw new Error('Se requiere un array de transferencias válido');
    }

    // Adaptar formato de API a formato interno
    const transferenciasAdaptadas = transferencias.map(t => ({
      fecha: t.FECHA,
      cliente: (t.CLIENTE || '').toUpperCase(),
      monto: Number(t.MONTO) || 0,
      banco: t.BANCO || '',
      condicion: t.CONDICION || 'Consumidor Final',
      tipoFactura: t.TIPO_FACTURA || '',
      obs: t.OBS || ''
    }));

    // Usar el repositorio existente
    const resultado = TransferenciasRepository.agregarMultiples(transferenciasAdaptadas);

    Logger.log(`API: ${resultado.exitosos.length} transferencias agregadas exitosamente`);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        count: resultado.exitosos.length,
        exitosos: resultado.exitosos.length,
        errores: resultado.errores.length,
        detalleErrores: resultado.errores
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en agregarTransferenciasAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Agrega múltiples movimientos desde API externa
 * @param {Array} movimientos - Array de objetos movimiento
 * @returns {TextOutput} Respuesta JSON
 */
function agregarMovimientosAPI(movimientos) {
  try {
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      throw new Error('Se requiere un array de movimientos válido');
    }

    // Adaptar formato de API a formato interno
    const movimientosAdaptados = movimientos.map(m => ({
      fecha: validarFecha(m.FECHA) ? m.FECHA : null,
      cliente: normalizarString(m.CLIENTE || ''),
      tipo: ['DEBE','HABER'].includes(m.TIPO) ? m.TIPO : null,
      monto: typeof m.MONTO === 'number' && m.MONTO > 0 ? m.MONTO : null,
      obs: sanitizarTexto(m.OBS || ''),
      usuario: m.USUARIO || 'API_EXTERNA'
    }));

    // Usar el repositorio existente
    const resultado = MovimientosRepository.registrarLote(movimientosAdaptados.filter(mov => mov.fecha && mov.cliente && mov.tipo && mov.monto));

    Logger.log(`API: ${resultado.exitosos.length} movimientos agregados exitosamente`);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        count: resultado.exitosos.length,
        exitosos: resultado.exitosos.length,
        errores: resultado.errores.length,
        detalleErrores: resultado.errores
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en agregarMovimientosAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obtiene todos los clientes para API externa
 * @returns {TextOutput} Respuesta JSON
 */
function obtenerClientesAPI() {
  try {
    // Obtener todos los clientes sin límite
    const clientes = ClientesRepository.obtenerTodos(0, 0);

    // Adaptar al formato de la API (usar nombres de columnas en mayúsculas)
    const clientesAPI = clientes.map(c => ({
      NOMBRE: c.nombre,
      TEL: c.tel || '',
      EMAIL: c.email || '',
      CUIT: c.cuit || '',
      SALDO: c.saldo || 0,
      LIMITE: c.limite || 0,
      CONDICION_FISCAL: c.condicionFiscal || 'Consumidor Final',
      RAZON_SOCIAL: c.razonSocial || '',
      DOMICILIO_FISCAL: c.domicilioFiscal || '',
      OBS: c.obs || ''
    }));

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: clientesAPI,
        total: clientesAPI.length,
        timestamp: new Date().toISOString()
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en obtenerClientesAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message, data: [] })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Guarda un backup completo del sistema en Google Drive
 * @param {Object} datosBackup - Datos del backup (opcional, si no se provee se generan automáticamente)
 * @returns {TextOutput} Respuesta JSON
 */
function guardarBackupAPI(datosBackup) {
  try {
    let datosParaGuardar;

    // Si no se proporcionan datos, exportar todo el sistema
    if (!datosBackup || Object.keys(datosBackup).length === 0) {
      Logger.log('Generando backup automático del sistema completo');
      datosParaGuardar = generarBackupCompleto();
    } else {
      datosParaGuardar = datosBackup;
    }

    // Crear o recuperar carpeta de backup
    const folder = getOrCreateFolder_('Backup Sistema POS');

    // Generar nombre de archivo con timestamp
    const date = Utilities.formatDate(
      new Date(),
      'America/Argentina/Buenos_Aires',
      'yyyy-MM-dd_HHmmss'
    );
    const fileName = 'backup_pos_' + date + '.json';

    // Crear archivo de backup
    const contenidoBackup = JSON.stringify(datosParaGuardar, null, 2);
    const archivo = folder.createFile(fileName, contenidoBackup, 'application/json');

    Logger.log('Backup guardado: ' + fileName);

    // Mantener solo los últimos 30 backups
    const files = folder.getFilesByType('application/json');
    const allFiles = [];
    while (files.hasNext()) {
      allFiles.push(files.next());
    }

    // Ordenar por fecha de creación (más reciente primero)
    allFiles.sort(function(a, b) {
      return b.getDateCreated().getTime() - a.getDateCreated().getTime();
    });

    // Eliminar backups antiguos (mantener solo 30)
    for (let i = 30; i < allFiles.length; i++) {
      allFiles[i].setTrashed(true);
      Logger.log('Backup eliminado (antiguo): ' + allFiles[i].getName());
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        fileName: fileName,
        fileId: archivo.getId(),
        backupsMantenidos: Math.min(30, allFiles.length),
        backupsEliminados: Math.max(0, allFiles.length - 30)
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en guardarBackupAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obtiene el último backup guardado en Google Drive
 * @returns {TextOutput} Respuesta JSON con el contenido del backup
 */
function obtenerUltimoBackupAPI() {
  try {
    const folder = getOrCreateFolder_('Backup Sistema POS');
    const files = folder.getFilesByType('application/json');

    let latest = null;
    while (files.hasNext()) {
      const f = files.next();
      if (!latest || f.getDateCreated().getTime() > latest.getDateCreated().getTime()) {
        latest = f;
      }
    }

    if (latest) {
      const contenido = latest.getBlob().getDataAsString();
      Logger.log('Último backup recuperado: ' + latest.getName());

      // Intentar parsear para verificar que es JSON válido
      const datosBackup = JSON.parse(contenido);

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          fileName: latest.getName(),
          fileId: latest.getId(),
          dateCreated: latest.getDateCreated().toISOString(),
          data: datosBackup
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: 'No hay backups disponibles'
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en obtenerUltimoBackupAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Exporta todos los datos del sistema para sincronización con POS
 * @returns {TextOutput} Respuesta JSON con todos los datos
 */
function exportarDatosCompletos() {
  try {
    Logger.log('Exportando datos completos del sistema...');

    const datosCompletos = generarBackupCompleto();

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: datosCompletos,
        timestamp: new Date().toISOString()
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en exportarDatosCompletos: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Genera un backup completo del sistema
 * @returns {Object} Objeto con todos los datos del sistema
 */
function generarBackupCompleto() {
  // Obtener todos los datos de los repositorios
  const clientes = ClientesRepository.obtenerTodos(0, 0);
  const movimientos = MovimientosRepository.obtenerRecientes(0); // 0 = todos
  const transferencias = TransferenciasRepository.obtenerTodas();

  // Obtener configuración del emisor
  const datosEmisor = obtenerDatosEmisor();

  return {
    version: CONFIG.SISTEMA.VERSION,
    fechaBackup: new Date().toISOString(),
    clientes: serializarParaWeb(clientes),
    movimientos: serializarParaWeb(movimientos),
    transferencias: serializarParaWeb(transferencias),
    emisor: datosEmisor.datos || {},
    estadisticas: {
      totalClientes: clientes.length,
      totalMovimientos: movimientos.length,
      totalTransferencias: transferencias.length,
      totalAdeudado: clientes.reduce((sum, c) => sum + (c.saldo || 0), 0)
    }
  };
}

/**
 * Obtiene o crea una carpeta en Google Drive
 * @param {string} name - Nombre de la carpeta
 * @returns {GoogleAppsScript.Drive.Folder} Carpeta de Drive
 */
function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  Logger.log('Creando carpeta: ' + name);
  return DriveApp.createFolder(name);
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
    // Cargar TODOS los clientes (sin límite de paginación) para que el autocomplete funcione
    const clientes = ClientesRepository.obtenerTodos(0, 0); // 0 = sin límite
    const movimientos = MovimientosRepository.obtenerRecientes(100);
    const totalClientes = clientes.length;

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
 * INCLUYE tanto saldos positivos (deuda) como negativos (a favor)
 * @param {string} fecha - Fecha en formato YYYY-MM-DD (opcional, default hoy)
 * @returns {Object} {deudores: [{nombre, saldo, pagosDia, fiadosDia}], totalAdeudado, saldoAFavor}
 */
function obtenerSaldosConMovimientosDia(fecha) {
  try {
    const fechaFiltro = fecha ? parsearFechaLocal(fecha) : new Date();
    fechaFiltro.setHours(0, 0, 0, 0);
    const fechaFin = new Date(fechaFiltro);
    fechaFin.setHours(23, 59, 59, 999);

    // Verificar si es fecha de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const esHoy = fechaFiltro.getTime() === hoy.getTime();

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

    let resultado;
    let totalAdeudado = 0;
    let totalAFavor = 0;

    if (esHoy) {
      // Si es hoy, usar TODOS los saldos (positivos y negativos)
      const clientes = ClientesRepository.obtenerTodos();
      resultado = [];
      
      for (const cliente of clientes) {
        // Incluir clientes con saldo positivo (deuda) O negativo (a favor)
        if (cliente.saldo !== 0) {
          const esAFavor = cliente.saldo < 0;
          resultado.push({
            nombre: cliente.nombre,
            saldo: cliente.saldo,
            esAFavor: esAFavor,
            pagosDia: movsPorCliente[cliente.nombre]?.pagos || 0,
            fiadosDia: movsPorCliente[cliente.nombre]?.fiados || 0
          });
          
          if (esAFavor) {
            totalAFavor += Math.abs(cliente.saldo);
          } else {
            totalAdeudado += cliente.saldo;
          }
        }
      }
    } else {
      // Si es fecha pasada, calcular saldos históricos
      const saldosHistoricos = MovimientosRepository.calcularSaldosHistoricos(fechaFin);
      const clientes = ClientesRepository.obtenerTodos();

      resultado = [];
      for (const cliente of clientes) {
        const saldoHistorico = saldosHistoricos[cliente.nombre] || 0;
        // Incluir saldos positivos Y negativos (a favor)
        if (saldoHistorico !== 0) {
          const esAFavor = saldoHistorico < 0;
          resultado.push({
            nombre: cliente.nombre,
            saldo: saldoHistorico,
            esAFavor: esAFavor,
            pagosDia: movsPorCliente[cliente.nombre]?.pagos || 0,
            fiadosDia: movsPorCliente[cliente.nombre]?.fiados || 0
          });
          
          if (esAFavor) {
            totalAFavor += Math.abs(saldoHistorico);
          } else {
            totalAdeudado += saldoHistorico;
          }
        }
      }
    }

    // Ordenar: primero alfabéticamente, luego por tipo de saldo (deuda antes que a favor)
    resultado.sort((a, b) => {
      if (a.esAFavor !== b.esAFavor) {
        return a.esAFavor ? 1 : -1; // Deuda primero, a favor después
      }
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    // Calcular totales del día
    let totalPagos = 0;
    let totalFiados = 0;
    for (const cliente in movsPorCliente) {
      totalPagos += movsPorCliente[cliente].pagos;
      totalFiados += movsPorCliente[cliente].fiados;
    }

    return {
      success: true,
      fecha: formatearFechaLocal(fechaFiltro),
      esHistorico: !esHoy,
      deudores: serializarParaWeb(resultado),
      totalAdeudado: totalAdeudado,
      saldoAFavor: totalAFavor,
      totalPagosDia: totalPagos,
      totalFiadosDia: totalFiados,
      resumen: {
        clientesConDeuda: resultado.filter(r => !r.esAFavor).length,
        clientesAFavor: resultado.filter(r => r.esAFavor).length
      }
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
    // C-12: Parsear monto en formato argentino si viene como string
    if (movimientoData && movimientoData.monto !== undefined) {
      movimientoData.monto = parsearMontoARG(movimientoData.monto);
    }
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
function recalcularTodosSaldos() {
  try {
    const resultado = MovimientosRepository.recalcularTodosSaldos();
    return {
      success: true,
      clientesActualizados: resultado.clientesActualizados,
      omitidosSinMovimientos: resultado.omitidosSinMovimientos,
      mensaje: resultado.clientesActualizados + ' clientes actualizados, ' + resultado.omitidosSinMovimientos + ' sin movimientos (saldo preservado)'
    };
  } catch (error) {
    Logger.log('Error en recalcularTodosSaldos: ' + error.message);
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
 * Obtiene todos los clientes para exportación (sin límite)
 * @returns {Object} Lista de todos los clientes
 */
function obtenerTodosClientesParaExportar() {
  try {
    const clientes = ClientesRepository.obtenerTodos(0, 0); // Sin límite
    return {
      success: true,
      clientes: serializarParaWeb(clientes),
      total: clientes.length
    };
  } catch (error) {
    Logger.log('Error en obtenerTodosClientesParaExportar: ' + error.message);
    return {
      success: false,
      error: error.message,
      clientes: []
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
    sistema: CONFIG.SISTEMA,
    print: CONFIG.getPrint()
  };
}

// ============================================================================
// API PUBLICA - CONFIGURACION FISCAL DEL EMISOR
// ============================================================================

/**
 * Guarda los datos fiscales del emisor
 * @param {Object} datos - Datos del emisor
 * @returns {Object} Resultado
 */
function guardarDatosEmisor(datos) {
  try {
    const props = PropertiesService.getScriptProperties();

    // Validar CUIT
    if (!datos.cuit || datos.cuit.trim().length < 11) {
      throw new Error('CUIT inválido');
    }

    // Validar campos obligatorios
    if (!datos.razonSocial || !datos.razonSocial.trim()) {
      throw new Error('La Razón Social es obligatoria');
    }

    if (!datos.domicilio || !datos.domicilio.trim()) {
      throw new Error('El Domicilio Comercial es obligatorio');
    }

    // Guardar en ScriptProperties
    props.setProperty('EMISOR_CUIT', datos.cuit.trim());
    props.setProperty('EMISOR_RAZON_SOCIAL', datos.razonSocial.trim());
    props.setProperty('EMISOR_NOMBRE_FANTASIA', datos.nombreFantasia ? datos.nombreFantasia.trim() : '');
    props.setProperty('EMISOR_DOMICILIO', datos.domicilio.trim());
    props.setProperty('EMISOR_IIBB', datos.ingresosBrutos ? datos.ingresosBrutos.trim() : '');
    props.setProperty('EMISOR_FECHA_INICIO', datos.fechaInicio || '');
    props.setProperty('EMISOR_CONDICION_IVA', datos.condicionIVA || 'Responsable Inscripto');

    Logger.log('Datos del emisor guardados: ' + datos.razonSocial);

    return {
      success: true,
      mensaje: 'Datos del emisor guardados correctamente'
    };
  } catch (error) {
    Logger.log('Error en guardarDatosEmisor: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene los datos fiscales del emisor
 * @returns {Object} Datos del emisor
 */
function obtenerDatosEmisor() {
  try {
    const props = PropertiesService.getScriptProperties();

    const datos = {
      cuit: props.getProperty('EMISOR_CUIT') || '',
      razonSocial: props.getProperty('EMISOR_RAZON_SOCIAL') || '',
      nombreFantasia: props.getProperty('EMISOR_NOMBRE_FANTASIA') || '',
      domicilio: props.getProperty('EMISOR_DOMICILIO') || '',
      ingresosBrutos: props.getProperty('EMISOR_IIBB') || '',
      fechaInicio: props.getProperty('EMISOR_FECHA_INICIO') || '',
      condicionIVA: props.getProperty('EMISOR_CONDICION_IVA') || 'Responsable Inscripto'
    };

    return {
      success: true,
      datos: datos
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosEmisor: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - CONFIGURACION GENERAL DEL SISTEMA
// ============================================================================

/**
 * Obtiene todas las configuraciones del sistema
 * @returns {Object} Todas las configuraciones
 */
function obtenerConfiguracionCompleta() {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // Inquilinos (lista separada por comas)
    const inquilinosProp = props.getProperty('INQUILINOS') || CONFIG.INQUILINOS.join(',');
    const inquilinosArray = inquilinosProp.split(',');
    const inquilinosFiltrados = inquilinosArray.map(i => i.trim()).filter(i => i);
    
    // Configuración general del sistema
    const config = {
      // Sistema
      nombreSistema: props.getProperty('SISTEMA_NOMBRE') || CONFIG.SISTEMA.NOMBRE,
      version: CONFIG.SISTEMA.VERSION,
      
      // Límites y valores por defecto
      limiteCredito: parseFloat(props.getProperty('LIMITE_CREDITO_DEFAULT') || CONFIG.DEFAULTS.LIMITE_CREDITO),
      saldoInicial: parseFloat(props.getProperty('SALDO_INICIAL_DEFAULT') || CONFIG.DEFAULTS.SALDO_INICIAL),
      
      // Backups
      carpetaBackup: props.getProperty('CARPETA_BACKUP') || 'Backup Sistema POS',
      
      // UI
      logoUrl: props.getProperty('LOGO_URL') || 'https://i.imgur.com/tStvmV1.png',
      
      // Paginación
      paginaTamano: parseInt(props.getProperty('PAGINATION_DEFAULT_SIZE') || CONFIG.PAGINATION.DEFAULT_PAGE_SIZE),
      paginaTamanoMax: parseInt(props.getProperty('PAGINATION_MAX_SIZE') || CONFIG.PAGINATION.MAX_PAGE_SIZE),
      
      // IVA
      ivaPorcentaje: parseFloat(props.getProperty('IVA_PORCENTAJE') || '10.5'),
      ivaMultiplicador: parseFloat(props.getProperty('IVA_MULTIPLICADOR') || '0.105'),
      ivaAlicuotaId: parseInt(props.getProperty('IVA_ALICUOTA_ID') || '4'),
      
      // Claude AI
      claudeModel: props.getProperty('CLAUDE_MODEL') || CONFIG.CLAUDE.MODEL,
      claudeMaxTokens: parseInt(props.getProperty('CLAUDE_MAX_TOKENS') || CONFIG.CLAUDE.MAX_TOKENS),
      claudeApiKey: props.getProperty('CLAUDE_API_KEY') ? '***CONFIGURED***' : '',
      
      // Búsqueda Fuzzy
      fuzzyMinScore: parseInt(props.getProperty('FUZZY_MIN_SCORE') || CONFIG.FUZZY.MIN_SCORE),
      fuzzyMaxSugerencias: parseInt(props.getProperty('FUZZY_MAX_SUGERENCIAS') || CONFIG.FUZZY.MAX_SUGERENCIAS),
      fuzzyPesoExacto: parseInt(props.getProperty('FUZZY_PESO_EXACTO') || CONFIG.FUZZY.PESO_EXACTO),
      fuzzyPesoComienza: parseInt(props.getProperty('FUZZY_PESO_COMIENZA') || CONFIG.FUZZY.PESO_COMIENZA),
      fuzzyPesoContiene: parseInt(props.getProperty('FUZZY_PESO_CONTIENE') || CONFIG.FUZZY.PESO_CONTIENE),
      fuzzyPesoLevenshtein: parseInt(props.getProperty('FUZZY_PESO_LEVENSHTEIN') || CONFIG.FUZZY.PESO_LEVENSHTEIN),
      
      // Impresión
      printFontSizeSaldos: parseInt(props.getProperty('PRINT_FONT_SIZE_SALDOS') || CONFIG.PRINT.FONT_SIZE_SALDOS),
      printFontSizeHeader: parseInt(props.getProperty('PRINT_FONT_SIZE_HEADER') || CONFIG.PRINT.FONT_SIZE_HEADER),
      printOrientation: props.getProperty('PRINT_ORIENTATION') || CONFIG.PRINT.ORIENTATION,
      printScale: parseInt(props.getProperty('PRINT_SCALE') || CONFIG.PRINT.SCALE),
      printMargin: parseFloat(props.getProperty('PRINT_MARGIN') || CONFIG.PRINT.MARGIN),
      printFitToWidth: (props.getProperty('PRINT_FIT_TO_WIDTH') || CONFIG.PRINT.FIT_TO_WIDTH.toString()) === 'true',
      printPageMode: props.getProperty('PRINT_PAGE_MODE') || CONFIG.PRINT.PAGE_MODE,
      printShowLogo: (props.getProperty('PRINT_SHOW_LOGO') || CONFIG.PRINT.SHOW_LOGO.toString()) !== 'false',
      printShowCompany: (props.getProperty('PRINT_SHOW_COMPANY') || CONFIG.PRINT.SHOW_COMPANY.toString()) !== 'false',
      printFooter: props.getProperty('PRINT_FOOTER') || CONFIG.PRINT.FOOTER,
      printPageBreak: (props.getProperty('PRINT_PAGE_BREAK') || CONFIG.PRINT.PAGE_BREAK.toString()) === 'true',
      calPrintCellHeight: parseFloat(props.getProperty('CAL_PRINT_CELL_HEIGHT') || '3.0'),

      // Inquilinos
      inquilinos: inquilinosFiltrados,

      // Textos de Ayuda
      ayudaTutoriales: props.getProperty('AYUDA_TUTORIALES') || ''
    };
    
    return {
      success: true,
      config: config
    };
  } catch (error) {
    Logger.log('Error en obtenerConfiguracionCompleta: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Guarda configuraciones generales del sistema
 * @param {Object} config - Configuraciones a guardar
 * @returns {Object} Resultado
 */
function guardarConfiguracionGeneral(config) {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // Guardar cada configuración si está presente
    if (config.nombreSistema !== undefined) {
      props.setProperty('SISTEMA_NOMBRE', config.nombreSistema.trim());
    }
    
    if (config.limiteCredito !== undefined) {
      const limite = parseFloat(config.limiteCredito);
      if (isNaN(limite) || limite < 0) {
        throw new Error('Límite de crédito debe ser un número mayor o igual a 0');
      }
      props.setProperty('LIMITE_CREDITO_DEFAULT', limite.toString());
    }
    
    if (config.saldoInicial !== undefined) {
      props.setProperty('SALDO_INICIAL_DEFAULT', config.saldoInicial.toString());
    }
    
    if (config.carpetaBackup !== undefined) {
      props.setProperty('CARPETA_BACKUP', config.carpetaBackup.trim());
    }
    
    if (config.logoUrl !== undefined) {
      props.setProperty('LOGO_URL', config.logoUrl.trim());
    }
    
    if (config.paginaTamano !== undefined) {
      const tamano = parseInt(config.paginaTamano);
      if (isNaN(tamano) || tamano < 1 || tamano > 100) {
        throw new Error('Tamaño de página debe estar entre 1 y 100');
      }
      props.setProperty('PAGINATION_DEFAULT_SIZE', tamano.toString());
    }
    
    if (config.paginaTamanoMax !== undefined) {
      const tamanoMax = parseInt(config.paginaTamanoMax);
      if (isNaN(tamanoMax) || tamanoMax < 1 || tamanoMax > 500) {
        throw new Error('Tamaño máximo de página inválido (1-500)');
      }
      props.setProperty('PAGINATION_MAX_SIZE', tamanoMax.toString());
    }
    
    // IVA
    if (config.ivaPorcentaje !== undefined) {
      const iva = parseFloat(config.ivaPorcentaje);
      if (isNaN(iva) || iva < 0 || iva > 100) {
        throw new Error('Porcentaje de IVA inválido (0-100)');
      }
      props.setProperty('IVA_PORCENTAJE', iva.toString());
      props.setProperty('IVA_MULTIPLICADOR', (iva / 100).toString());
    }
    
    if (config.ivaAlicuotaId !== undefined) {
      props.setProperty('IVA_ALICUOTA_ID', config.ivaAlicuotaId.toString());
    }
    
    // Claude AI
    if (config.claudeModel !== undefined) {
      props.setProperty('CLAUDE_MODEL', config.claudeModel.trim());
    }
    
    if (config.claudeMaxTokens !== undefined) {
      const tokens = parseInt(config.claudeMaxTokens);
      if (isNaN(tokens) || tokens < 100 || tokens > 100000) {
        throw new Error('Máximo de tokens debe estar entre 100 y 100000');
      }
      props.setProperty('CLAUDE_MAX_TOKENS', tokens.toString());
    }
    
    if (config.claudeApiKey !== undefined && config.claudeApiKey !== '***CONFIGURED***') {
      props.setProperty('CLAUDE_API_KEY', config.claudeApiKey.trim());
    }
    
    // Búsqueda Fuzzy
    if (config.fuzzyMinScore !== undefined) {
      props.setProperty('FUZZY_MIN_SCORE', config.fuzzyMinScore.toString());
    }
    
    if (config.fuzzyMaxSugerencias !== undefined) {
      props.setProperty('FUZZY_MAX_SUGERENCIAS', config.fuzzyMaxSugerencias.toString());
    }
    
    if (config.fuzzyPesoExacto !== undefined) {
      props.setProperty('FUZZY_PESO_EXACTO', config.fuzzyPesoExacto.toString());
    }
    
    if (config.fuzzyPesoComienza !== undefined) {
      props.setProperty('FUZZY_PESO_COMIENZA', config.fuzzyPesoComienza.toString());
    }
    
    if (config.fuzzyPesoContiene !== undefined) {
      props.setProperty('FUZZY_PESO_CONTIENE', config.fuzzyPesoContiene.toString());
    }
    
    if (config.fuzzyPesoLevenshtein !== undefined) {
      props.setProperty('FUZZY_PESO_LEVENSHTEIN', config.fuzzyPesoLevenshtein.toString());
    }
    
    // Impresión
    if (config.printFontSizeSaldos !== undefined) {
      const fontSize = parseInt(config.printFontSizeSaldos);
      if (isNaN(fontSize) || fontSize < 4 || fontSize > 24) {
        throw new Error('Tamaño de fuente de impresión debe estar entre 4 y 24 pt');
      }
      props.setProperty('PRINT_FONT_SIZE_SALDOS', fontSize.toString());
    }
    
    if (config.printFontSizeHeader !== undefined) {
      const fontSize = parseInt(config.printFontSizeHeader);
      if (isNaN(fontSize) || fontSize < 8 || fontSize > 28) {
        throw new Error('Tamaño de fuente de encabezado debe estar entre 8 y 28 pt');
      }
      props.setProperty('PRINT_FONT_SIZE_HEADER', fontSize.toString());
    }
    
    if (config.printOrientation !== undefined) {
      if (config.printOrientation !== 'portrait' && config.printOrientation !== 'landscape') {
        throw new Error('Orientación debe ser "portrait" o "landscape"');
      }
      props.setProperty('PRINT_ORIENTATION', config.printOrientation);
    }
    
    if (config.printScale !== undefined) {
      const scale = parseInt(config.printScale);
      if (isNaN(scale) || scale < 50 || scale > 150) {
        throw new Error('Escala de impresión debe estar entre 50 y 150%');
      }
      props.setProperty('PRINT_SCALE', scale.toString());
    }
    
    if (config.printMargin !== undefined) {
      const margin = parseFloat(config.printMargin);
      if (isNaN(margin) || margin < 0.3 || margin > 3) {
        throw new Error('Margen debe estar entre 0.3 y 3 cm');
      }
      props.setProperty('PRINT_MARGIN', margin.toString());
    }
    
    if (config.printFitToWidth !== undefined) {
      props.setProperty('PRINT_FIT_TO_WIDTH', config.printFitToWidth.toString());
    }

    if (config.printPageMode !== undefined) {
      const validModes = ['auto', 'single', 'multi'];
      if (validModes.includes(config.printPageMode)) {
        props.setProperty('PRINT_PAGE_MODE', config.printPageMode);
      }
    }

    if (config.printShowLogo !== undefined) {
      props.setProperty('PRINT_SHOW_LOGO', config.printShowLogo.toString());
    }

    if (config.printShowCompany !== undefined) {
      props.setProperty('PRINT_SHOW_COMPANY', config.printShowCompany.toString());
    }

    if (config.printFooter !== undefined) {
      props.setProperty('PRINT_FOOTER', (config.printFooter || '').substring(0, 200));
    }

    if (config.printPageBreak !== undefined) {
      props.setProperty('PRINT_PAGE_BREAK', config.printPageBreak.toString());
    }

    if (config.calPrintCellHeight !== undefined) {
      const cellHeight = parseFloat(config.calPrintCellHeight);
      if (!isNaN(cellHeight) && cellHeight >= 1.5 && cellHeight <= 6) {
        props.setProperty('CAL_PRINT_CELL_HEIGHT', cellHeight.toFixed(1));
      }
    }

    // Inquilinos
    if (config.inquilinos !== undefined) {
      if (Array.isArray(config.inquilinos)) {
        props.setProperty('INQUILINOS', config.inquilinos.join(','));
      } else if (typeof config.inquilinos === 'string') {
        props.setProperty('INQUILINOS', config.inquilinos);
      }
    }

    // Textos de Ayuda
    if (config.ayudaTutoriales !== undefined) {
      // ScriptProperties tiene un límite de ~9KB por valor; 5000 chars es suficiente para tutoriales
      props.setProperty('AYUDA_TUTORIALES', (config.ayudaTutoriales || '').substring(0, 5000));
    }
    
    Logger.log('Configuración general guardada correctamente');
    
    return {
      success: true,
      mensaje: 'Configuración guardada correctamente'
    };
  } catch (error) {
    Logger.log('Error en guardarConfiguracionGeneral: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restablece la configuración a valores por defecto
 * @returns {Object} Resultado
 */
function restaurarConfiguracionPorDefecto() {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // Eliminar todas las configuraciones personalizadas (pero mantener credenciales)
    const keysToKeep = [
      'SPREADSHEET_ID',
      'EMISOR_CUIT', 'EMISOR_RAZON_SOCIAL', 'EMISOR_NOMBRE_FANTASIA', 
      'EMISOR_DOMICILIO', 'EMISOR_IIBB', 'EMISOR_FECHA_INICIO', 'EMISOR_CONDICION_IVA',
      'AFIP_ACCESS_TOKEN', 'AFIP_ENVIRONMENT', 'AFIP_PUNTO_VENTA', 'AFIP_CUIT',
      'AFIP_CERT', 'AFIP_KEY',
      'CLAUDE_API_KEY'
    ];
    
    const allProperties = props.getProperties();
    for (let key in allProperties) {
      if (!keysToKeep.includes(key)) {
        props.deleteProperty(key);
      }
    }
    
    Logger.log('Configuración restaurada a valores por defecto');

    return {
      success: true,
      mensaje: 'Configuración restaurada a valores por defecto. Se mantuvieron las credenciales.'
    };
  } catch (error) {
    Logger.log('Error en restaurarConfiguracionPorDefecto: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Serializar respuestas del módulo Venta Nocturna
// ─────────────────────────────────────────────────────────────

function _vnJsonOk(resultado) {
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// M-07: HEALTH CHECK — Verificación de integridad del sistema
// ============================================================================

/**
 * Verifica la integridad del sistema Sol & Verde.
 * Ejecuta 4 chequeos críticos y retorna un reporte detallado.
 * Expuesta al frontend para diagnóstico desde la UI de administración.
 *
 * @returns {Object} { success, timestamp, chequeos, resumen }
 */
function verificarIntegridadSistema() {
  const inicio = Date.now();
  const chequeos = [];

  // ── Chequeo 1: Todas las hojas requeridas existen ──────────────────────
  try {
    const ss = getSpreadsheet();
    const hojasRequeridas = Object.values(CONFIG.HOJAS);
    const hojasVN = Object.values(CONFIG_VN ? CONFIG_VN.HOJAS : {});
    const hojasFaltantes = [];

    [...hojasRequeridas, ...hojasVN].forEach(nombre => {
      if (!ss.getSheetByName(nombre)) hojasFaltantes.push(nombre);
    });

    chequeos.push({
      nombre:  'HOJAS_EXISTENTES',
      estado:  hojasFaltantes.length === 0 ? 'OK' : 'ERROR',
      detalle: hojasFaltantes.length === 0
        ? 'Todas las hojas requeridas existen'
        : 'Hojas faltantes: ' + hojasFaltantes.join(', ')
    });
  } catch (e) {
    chequeos.push({ nombre: 'HOJAS_EXISTENTES', estado: 'ERROR', detalle: e.message });
  }

  // ── Chequeo 2: Saldos en hoja CLIENTES vs. recálculo desde MOVIMIENTOS ──
  try {
    const clientes = ClientesRepository.obtenerTodos();
    const saldosRecalculados = MovimientosRepository.recalcularTodosSaldos
      ? MovimientosRepository.recalcularTodosSaldos()
      : null;

    if (!saldosRecalculados) {
      chequeos.push({ nombre: 'SALDOS_COHERENTES', estado: 'SKIP', detalle: 'recalcularTodosSaldos no disponible' });
    } else {
      const inconsistentes = [];
      clientes.forEach(c => {
        const saldoCalc = saldosRecalculados[c.nombre] || 0;
        const diff = Math.abs((c.saldo || 0) - saldoCalc);
        if (diff > 0.01) {
          inconsistentes.push({ cliente: c.nombre, saldoHoja: c.saldo, saldoCalc, diff });
        }
      });
      chequeos.push({
        nombre:  'SALDOS_COHERENTES',
        estado:  inconsistentes.length === 0 ? 'OK' : 'ADVERTENCIA',
        detalle: inconsistentes.length === 0
          ? 'Todos los saldos son coherentes (' + clientes.length + ' clientes)'
          : inconsistentes.length + ' saldo(s) inconsistente(s): ' + JSON.stringify(inconsistentes.slice(0, 5))
      });
    }
  } catch (e) {
    chequeos.push({ nombre: 'SALDOS_COHERENTES', estado: 'ERROR', detalle: e.message });
  }

  // ── Chequeo 3: No hay sesión VN abierta sin cierre por más de 24hs ──────
  try {
    const ss = getSpreadsheet();
    const hojaSesiones = ss.getSheetByName(CONFIG_VN ? CONFIG_VN.HOJAS.SESIONES : 'VN_SESIONES');
    if (!hojaSesiones) {
      chequeos.push({ nombre: 'SESIONES_VN', estado: 'SKIP', detalle: 'Módulo VN no inicializado' });
    } else {
      const datos = hojaSesiones.getDataRange().getValues();
      const ahora = new Date();
      const sesionesFantasma = [];

      datos.slice(1).forEach(f => {
        const estado = f[CONFIG_VN.COLS_SESIONES.ESTADO - 1];
        const fechaApertura = f[CONFIG_VN.COLS_SESIONES.APERTURA - 1];
        if (estado === CONFIG_VN.ESTADOS_SESION.ABIERTA && fechaApertura instanceof Date) {
          const hs = (ahora - fechaApertura) / 3600000;
          if (hs > 24) {
            sesionesFantasma.push({ id: f[0], hs: Math.round(hs) });
          }
        }
      });

      chequeos.push({
        nombre:  'SESIONES_VN',
        estado:  sesionesFantasma.length === 0 ? 'OK' : 'ADVERTENCIA',
        detalle: sesionesFantasma.length === 0
          ? 'No hay sesiones VN abiertas por más de 24hs'
          : sesionesFantasma.length + ' sesión(es) abierta(s) > 24hs: ' + JSON.stringify(sesionesFantasma)
      });
    }
  } catch (e) {
    chequeos.push({ nombre: 'SESIONES_VN', estado: 'ERROR', detalle: e.message });
  }

  // ── Chequeo 4: API key de Claude configurada ─────────────────────────────
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('CLAUDE_API_KEY') || props.getProperty('claude_api_key');
    chequeos.push({
      nombre:  'CLAUDE_API_KEY',
      estado:  apiKey ? 'OK' : 'ADVERTENCIA',
      detalle: apiKey ? 'API key configurada (***' + apiKey.slice(-4) + ')' : 'API key de Claude no configurada'
    });
  } catch (e) {
    chequeos.push({ nombre: 'CLAUDE_API_KEY', estado: 'ERROR', detalle: e.message });
  }

  const hayErrores = chequeos.some(c => c.estado === 'ERROR');
  const hayAdvertencias = chequeos.some(c => c.estado === 'ADVERTENCIA');

  return {
    success:   true,
    timestamp: new Date().toISOString(),
    duracionMs: Date.now() - inicio,
    estadoGeneral: hayErrores ? 'ERROR' : hayAdvertencias ? 'ADVERTENCIA' : 'OK',
    chequeos,
    resumen: chequeos.map(c => c.nombre + ': ' + c.estado).join(' | ')
  };
}

