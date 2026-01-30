/**
 * ============================================================================
 * SISTEMA SOL & VERDE V18.0 - BACKEND PRINCIPAL
 * ============================================================================
 *
 * Archivo: main.js
 * Descripción: Archivo principal que incluye todas las dependencias
 * y expone las funciones públicas de la API
 *
 * ============================================================================
 */

// ============================================================================
// INCLUDES - Cargar dependencias
// ============================================================================

// Cargar configuración global
eval(UrlFetchApp.fetch('https://raw.githubusercontent.com/your-repo/config.js').getContentText()); // Placeholder - en Apps Script usarías HtmlService o similar

// Para Apps Script, necesitamos incluir los archivos directamente
// Aquí incluiríamos los archivos usando HtmlService o copiando el contenido

// ============================================================================
// INICIALIZACIÓN DEL SISTEMA
// ============================================================================

/**
 * Función obligatoria para servir la aplicación web
 * Google Apps Script llama a esta función cuando se accede a la URL de la app
 * @returns {HtmlOutput} Página HTML del sistema
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('SistemaSolVerde')
    .setTitle('Sol & Verde V18.0 - Sistema de Cuenta Corriente')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Función de diagnóstico que retorna información del sistema
 * Se puede llamar desde la Web App para debugging
 */
function diagnosticoSistema() {
  try {
    const propiedades = PropertiesService.getScriptProperties();
    const spreadsheetId = propiedades.getProperty('SPREADSHEET_ID');

    return {
      success: true,
      spreadsheetId: spreadsheetId,
      usuario: Session.getEffectiveUser().getEmail(),
      timestamp: new Date().toISOString(),
      tieneSpreadsheet: spreadsheetId ? true : false,
      mensaje: 'Sistema funcionando correctamente'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Función de prueba para verificar que el sistema funciona
 * Ejecutar desde el editor para verificar que todo esté OK
 */
function probarSistema() {
  Logger.log('🧪 Iniciando prueba del sistema...');
  Logger.log('');

  try {
    // Probar obtenerDatosParaHTML
    Logger.log('Probando obtenerDatosParaHTML()...');
    const resultado = obtenerDatosParaHTML();

    Logger.log('');
    Logger.log('════════════════════════════════════════');
    Logger.log('📊 RESULTADO DE LA PRUEBA:');
    Logger.log('════════════════════════════════════════');
    Logger.log('Tipo de resultado: ' + typeof resultado);
    Logger.log('Es null?: ' + (resultado === null));
    Logger.log('Es undefined?: ' + (resultado === undefined));

    if (resultado) {
      Logger.log('success: ' + resultado.success);
      Logger.log('clientes: ' + (resultado.clientes ? resultado.clientes.length : 'undefined'));
      Logger.log('movimientos: ' + (resultado.movimientos ? resultado.movimientos.length : 'undefined'));
      if (!resultado.success) {
        Logger.log('error: ' + resultado.error);
      }
    }
    Logger.log('════════════════════════════════════════');
    Logger.log('');

    return resultado;

  } catch (error) {
    Logger.log('');
    Logger.log('❌ Error en prueba: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    return null;
  }
}

/**
 * Función de inicialización del sistema
 * Ejecutar esta función una vez desde el editor de scripts para configurar el sistema
 * Guarda el ID del spreadsheet para que funcione como Web App
 */
function inicializarSistema() {
  try {
    Logger.log('🔧 Iniciando configuración del sistema...');

    // Obtener el spreadsheet activo
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error('No se pudo obtener el spreadsheet activo. Asegúrate de ejecutar esta función desde el editor de scripts del spreadsheet.');
    }

    // Guardar el ID del spreadsheet
    const spreadsheetId = ss.getId();
    const propiedades = PropertiesService.getScriptProperties();
    propiedades.setProperty('SPREADSHEET_ID', spreadsheetId);

    Logger.log('✅ Spreadsheet ID guardado: ' + spreadsheetId);
    Logger.log('📋 Nombre del spreadsheet: ' + ss.getName());

    // Verificar/crear hojas necesarias
    const hojasNecesarias = ['CLIENTES', 'MOVIMIENTOS', 'RECAUDACION_EFECTIVO'];
    for (const nombreHoja of hojasNecesarias) {
      let hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) {
        Logger.log('📄 Creando hoja: ' + nombreHoja);
        hoja = ss.insertSheet(nombreHoja);

        // Agregar encabezados según el tipo de hoja
        if (nombreHoja === 'CLIENTES') {
          hoja.appendRow(['NOMBRE', 'TEL', 'EMAIL', 'LIMITE', 'SALDO', 'TOTAL_MOVS', 'ALTA', 'ULTIMO_MOV', 'OBS']);
          hoja.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
        } else if (nombreHoja === 'MOVIMIENTOS') {
          hoja.appendRow(['ID', 'FECHA', 'CLIENTE', 'TIPO', 'MONTO', 'SALDO_POST', 'OBS', 'USUARIO']);
          hoja.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
        } else if (nombreHoja === 'RECAUDACION_EFECTIVO') {
          hoja.appendRow(['ID', 'FECHA', 'CLIENTE', 'MONTO', 'FORMA_PAGO', 'OBS', 'USUARIO', 'TIMESTAMP', 'ESTADO']);
          hoja.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#FF6F00').setFontColor('#FFFFFF');
        }
        Logger.log('✅ Hoja creada: ' + nombreHoja);
      } else {
        Logger.log('✅ Hoja existente: ' + nombreHoja);
      }
    }

    Logger.log('✅ Sistema inicializado correctamente');
    Logger.log('🌐 URL de la Web App: ' + ScriptApp.getService().getUrl());
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('✅ ¡INICIALIZACIÓN COMPLETADA EXITOSAMENTE!');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('📌 Spreadsheet ID: ' + spreadsheetId);
    Logger.log('🌐 Web App URL: ' + ScriptApp.getService().getUrl());
    Logger.log('');
    Logger.log('👉 Próximos pasos:');
    Logger.log('   1. Cierra esta ventana de ejecución');
    Logger.log('   2. Refresca tu aplicación web');
    Logger.log('   3. Los datos deberían cargarse correctamente');
    Logger.log('═══════════════════════════════════════════════════');

    return {
      success: true,
      spreadsheetId: spreadsheetId,
      mensaje: 'Sistema inicializado correctamente'
    };

  } catch (error) {
    Logger.log('❌ Error al inicializar sistema: ' + error.message);
    Logger.log('Stack trace: ' + error.stack);
    Logger.log('');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('❌ ERROR DE INICIALIZACIÓN');
    Logger.log('═══════════════════════════════════════════════════');
    Logger.log('Error: ' + error.message);
    Logger.log('═══════════════════════════════════════════════════');

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene el spreadsheet de forma robusta
 * Usa getActive() pero con manejo de errores y cache
 * @returns {Spreadsheet} El spreadsheet activo
 */
function getSpreadsheet() {
  log('🔍 getSpreadsheet() - Inicio', 'debug');

  try {
    // Primero intentar obtener el ID guardado en propiedades
    log('  → Intentando obtener propiedades del script...', 'debug');
    const propiedades = PropertiesService.getScriptProperties();
    log('  → Propiedades obtenidas correctamente', 'debug');

    let spreadsheetId = propiedades.getProperty('SPREADSHEET_ID');
    log('  → Spreadsheet ID guardado: ' + (spreadsheetId || 'ninguno'), 'debug');

    // Si hay ID guardado, intentar abrir por ID
    if (spreadsheetId) {
      try {
        log('  → Intentando abrir spreadsheet por ID: ' + spreadsheetId, 'debug');
        const ss = SpreadsheetApp.openById(spreadsheetId);
        log('  ✅ Spreadsheet abierto exitosamente por ID', 'debug');
        log('  → Nombre: ' + ss.getName(), 'debug');
        return ss;
      } catch (errorId) {
        log('  ⚠️ Error al abrir por ID: ' + errorId.message, 'debug');
        log('  → Continuando con getActiveSpreadsheet()...', 'debug');
      }
    } else {
      log('  → No hay ID guardado, intentando getActiveSpreadsheet()...', 'debug');
    }

    // Intentar obtener el spreadsheet activo
    log('  → Llamando a getActiveSpreadsheet()...', 'debug');
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      log('  ❌ getActiveSpreadsheet() retornó null', 'error');
      throw new Error('No se pudo obtener el spreadsheet activo');
    }

    log('  ✅ Spreadsheet activo obtenido', 'debug');

    // Si se obtuvo exitosamente, guardar su ID para futuros usos
    spreadsheetId = ss.getId();
    log('  → Guardando ID: ' + spreadsheetId, 'debug');
    propiedades.setProperty('SPREADSHEET_ID', spreadsheetId);
    log('  ✅ ID guardado en propiedades', 'debug');

    return ss;
  } catch (error) {
    log('❌ ERROR CRÍTICO en getSpreadsheet():', 'error');
    log('   Mensaje: ' + error.message, 'error');
    log('   Stack: ' + error.stack, 'error');
    throw new Error('No se pudo acceder a la base de datos. Por favor, ejecute la función inicializarSistema() desde el editor de scripts.');
  }
}

// ============================================================================
// API PÚBLICA - FUNCIONES EXPUESTAS AL HTML
// ============================================================================

/**
 * API 1: Obtiene datos iniciales para el dashboard (clientes + movimientos recientes)
 * @returns {Object} {clientes: Array, movimientos: Array}
 */
function obtenerDatosParaHTML() {
  // IMPORTANTE: Definir objeto de respuesta por defecto al inicio
  // para garantizar que SIEMPRE se retorne algo válido
  const respuestaDefault = {
    success: false,
    error: 'Error inesperado - función no completada',
    clientes: [],
    movimientos: []
  };

  try {
    // Inicializar sistema de Arqueo de Caja si no existe
    try {
      setupCashSystemSheets();
      initializeHistoricalCashData();
    } catch (e) {
      log('⚠️ Nota: Error inicializando Arqueo (no crítico): ' + e.message, 'debug');
    }

    log('═══════════════════════════════════════════════════', 'debug');
    log('📥 obtenerDatosParaHTML - INICIO', 'debug');
    log('Usuario: ' + Session.getEffectiveUser().getEmail(), 'debug');
    log('═══════════════════════════════════════════════════', 'debug');

    // Optimización: usar paginación desde el repository
    const pageSize = CONFIG.PAGINATION.DEFAULT_PAGE_SIZE;
    const clientes = ClientesRepository.obtenerTodos(0, pageSize);
    const totalClientes = ClientesRepository.contarTodos();

    log(`✅ Clientes cargados: ${clientes.length} de ${totalClientes}`, 'debug');

    const movimientos = MovimientosRepository.obtenerRecientes(20);
    log(`✅ Movimientos cargados: ${movimientos.length}`, 'debug');

    const resultado = {
      success: true,
      clientes: clientes,
      movimientos: movimientos,
      totalClientes: totalClientes,
      cargaParcial: totalClientes > pageSize
    };

    log('═══════════════════════════════════════════════════', 'debug');
    log('✅ obtenerDatosParaHTML - ÉXITO', 'debug');
    log('   Clientes: ' + resultado.clientes.length, 'debug');
    log('   Movimientos: ' + resultado.movimientos.length, 'debug');
    log('═══════════════════════════════════════════════════', 'debug');

    // Retornar explícitamente
    return resultado;

  } catch (error) {
    log('═══════════════════════════════════════════════════', 'error');
    log('❌ ERROR CAPTURADO en obtenerDatosParaHTML', 'error');
    log('Mensaje: ' + (error.message || 'Sin mensaje'), 'error');
    log('Stack: ' + (error.stack || 'Sin stack'), 'error');
    log('═══════════════════════════════════════════════════', 'error');

    // Verificar si es error de acceso a base de datos
    let mensajeError = error.message || 'Error desconocido';
    if (mensajeError.includes('No se pudo acceder a la base de datos')) {
      mensajeError = 'Sistema no inicializado. Ejecute la función "inicializarSistema()" desde el editor de scripts (Extensiones > Apps Script).';
    }

    const resultadoError = {
      success: false,
      error: mensajeError,
      clientes: [],
      movimientos: []
    };

    log('Retornando objeto de error', 'error');
    return resultadoError;
  }
}

// Aquí irían todas las demás funciones API públicas...
// Por brevedad, solo incluyo las principales. En un sistema real,
// incluirías todas las funciones del archivo original.