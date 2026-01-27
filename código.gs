/**
 * ============================================================================
 * SISTEMA SOL & VERDE V18.0 - BACKEND GOOGLE APPS SCRIPT
 * ============================================================================
 *
 * Archivo: código.gs
 * Descripción: Backend completo para sistema de gestión de cuenta corriente
 * Compatibilidad: 100% con SistemaSolVerde.html V18.0
 *
 * Funcionalidades:
 * - 12 funciones de API pública
 * - Gestión de 2 hojas: CLIENTES y MOVIMIENTOS
 * - Integración con Claude AI para Visual Reasoning
 * - Fuzzy matching inteligente para búsqueda de clientes
 * - Cálculo automático de saldos
 * - Validaciones y seguridad robustas
 *
 * ============================================================================
 */


// ============================================================================
// FUNCIÓN PRINCIPAL PARA APLICACIÓN WEB
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


// ============================================================================
// 1. CONFIGURACIÓN GLOBAL
// ============================================================================

const CONFIG = {
  // Nombres de hojas en Google Sheets
  HOJAS: {
    CLIENTES: 'CLIENTES',
    MOVIMIENTOS: 'MOVIMIENTOS'
  },

  // Índices de columnas en hoja CLIENTES (base 0)
  COLS_CLIENTES: {
    NOMBRE: 0,      // A: String, UPPERCASE, PK
    TEL: 1,         // B: String
    EMAIL: 2,       // C: String
    LIMITE: 3,      // D: Number (default: 100000)
    SALDO: 4,       // E: Number (calculado automático)
    TOTAL_MOVS: 5,  // F: Number (contador)
    ALTA: 6,        // G: Date
    ULTIMO_MOV: 7,  // H: Date
    OBS: 8          // I: String
  },

  // Índices de columnas en hoja MOVIMIENTOS (base 0)
  COLS_MOVS: {
    ID: 0,          // A: Number autoincremental, PK
    FECHA: 1,       // B: Date ISO
    CLIENTE: 2,     // C: String, UPPERCASE, FK
    TIPO: 3,        // D: "DEBE" | "HABER"
    MONTO: 4,       // E: Number positivo
    SALDO_POST: 5,  // F: Number (saldo después del movimiento)
    OBS: 6,         // G: String
    USUARIO: 7      // H: Email (auditoría)
  },

  // Tipos de movimiento válidos
  TIPOS_MOVIMIENTO: {
    DEBE: 'DEBE',
    HABER: 'HABER'
  },

  // Configuración de Claude AI
  CLAUDE: {
    API_URL: 'https://api.anthropic.com/v1/messages',
    MODEL: 'claude-opus-4-5-20251101',
    MAX_TOKENS: 4096,
    VERSION: '2023-06-01'
  },

  // Parámetros de fuzzy matching
  FUZZY: {
    MIN_SCORE: 65,           // Score mínimo para considerar match
    MAX_SUGERENCIAS: 5,      // Máximo de sugerencias a devolver
    PESO_EXACTO: 100,        // Peso para match exacto
    PESO_COMIENZA: 85,       // Peso para "comienza con"
    PESO_CONTIENE: 70,       // Peso para "contiene"
    PESO_LEVENSHTEIN: 50     // Peso base para distancia Levenshtein
  },

  // Claves de PropertiesService
  PROPS: {
    API_KEY: 'CLAUDE_API_KEY'
  },

  // Configuración de cache
  CACHE: {
    CLIENTES_TTL: 60,        // Segundos de cache para clientes
    ENABLED: true             // Habilitar/deshabilitar cache
  },

  // Configuración de paginación
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 50,   // Tamaño de página por defecto (reducido de 100)
    MAX_PAGE_SIZE: 100       // Tamaño máximo de página
  },

  // Configuración de logging
  LOGGING: {
    ENABLED: false,          // Deshabilitar logging verbose en producción
    DEBUG_MODE: false        // Modo debug solo para desarrollo
  }
};


// ============================================================================
// 1.5. FUNCIÓN HELPER PARA OBTENER SPREADSHEET
// ============================================================================

/**
 * Helper para logging condicional basado en configuración
 * @param {string} mensaje - Mensaje a loggear
 * @param {string} nivel - Nivel: 'info', 'debug', 'error'
 */
function log(mensaje, nivel = 'info') {
  if (nivel === 'error' || CONFIG.LOGGING.ENABLED) {
    if (nivel === 'debug' && !CONFIG.LOGGING.DEBUG_MODE) return;
    Logger.log(mensaje);
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

/**
 * Convierte objetos Date a strings ISO para serialización Web
 * Procesa recursivamente objetos y arrays para asegurar que
 * todos los Date objects se conviertan a strings antes de
 * enviarlos a través de google.script.run
 *
 * @param {*} obj - Objeto a procesar (puede ser cualquier tipo)
 * @returns {*} Objeto con fechas convertidas a strings ISO
 */
function serializarParaWeb(obj) {
  // Manejar null y undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Convertir Date a ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Procesar arrays recursivamente
  if (Array.isArray(obj)) {
    return obj.map(item => serializarParaWeb(item));
  }

  // Procesar objetos recursivamente
  if (typeof obj === 'object') {
    const resultado = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        resultado[key] = serializarParaWeb(obj[key]);
      }
    }
    return resultado;
  }

  // Retornar primitivos sin cambios
  return obj;
}


// ============================================================================
// 2. UTILIDADES
// ============================================================================

/**
 * Calcula la distancia de Levenshtein entre dos strings
 * Optimizado con early termination para búsquedas fuzzy
 * @param {string} a - Primer string
 * @param {string} b - Segundo string
 * @param {number} maxDistance - Distancia máxima antes de abandonar (opcional)
 * @returns {number} Distancia de Levenshtein (o maxDistance+1 si excede)
 */
function levenshteinDistance(a, b, maxDistance = Infinity) {
  // Caso base: strings vacíos
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  // Optimización: si la diferencia de longitud ya excede maxDistance, retornar temprano
  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > maxDistance) {
    return maxDistance + 1;
  }

  const matrix = [];

  // Inicializar primera fila y columna
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Llenar matriz con early termination
  for (let i = 1; i <= b.length; i++) {
    let minInRow = Infinity;
    
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Sustitución
          matrix[i][j - 1] + 1,     // Inserción
          matrix[i - 1][j] + 1      // Eliminación
        );
      }
      
      minInRow = Math.min(minInRow, matrix[i][j]);
    }
    
    // Early termination: si el mínimo en esta fila excede maxDistance, no hay match posible
    if (minInRow > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calcula un score de similitud fuzzy entre dos strings
 * Optimizado con early returns
 * @param {string} busqueda - String de búsqueda (normalizado)
 * @param {string} candidato - String candidato (normalizado)
 * @returns {number} Score de 0-100
 */
function calcularScoreFuzzy(busqueda, candidato) {
  // Match exacto - retornar inmediatamente
  if (busqueda === candidato) {
    return CONFIG.FUZZY.PESO_EXACTO;
  }

  // Comienza con - retornar inmediatamente
  if (candidato.startsWith(busqueda)) {
    return CONFIG.FUZZY.PESO_COMIENZA;
  }

  // Contiene - retornar inmediatamente
  if (candidato.includes(busqueda)) {
    return CONFIG.FUZZY.PESO_CONTIENE;
  }

  // Distancia Levenshtein solo si los anteriores fallaron
  const maxLen = Math.max(busqueda.length, candidato.length);
  
  // Calcular distancia máxima aceptable basada en MIN_SCORE
  const maxDistanceAllowed = Math.floor(maxLen * (1 - CONFIG.FUZZY.MIN_SCORE / 100));
  
  const distancia = levenshteinDistance(busqueda, candidato, maxDistanceAllowed);
  
  // Si excede la distancia máxima, retornar score bajo
  if (distancia > maxDistanceAllowed) {
    return 0;
  }

  // Convertir distancia a score (0-100)
  const similitud = 1 - (distancia / maxLen);
  return Math.round(similitud * CONFIG.FUZZY.PESO_LEVENSHTEIN);
}

/**
 * Normaliza un string para comparación (mayúsculas, sin espacios extras)
 * @param {string} str - String a normalizar
 * @returns {string} String normalizado
 */
function normalizarString(str) {
  if (!str) return '';
  return String(str).toUpperCase().trim().replace(/\s+/g, ' ');
}

/**
 * Valida que un tipo de movimiento sea válido
 * @param {string} tipo - Tipo a validar
 * @returns {boolean} True si es válido
 */
function estipoMovimientoValido(tipo) {
  return tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE ||
         tipo === CONFIG.TIPOS_MOVIMIENTO.HABER;
}

/**
 * Valida que un monto sea positivo
 * @param {number} monto - Monto a validar
 * @returns {boolean} True si es válido
 */
function esMontoValido(monto) {
  return typeof monto === 'number' && monto > 0 && isFinite(monto);
}

/**
 * Valida y convierte una fecha de entrada
 * @param {string|Date} fecha - Fecha a validar
 * @returns {Date|null} Objeto Date válido o null si es inválido
 */
function validarFecha(fecha) {
  if (!fecha) return null;
  
  try {
    const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
    
    // Verificar si la fecha es válida
    if (isNaN(fechaObj.getTime())) {
      log('⚠️ Fecha inválida: ' + fecha, 'error');
      return null;
    }
    
    // Verificar que la fecha esté en un rango razonable (1900-2100)
    const year = fechaObj.getFullYear();
    if (year < 1900 || year > 2100) {
      log('⚠️ Año fuera de rango: ' + year, 'error');
      return null;
    }
    
    return fechaObj;
  } catch (error) {
    log('❌ Error al validar fecha: ' + error.message, 'error');
    return null;
  }
}

/**
 * Valida un objeto de movimiento completo
 * @param {Object} mov - Objeto movimiento
 * @returns {Object} {valid: boolean, errors: Array}
 */
function validarMovimiento(mov) {
  const errors = [];
  
  if (!mov.cliente || typeof mov.cliente !== 'string' || mov.cliente.trim() === '') {
    errors.push('Cliente es requerido');
  }
  
  if (!estipoMovimientoValido(mov.tipo)) {
    errors.push('Tipo de movimiento inválido (debe ser DEBE o HABER)');
  }
  
  if (!esMontoValido(mov.monto)) {
    errors.push('Monto inválido (debe ser un número positivo)');
  }
  
  const fechaVal = validarFecha(mov.fecha);
  if (!fechaVal) {
    errors.push('Fecha inválida');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}


// ============================================================================
// 3. CLIENTES REPOSITORY
// ============================================================================

const ClientesRepository = {
  /**
   * Obtiene la hoja de CLIENTES
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.CLIENTES);

    // Crear hoja si no existe
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.CLIENTES);
      // Agregar encabezados
      hoja.appendRow(['NOMBRE', 'TEL', 'EMAIL', 'LIMITE', 'SALDO', 'TOTAL_MOVS', 'ALTA', 'ULTIMO_MOV', 'OBS']);
      hoja.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
    }

    return hoja;
  },

  /**
   * Obtiene todos los clientes
   * @returns {Array<Object>} Array de objetos cliente
   */
  obtenerTodos: function(offset = 0, limit = 0) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return []; // Solo encabezados o vacío (backward compatible)

    // Calculate actual range to read
    const totalClientes = lastRow - 1; // Exclude header
    const actualLimit = limit === 0 ? totalClientes : Math.min(limit, totalClientes);
    const startRow = Math.min(offset + 2, lastRow + 1); // +2: skip header row 1, +offset from row 2
    const rowCount = Math.max(0, Math.min(actualLimit, lastRow - offset - 1));

    // Read only the specific range instead of entire sheet (PERFORMANCE FIX)
    let datos = [];
    if (rowCount > 0) {
      datos = hoja.getRange(startRow, 1, rowCount, 9).getValues();
    }

    const clientes = [];
    for (let i = 0; i < datos.length; i++) {
      const fila = datos[i];

      // Convertir fechas a ISO strings para serialización Web
      const alta = fila[CONFIG.COLS_CLIENTES.ALTA];
      const ultimoMov = fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV];

      clientes.push({
        nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE] || '',
        tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
        email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
        limite: Number(fila[CONFIG.COLS_CLIENTES.LIMITE]) || 100000,
        saldo: Number(fila[CONFIG.COLS_CLIENTES.SALDO]) || 0,
        totalMovs: Number(fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS]) || 0,
        alta: alta instanceof Date ? alta.toISOString() : (alta || ''),
        ultimoMov: ultimoMov instanceof Date ? ultimoMov.toISOString() : (ultimoMov || ''),
        obs: fila[CONFIG.COLS_CLIENTES.OBS] || ''
      });
    }

    return clientes;
  },

  /**
   * Cuenta el total de clientes sin cargar todos los datos
   * @returns {number} Total de clientes
   */
  contarTodos: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    return Math.max(0, lastRow - 1); // Exclude header
  },

  /**
   * Busca un cliente por nombre (normalizado)
   * @param {string} nombre - Nombre del cliente
   * @returns {Object|null} Objeto con {cliente, fila} o null si no existe
   */
  buscarPorNombre: function(nombre) {
    const nombreNorm = normalizarString(nombre);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      const nombreFila = normalizarString(datos[i][CONFIG.COLS_CLIENTES.NOMBRE]);
      if (nombreFila === nombreNorm) {
        const fila = datos[i];

        // Convertir fechas a ISO strings para serialización Web (FIX visor de clientes)
        const alta = fila[CONFIG.COLS_CLIENTES.ALTA];
        const ultimoMov = fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV];

        return {
          cliente: {
            nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
            tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
            email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
            limite: Number(fila[CONFIG.COLS_CLIENTES.LIMITE]) || 100000,
            saldo: Number(fila[CONFIG.COLS_CLIENTES.SALDO]) || 0,
            totalMovs: Number(fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS]) || 0,
            alta: alta instanceof Date ? alta.toISOString() : (alta || ''),
            ultimoMov: ultimoMov instanceof Date ? ultimoMov.toISOString() : (ultimoMov || ''),
            obs: fila[CONFIG.COLS_CLIENTES.OBS] || ''
          },
          fila: i + 1 // Número de fila (1-indexed)
        };
      }
    }

    return null;
  },

  /**
   * Crea un nuevo cliente
   * @param {Object} clienteData - Datos del cliente
   * @returns {Object} Cliente creado
   */
  crear: function(clienteData) {
    const hoja = this.getHoja();
    const nombreNorm = normalizarString(clienteData.nombre);

    // Validar que no exista
    if (this.buscarPorNombre(nombreNorm)) {
      throw new Error(`El cliente "${nombreNorm}" ya existe`);
    }

    // Validar nombre no vacío
    if (!nombreNorm) {
      throw new Error('El nombre del cliente no puede estar vacío');
    }

    const ahora = new Date();
    const nuevaFila = [
      nombreNorm,                           // NOMBRE
      clienteData.tel || '',                // TEL
      clienteData.email || '',              // EMAIL
      clienteData.limite || 100000,         // LIMITE
      0,                                    // SALDO (inicial)
      0,                                    // TOTAL_MOVS (inicial)
      ahora,                                // ALTA
      '',                                   // ULTIMO_MOV (vacío inicialmente)
      clienteData.obs || ''                 // OBS
    ];

    hoja.appendRow(nuevaFila);

    return {
      nombre: nombreNorm,
      tel: clienteData.tel || '',
      email: clienteData.email || '',
      limite: clienteData.limite || 100000,
      saldo: 0,
      totalMovs: 0,
      alta: ahora.toISOString(),  // Convertir Date a ISO string
      ultimoMov: '',
      obs: clienteData.obs || ''
    };
  },

  /**
   * Actualiza datos de un cliente (excepto SALDO y TOTAL_MOVS)
   * @param {string} nombreCliente - Nombre del cliente a actualizar
   * @param {Object} datos - Datos a actualizar
   * @returns {Object} Cliente actualizado
   */
  actualizar: function(nombreCliente, datos) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    // Actualizar campos permitidos (no SALDO ni TOTAL_MOVS)
    if (datos.tel !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.TEL + 1).setValue(datos.tel);
    }
    if (datos.email !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.EMAIL + 1).setValue(datos.email);
    }
    if (datos.limite !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.LIMITE + 1).setValue(datos.limite);
    }
    if (datos.obs !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.OBS + 1).setValue(datos.obs);
    }

    // Retornar cliente actualizado
    return this.buscarPorNombre(nombreCliente).cliente;
  },

  /**
   * Actualiza SALDO, TOTAL_MOVS y ULTIMO_MOV de un cliente
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   * @param {Date} fechaMov - Fecha del movimiento
   */
  actualizarSaldoYContadores: function(nombreCliente, nuevoSaldo, fechaMov) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    // Actualizar SALDO
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);

    // Incrementar TOTAL_MOVS
    const totalActual = resultado.cliente.totalMovs || 0;
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.TOTAL_MOVS + 1).setValue(totalActual + 1);

    // Actualizar ULTIMO_MOV
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue(fechaMov);
  },

  /**
   * PERFORMANCE: Actualiza SOLO saldo, contadores y fecha sin recargar todo
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   * @param {Date} fechaMov - Fecha del movimiento
   * @returns {Object} Cliente actualizado
   */
  actualizarSaldoRapido: function(nombreCliente, nuevoSaldo, fechaMov) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    // Actualizar solo 3 celdas (muy rápido, no recarga datos)
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.TOTAL_MOVS + 1).setValue((resultado.cliente.totalMovs || 0) + 1);
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue(fechaMov);

    // Retornar cliente actualizado sin recargar del sheet
    return {
      nombre: resultado.cliente.nombre,
      saldo: nuevoSaldo,
      totalMovs: (resultado.cliente.totalMovs || 0) + 1,
      ultimoMov: fechaMov instanceof Date ? fechaMov.toISOString() : fechaMov
    };
  },

  /**
   * Actualiza SOLO el saldo (para operaciones de edit/delete de movimientos)
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   */
  actualizarSaldoDirecto: function(nombreCliente, nuevoSaldo) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);
  },

  /**
   * Elimina un cliente (solo si no tiene movimientos)
   * @param {string} nombreCliente - Nombre del cliente a eliminar
   */
  eliminar: function(nombreCliente) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    // Verificar que no tenga movimientos
    const movimientos = MovimientosRepository.obtenerPorCliente(nombreCliente);
    if (movimientos.length > 0) {
      throw new Error(`No se puede eliminar "${nombreCliente}" porque tiene ${movimientos.length} movimientos registrados`);
    }

    const hoja = this.getHoja();
    hoja.deleteRow(resultado.fila);
  },

  /**
   * Obtiene el saldo actual de un cliente
   * @param {string} nombreCliente - Nombre del cliente
   * @returns {number} Saldo actual
   */
  obtenerSaldo: function(nombreCliente) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    return resultado.cliente.saldo || 0;
  }
};


// ============================================================================
// 4. MOVIMIENTOS REPOSITORY
// ============================================================================

const MovimientosRepository = {
  /**
   * Obtiene la hoja de MOVIMIENTOS
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.MOVIMIENTOS);

    // Crear hoja si no existe
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.MOVIMIENTOS);
      // Agregar encabezados
      hoja.appendRow(['ID', 'FECHA', 'CLIENTE', 'TIPO', 'MONTO', 'SALDO_POST', 'OBS', 'USUARIO']);
      hoja.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#27AE60').setFontColor('#FFFFFF');
    }

    return hoja;
  },

  /**
   * Genera un nuevo ID autoincremental
   * @returns {number} Nuevo ID
   */
  generarNuevoID: function() {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return 1; // Primer movimiento

    // Obtener último ID
    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const id = datos[i][CONFIG.COLS_MOVS.ID];
      if (typeof id === 'number' && id > maxId) {
        maxId = id;
      }
    }

    return maxId + 1;
  },

  /**
   * Registra un movimiento individual
   * @param {Object} movimientoData - Datos del movimiento
   * @returns {Object} Movimiento registrado
   */
  registrar: function(movimientoData) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000); // Timeout de 30 segundos

      // Validaciones
      const clienteNorm = normalizarString(movimientoData.cliente);
      if (!clienteNorm) {
        throw new Error('El nombre del cliente no puede estar vacío');
      }

      if (!ClientesRepository.buscarPorNombre(clienteNorm)) {
        throw new Error(`Cliente "${clienteNorm}" no encontrado`);
      }

      if (!estipoMovimientoValido(movimientoData.tipo)) {
        throw new Error(`Tipo de movimiento inválido: "${movimientoData.tipo}". Debe ser DEBE o HABER`);
      }

      if (!esMontoValido(movimientoData.monto)) {
        throw new Error('El monto debe ser un número positivo');
      }

      // Calcular nuevo saldo
      const saldoAnterior = ClientesRepository.obtenerSaldo(clienteNorm);
      let nuevoSaldo;

      if (movimientoData.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        nuevoSaldo = saldoAnterior + movimientoData.monto;
      } else {
        nuevoSaldo = saldoAnterior - movimientoData.monto;
      }

      // Registrar movimiento
      const hoja = this.getHoja();
      const nuevoID = this.generarNuevoID();
      // Use the user-provided date if available, otherwise use current date
      const fecha = movimientoData.fecha ? new Date(movimientoData.fecha) : new Date();
      const usuario = Session.getActiveUser().getEmail();

      const nuevaFila = [
        nuevoID,                              // ID
        fecha,                                // FECHA
        clienteNorm,                          // CLIENTE
        movimientoData.tipo,                  // TIPO
        movimientoData.monto,                 // MONTO
        nuevoSaldo,                           // SALDO_POST
        movimientoData.obs || '',             // OBS
        usuario                               // USUARIO
      ];

      hoja.appendRow(nuevaFila);

      // Actualizar cliente
      ClientesRepository.actualizarSaldoYContadores(clienteNorm, nuevoSaldo, fecha);

      lock.releaseLock();

      return {
        id: nuevoID,
        fecha: fecha.toISOString(),  // Convertir Date a ISO string
        cliente: clienteNorm,
        tipo: movimientoData.tipo,
        monto: movimientoData.monto,
        saldoPost: nuevoSaldo,
        obs: movimientoData.obs || '',
        usuario: usuario
      };

    } catch (error) {
      lock.releaseLock();
      throw error;
    }
  },

  /**
   * Registra un lote de movimientos (para Visual Reasoning)
   * @param {Array<Object>} movimientos - Array de movimientos
   * @returns {Object} Resultado con movimientos exitosos y errores
   */
  registrarLote: function(movimientos) {
    const resultados = {
      exitosos: [],
      errores: []
    };

    for (let i = 0; i < movimientos.length; i++) {
      const mov = movimientos[i];
      try {
        const registrado = this.registrar(mov);
        resultados.exitosos.push(registrado);
      } catch (error) {
        resultados.errores.push({
          movimiento: mov,
          error: error.message,
          indice: i
        });
      }
    }

    return resultados;
  },

  /**
   * Obtiene los movimientos más recientes
   * @param {number} limite - Cantidad máxima de movimientos
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerRecientes: function(limite) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return []; // Solo encabezados o vacío

    // PERFORMANCE FIX: Instead of reading entire sheet, read only last N+buffer rows
    // Buffer of 50% extra to ensure we get all we need (sorted by date, not insertion order)
    const buffer = Math.ceil(limite * 1.5);
    const rowsToRead = Math.min(buffer, lastRow - 1); // Don't read more than available
    const startRow = Math.max(2, lastRow - rowsToRead + 1); // Start from appropriate row

    let datos = [];
    if (rowsToRead > 0) {
      datos = hoja.getRange(startRow, 1, rowsToRead, 8).getValues();
    }

    const movimientos = [];

    // Comenzar desde el final (más recientes primero)
    for (let i = datos.length - 1; i >= 0 && movimientos.length < limite; i--) {
      const fila = datos[i];
      const fecha = fila[CONFIG.COLS_MOVS.FECHA];

      movimientos.push({
        id: fila[CONFIG.COLS_MOVS.ID],
        fecha: fecha instanceof Date ? fecha.toISOString() : fecha,  // Convertir Date a ISO string
        cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
        tipo: fila[CONFIG.COLS_MOVS.TIPO],
        monto: fila[CONFIG.COLS_MOVS.MONTO],
        saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
        obs: fila[CONFIG.COLS_MOVS.OBS] || '',
        usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
      });
    }

    return movimientos;
  },

  /**
   * Obtiene todos los movimientos de un cliente
   * @param {string} nombreCliente - Nombre del cliente
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerPorCliente: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const movimientos = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const clienteFila = normalizarString(fila[CONFIG.COLS_MOVS.CLIENTE]);

      if (clienteFila === nombreNorm) {
        const fecha = fila[CONFIG.COLS_MOVS.FECHA];

        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fecha instanceof Date ? fecha.toISOString() : fecha,  // Convertir Date a ISO string
          cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
          tipo: fila[CONFIG.COLS_MOVS.TIPO],
          monto: fila[CONFIG.COLS_MOVS.MONTO],
          saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
          obs: fila[CONFIG.COLS_MOVS.OBS] || '',
          usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
        });
      }
    }

    // Ordenar por ID descendente (más recientes primero)
    movimientos.sort((a, b) => b.id - a.id);

    return movimientos;
  },

  /**
   * Elimina todos los movimientos de un cliente
   * @param {string} nombreCliente - Nombre del cliente
   */
  eliminarPorCliente: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    // Recorrer de abajo hacia arriba para no alterar índices
    for (let i = datos.length - 1; i >= 1; i--) {
      const clienteFila = normalizarString(datos[i][CONFIG.COLS_MOVS.CLIENTE]);
      if (clienteFila === nombreNorm) {
        hoja.deleteRow(i + 1);
      }
    }
  },

  /**
   * Obtiene movimientos en un rango de fechas
   * @param {Date} desde - Fecha inicio
   * @param {Date} hasta - Fecha fin
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerPorRango: function(desde, hasta) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const movimientos = [];
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);

    // Normalizar a medianoche
    fechaDesde.setHours(0, 0, 0, 0);
    fechaHasta.setHours(23, 59, 59, 999);

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const fechaMov = new Date(fila[CONFIG.COLS_MOVS.FECHA]);

      if (fechaMov >= fechaDesde && fechaMov <= fechaHasta) {
        const fecha = fila[CONFIG.COLS_MOVS.FECHA];

        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fecha instanceof Date ? fecha.toISOString() : fecha,  // Convertir Date a ISO string
          cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
          tipo: fila[CONFIG.COLS_MOVS.TIPO],
          monto: fila[CONFIG.COLS_MOVS.MONTO],
          saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
          obs: fila[CONFIG.COLS_MOVS.OBS] || '',
          usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
        });
      }
    }

    return movimientos;
  }
};


// ============================================================================
// 4B. RECAUDACIÓN REPOSITORY - SISTEMA INDEPENDIENTE DE COBROS
// ============================================================================

/**
 * Configuración específica para Recaudación
 */
const RECAUDACION_CONFIG = {
  HOJA: 'RECAUDACION_EFECTIVO',
  COLS: {
    ID: 0,
    FECHA: 1,
    CLIENTE: 2,
    MONTO: 3,
    FORMA_PAGO: 4,
    OBS: 5,
    USUARIO: 6,
    TIMESTAMP: 7,
    ESTADO: 8
  },
  FORMAS_PAGO: ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'TARJETA', 'OTRO'],
  ESTADOS: ['REGISTRADO', 'DEPOSITADO', 'CONCILIADO']
};

const RecaudacionRepository = {
  /**
   * Obtiene o crea la hoja RECAUDACION_EFECTIVO
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(RECAUDACION_CONFIG.HOJA);

    if (!hoja) {
      hoja = ss.insertSheet(RECAUDACION_CONFIG.HOJA);
      hoja.appendRow([
        'ID', 'FECHA', 'CLIENTE', 'MONTO', 'FORMA_PAGO',
        'OBS', 'USUARIO', 'TIMESTAMP', 'ESTADO'
      ]);
      hoja.getRange(1, 1, 1, 9)
        .setFontWeight('bold')
        .setBackground('#FF6F00')
        .setFontColor('#FFFFFF');
      Logger.log('✅ Hoja RECAUDACION_EFECTIVO creada');
    }

    return hoja;
  },

  /**
   * Genera nuevo ID autoincremental
   */
  generarNuevoID: function() {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return 1;

    let maxId = 0;
    for (let i = 1; i < datos.length; i++) {
      const id = datos[i][RECAUDACION_CONFIG.COLS.ID];
      if (typeof id === 'number' && id > maxId) maxId = id;
    }

    return maxId + 1;
  },

  /**
   * Registra una recaudación nueva
   */
  registrar: function(recaudacionData) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000);

      // Validaciones
      const clienteNorm = normalizarString(recaudacionData.cliente);
      if (!clienteNorm) {
        throw new Error('Cliente requerido');
      }

      if (!ClientesRepository.buscarPorNombre(clienteNorm)) {
        throw new Error(`Cliente "${clienteNorm}" no encontrado`);
      }

      if (!recaudacionData.monto || recaudacionData.monto <= 0) {
        throw new Error('Monto debe ser positivo');
      }

      const formaPago = String(recaudacionData.forma_pago || 'EFECTIVO').toUpperCase();
      if (!RECAUDACION_CONFIG.FORMAS_PAGO.includes(formaPago)) {
        throw new Error('Forma de pago inválida');
      }

      // Registrar recaudación
      const hoja = this.getHoja();
      const nuevoID = this.generarNuevoID();
      const fecha = new Date();
      const usuario = Session.getActiveUser().getEmail();

      const nuevaFila = [
        nuevoID,
        fecha,
        clienteNorm,
        recaudacionData.monto,
        formaPago,
        recaudacionData.obs || '',
        usuario,
        fecha,
        'REGISTRADO'
      ];

      hoja.appendRow(nuevaFila);

      lock.releaseLock();

      return {
        id: nuevoID,
        fecha: fecha.toISOString(),
        cliente: clienteNorm,
        monto: recaudacionData.monto,
        forma_pago: formaPago,
        obs: recaudacionData.obs || '',
        usuario: usuario,
        estado: 'REGISTRADO'
      };

    } catch (error) {
      lock.releaseLock();
      throw error;
    }
  },

  /**
   * Obtiene recaudaciones por cliente
   */
  obtenerPorCliente: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const recaudaciones = [];
    for (let i = 1; i < datos.length; i++) {
      const clienteFila = normalizarString(datos[i][RECAUDACION_CONFIG.COLS.CLIENTE]);

      if (clienteFila === nombreNorm) {
        const fecha = datos[i][RECAUDACION_CONFIG.COLS.FECHA];
        recaudaciones.push({
          id: datos[i][RECAUDACION_CONFIG.COLS.ID],
          fecha: fecha instanceof Date ? fecha.toISOString() : fecha,
          cliente: datos[i][RECAUDACION_CONFIG.COLS.CLIENTE],
          monto: datos[i][RECAUDACION_CONFIG.COLS.MONTO],
          forma_pago: datos[i][RECAUDACION_CONFIG.COLS.FORMA_PAGO],
          obs: datos[i][RECAUDACION_CONFIG.COLS.OBS] || '',
          usuario: datos[i][RECAUDACION_CONFIG.COLS.USUARIO] || '',
          timestamp: datos[i][RECAUDACION_CONFIG.COLS.TIMESTAMP],
          estado: datos[i][RECAUDACION_CONFIG.COLS.ESTADO]
        });
      }
    }

    return recaudaciones.sort((a, b) => b.id - a.id);
  },

  /**
   * Obtiene recaudaciones en rango de fechas
   */
  obtenerPorRango: function(desde, hasta) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);
    fechaDesde.setHours(0, 0, 0, 0);
    fechaHasta.setHours(23, 59, 59, 999);

    const recaudaciones = [];
    for (let i = 1; i < datos.length; i++) {
      const fechaMov = new Date(datos[i][RECAUDACION_CONFIG.COLS.FECHA]);

      if (fechaMov >= fechaDesde && fechaMov <= fechaHasta) {
        const fecha = datos[i][RECAUDACION_CONFIG.COLS.FECHA];
        recaudaciones.push({
          id: datos[i][RECAUDACION_CONFIG.COLS.ID],
          fecha: fecha instanceof Date ? fecha.toISOString() : fecha,
          cliente: datos[i][RECAUDACION_CONFIG.COLS.CLIENTE],
          monto: datos[i][RECAUDACION_CONFIG.COLS.MONTO],
          forma_pago: datos[i][RECAUDACION_CONFIG.COLS.FORMA_PAGO],
          obs: datos[i][RECAUDACION_CONFIG.COLS.OBS] || '',
          usuario: datos[i][RECAUDACION_CONFIG.COLS.USUARIO] || '',
          estado: datos[i][RECAUDACION_CONFIG.COLS.ESTADO]
        });
      }
    }

    return recaudaciones;
  },

  /**
   * Obtiene totales diarios
   */
  obtenerTotalesDiarios: function(fecha) {
    const recaudaciones = this.obtenerPorRango(fecha, fecha);

    const totales = {
      fecha: fecha instanceof Date ? fecha.toISOString().split('T')[0] : fecha,
      total_recaudado: 0,
      cantidad_movimientos: recaudaciones.length,
      por_forma_pago: {}
    };

    RECAUDACION_CONFIG.FORMAS_PAGO.forEach(forma => {
      totales.por_forma_pago[forma] = 0;
    });

    recaudaciones.forEach(rec => {
      totales.total_recaudado += rec.monto;
      totales.por_forma_pago[rec.forma_pago] =
        (totales.por_forma_pago[rec.forma_pago] || 0) + rec.monto;
    });

    return totales;
  }
};


// ============================================================================
// 5. CLAUDE SERVICE
// ============================================================================

const ClaudeService = {
  /**
   * Obtiene la API Key de Claude desde PropertiesService
   * @returns {string|null} API Key o null si no está configurada
   */
  getApiKey: function() {
    const props = PropertiesService.getUserProperties();
    return props.getProperty(CONFIG.PROPS.API_KEY);
  },

  /**
   * Analiza una imagen usando Claude Vision API
   * @param {string} imageBase64 - Imagen en formato Base64
   * @returns {Object} Resultado del análisis
   */
  analizarImagen: function(imageBase64) {
    Logger.log('🔍 INICIO: analizarImagen - Diagnóstico Visual Reasoning');

    // PASO 1: Verificar API Key
    Logger.log('📋 Paso 1: Verificando API Key...');
    const apiKey = this.getApiKey();
    Logger.log('✓ API Key presente: ' + !!apiKey);
    Logger.log('✓ Longitud API Key: ' + (apiKey ? apiKey.length : 0) + ' caracteres');

    if (!apiKey) {
      const error = 'API Key de Claude no configurada. Por favor, configure la API Key en el módulo de Configuración.';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    // PASO 2: Validar imagen Base64 - FIX: Validar que no sea undefined primero
    Logger.log('📋 Paso 2: Validando imagen Base64...');
    Logger.log('✓ imageBase64 tipo: ' + typeof imageBase64);
    Logger.log('✓ imageBase64 === undefined: ' + (imageBase64 === undefined));
    Logger.log('✓ imageBase64 === null: ' + (imageBase64 === null));
    Logger.log('✓ imageBase64 === "": ' + (imageBase64 === ""));

    if (imageBase64 === undefined || imageBase64 === null || imageBase64 === '') {
      const error = 'Image Base64 no fue recibida (undefined/null/empty). Esto puede ocurrir si: 1) El archivo es muy grande (>5MB), 2) La conexión fue interrumpida, 3) Browser bloqueó el acceso a FileReader. Por favor, recarga la página e intenta de nuevo.';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    Logger.log('✓ Longitud imagen: ' + imageBase64.length + ' caracteres');
    if (imageBase64.length < 100) {
      const error = 'Imagen demasiado pequeña o inválida (< 100 caracteres Base64)';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    // PASO 3: Detectar tipo de imagen desde el prefijo Base64
    Logger.log('📋 Paso 3: Detectando tipo de imagen...');
    let mediaType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) {
      mediaType = 'image/png';
    } else if (imageBase64.includes('data:image/webp')) {
      mediaType = 'image/webp';
    } else if (imageBase64.includes('data:image/gif')) {
      mediaType = 'image/gif';
    }
    Logger.log('✓ Tipo de imagen detectado: ' + mediaType);

    // PASO 4: Limpiar prefijo Base64
    Logger.log('📋 Paso 4: Limpiando prefijo Base64...');
    const base64Clean = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    Logger.log('✓ Base64 limpio, longitud: ' + base64Clean.length + ' caracteres');

    // PASO 5: Construir payload para Claude API
    Logger.log('📋 Paso 5: Construyendo payload para Claude API...');
    const payload = {
      model: CONFIG.CLAUDE.MODEL,
      max_tokens: CONFIG.CLAUDE.MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Clean
              }
            },
            {
              type: 'text',
              text: `Analiza esta imagen de una cuenta corriente o planilla de movimientos financieros.

Extrae TODOS los movimientos visibles en formato JSON con la siguiente estructura:

{
  "movimientos": [
    {
      "cliente": "NOMBRE COMPLETO DEL CLIENTE (en mayúsculas)",
      "tipo": "DEBE o HABER",
      "monto": número positivo,
      "obs": "descripción del movimiento",
      "fecha": "YYYY-MM-DD" (si está visible, sino usar fecha actual)
    }
  ]
}

INSTRUCCIONES CRÍTICAS:
1. El campo "tipo" DEBE ser exactamente "DEBE" o "HABER" (mayúsculas)
2. El campo "cliente" debe estar en MAYÚSCULAS
3. El campo "monto" debe ser un número positivo (sin símbolos $)
4. Extrae TODOS los movimientos visibles, no solo algunos
5. Si no hay movimientos visibles, devuelve array vacío

Responde SOLO con el JSON, sin explicaciones adicionales.`
            }
          ]
        }
      ]
    };
    Logger.log('✓ Payload construido, modelo: ' + CONFIG.CLAUDE.MODEL);

    // PASO 6: Preparar options de fetch
    Logger.log('📋 Paso 6: Preparando opciones de UrlFetch...');
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CONFIG.CLAUDE.VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    Logger.log('✓ Headers configurados, URL: ' + CONFIG.CLAUDE.API_URL);

    try {
      // PASO 7: Hacer request a Claude API
      Logger.log('📋 Paso 7: Enviando request a Claude API...');
      const response = UrlFetchApp.fetch(CONFIG.CLAUDE.API_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      Logger.log('✓ Response recibida, código: ' + responseCode);
      Logger.log('✓ Response longitud: ' + responseText.length + ' caracteres');

      // PASO 8: Validar código de respuesta
      Logger.log('📋 Paso 8: Validando código de respuesta...');
      if (responseCode !== 200) {
        Logger.log('❌ Error de Claude API (código ' + responseCode + ')');
        Logger.log('❌ Respuesta: ' + responseText.substring(0, 500));
        throw new Error(`Error de Claude API (${responseCode}): ${responseText.substring(0, 200)}`);
      }
      Logger.log('✓ Código 200 OK');

      // PASO 9: Parsear respuesta JSON
      Logger.log('📋 Paso 9: Parseando respuesta JSON...');
      const resultado = JSON.parse(responseText);
      Logger.log('✓ JSON parseado correctamente');

      // PASO 10: Extraer texto de la respuesta
      Logger.log('📋 Paso 10: Extrayendo texto de contenido...');
      if (!resultado.content || !resultado.content[0] || !resultado.content[0].text) {
        Logger.log('❌ Estructura de respuesta inválida');
        Logger.log('❌ Response content: ' + JSON.stringify(resultado).substring(0, 300));
        throw new Error('Respuesta de Claude API inválida: falta content.text');
      }

      const textoRespuesta = resultado.content[0].text;
      Logger.log('✓ Texto extraído, longitud: ' + textoRespuesta.length + ' caracteres');

      // PASO 11: Limpiar JSON de la respuesta
      Logger.log('📋 Paso 11: Limpiando JSON de markdown...');
      let jsonLimpio = textoRespuesta.trim();
      const originalLength = jsonLimpio.length;
      jsonLimpio = jsonLimpio.replace(/^```json\n?/i, '').replace(/\n?```$/i, '');
      Logger.log('✓ JSON limpio, tamaño: ' + originalLength + ' → ' + jsonLimpio.length + ' caracteres');

      // PASO 12: Parsear JSON extraído
      Logger.log('📋 Paso 12: Parseando JSON de movimientos...');
      const datosExtraidos = JSON.parse(jsonLimpio);
      Logger.log('✓ JSON de movimientos parseado correctamente');

      // PASO 13: Validar estructura de datos
      Logger.log('📋 Paso 13: Validando estructura de datos...');
      if (!datosExtraidos.movimientos || !Array.isArray(datosExtraidos.movimientos)) {
        Logger.log('❌ Falta array "movimientos" en respuesta');
        Logger.log('❌ Estructura recibida: ' + JSON.stringify(datosExtraidos).substring(0, 300));
        throw new Error('Formato de respuesta inválido: falta array "movimientos"');
      }

      const totalMovimientos = datosExtraidos.movimientos.length;
      Logger.log('✓ Estructura válida, movimientos extraídos: ' + totalMovimientos);

      // PASO 14: Retornar resultado
      Logger.log('📋 Paso 14: Preparando respuesta final...');
      const resultado_final = {
        success: true,
        movimientos: datosExtraidos.movimientos,
        totalExtraidos: totalMovimientos
      };
      Logger.log('✅ ÉXITO: Visual Reasoning completado - ' + totalMovimientos + ' movimientos extraídos');

      return resultado_final;

    } catch (error) {
      Logger.log('❌ ERROR EN PASO ANTERIOR: ' + error.message);
      Logger.log('❌ Stack: ' + error.stack);
      throw new Error('Error al analizar imagen: ' + error.message);
    }
  }
};


// ============================================================================
// 6. API PÚBLICA - 12 FUNCIONES EXPUESTAS AL HTML
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

/**
 * API 2: Obtiene historial completo de un cliente
 * @param {string} nombreCliente - Nombre del cliente
 * @returns {Object} {cliente: Object, movimientos: Array}
 */
function obtenerDatosCompletoCliente(nombreCliente) {
  try {
    const resultado = ClientesRepository.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const movimientos = MovimientosRepository.obtenerPorCliente(nombreCliente);

    return {
      success: true,
      cliente: resultado.cliente,
      movimientos: movimientos
    };
  } catch (error) {
    log('Error en obtenerDatosCompletoCliente: ' + error.message, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 3: Obtiene estadísticas para el dashboard
 * @param {string} desde - Fecha inicio (ISO string)
 * @param {string} hasta - Fecha fin (ISO string)
 * @returns {Object} Estadísticas completas
 */
function obtenerEstadisticas(desde, hasta) {
  try {
    const fechaDesde = new Date(desde);
    const fechaHasta = new Date(hasta);

    // Obtener datos
    const clientes = ClientesRepository.obtenerTodos();
    const movimientos = MovimientosRepository.obtenerPorRango(fechaDesde, fechaHasta);

    // Calcular métricas
    let totalDebe = 0;
    let totalHaber = 0;
    let totalMovimientos = movimientos.length;

    const clientesConMovimientos = new Set();

    movimientos.forEach(mov => {
      if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        totalDebe += mov.monto;
      } else {
        totalHaber += mov.monto;
      }
      clientesConMovimientos.add(mov.cliente);
    });

    // Calcular saldos
    let saldoPositivo = 0;
    let saldoNegativo = 0;
    let clientesConSaldoPositivo = 0;
    let clientesConSaldoNegativo = 0;

    clientes.forEach(cliente => {
      if (cliente.saldo > 0) {
        saldoPositivo += cliente.saldo;
        clientesConSaldoPositivo++;
      } else if (cliente.saldo < 0) {
        saldoNegativo += Math.abs(cliente.saldo);
        clientesConSaldoNegativo++;
      }
    });

    // Clientes más activos
    const actividadPorCliente = {};
    movimientos.forEach(mov => {
      if (!actividadPorCliente[mov.cliente]) {
        actividadPorCliente[mov.cliente] = 0;
      }
      actividadPorCliente[mov.cliente]++;
    });

    const clientesMasActivos = Object.entries(actividadPorCliente)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));

    // Evolución diaria
    const evolucionDiaria = {};
    movimientos.forEach(mov => {
      const fecha = new Date(mov.fecha);
      const fechaKey = fecha.toISOString().split('T')[0];

      if (!evolucionDiaria[fechaKey]) {
        evolucionDiaria[fechaKey] = { debe: 0, haber: 0 };
      }

      if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        evolucionDiaria[fechaKey].debe += mov.monto;
      } else {
        evolucionDiaria[fechaKey].haber += mov.monto;
      }
    });

    return {
      success: true,
      estadisticas: {
        totalClientes: clientes.length,
        clientesActivos: clientesConMovimientos.size,
        totalMovimientos: totalMovimientos,
        totalDebe: totalDebe,
        totalHaber: totalHaber,
        balanceNeto: totalDebe - totalHaber,
        saldoPositivo: saldoPositivo,
        saldoNegativo: saldoNegativo,
        clientesConSaldoPositivo: clientesConSaldoPositivo,
        clientesConSaldoNegativo: clientesConSaldoNegativo,
        clientesMasActivos: clientesMasActivos,
        evolucionDiaria: evolucionDiaria
      }
    };
  } catch (error) {
    Logger.log('Error en obtenerEstadisticas: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 4: Verifica si la API Key de Claude está presente
 * @returns {Object} {presente: boolean}
 */
function verificarApiKeyPresente() {
  try {
    const apiKey = ClaudeService.getApiKey();

    return {
      success: true,
      presente: !!apiKey,
      configurada: !!apiKey
    };
  } catch (error) {
    Logger.log('Error en verificarApiKeyPresente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 4.5: Obtiene resumen de movimientos por cliente para impresión diaria
 * @returns {Object} {success: boolean, clientesResumen: Array}
 */
function obtenerResumenMovimientosPorCliente() {
  try {
    const todosClientes = ClientesRepository.obtenerTodos();
    const hoja = MovimientosRepository.getHoja();
    const datos = hoja.getDataRange().getValues();
    
    // Crear mapa para almacenar resumen por cliente
    const resumenPorCliente = {};
    
    // Inicializar todos los clientes con valores en 0
    todosClientes.forEach(cliente => {
      const nombreNorm = normalizarString(cliente.nombre);
      resumenPorCliente[nombreNorm] = {
        nombre: cliente.nombre,
        totalDebe: 0,
        totalHaber: 0,
        saldoFinal: cliente.saldo || 0
      };
    });
    
    // Procesar todos los movimientos (saltar encabezado)
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const clienteNorm = normalizarString(fila[CONFIG.COLS_MOVS.CLIENTE]);
      const tipo = fila[CONFIG.COLS_MOVS.TIPO];
      const monto = fila[CONFIG.COLS_MOVS.MONTO];
      
      if (resumenPorCliente[clienteNorm]) {
        if (tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
          resumenPorCliente[clienteNorm].totalDebe += monto;
        } else if (tipo === CONFIG.TIPOS_MOVIMIENTO.HABER) {
          resumenPorCliente[clienteNorm].totalHaber += monto;
        }
      }
    }
    
    // Convertir mapa a array
    const clientesResumen = Object.values(resumenPorCliente);
    
    return {
      success: true,
      clientesResumen: clientesResumen
    };
  } catch (error) {
    Logger.log('Error en obtenerResumenMovimientosPorCliente: ' + error.message);
    return {
      success: false,
      error: error.message,
      clientesResumen: []
    };
  }
}

/**
 * API 5: Fuzzy matching para buscar clientes con sugerencias
 * Optimizado para early termination
 * @param {string} nombre - Nombre a buscar
 * @returns {Object} {sugerencias: Array}
 */
function rematchearNombreConSugerencias(nombre) {
  try {
    const nombreBusqueda = normalizarString(nombre);

    if (!nombreBusqueda) {
      return {
        success: true,
        sugerencias: []
      };
    }

    const clientes = ClientesRepository.obtenerTodos();
    const sugerencias = [];

    // Calcular score para cada cliente con early termination
    for (let i = 0; i < clientes.length; i++) {
      const cliente = clientes[i];
      const nombreCliente = normalizarString(cliente.nombre);
      const score = calcularScoreFuzzy(nombreBusqueda, nombreCliente);

      if (score >= CONFIG.FUZZY.MIN_SCORE) {
        sugerencias.push({
          nombre: cliente.nombre,
          score: score,
          saldo: cliente.saldo,
          tel: cliente.tel
        });

        // Early termination: si ya tenemos un match exacto, no seguir buscando
        if (score === CONFIG.FUZZY.PESO_EXACTO) {
          break;
        }
      }
    }

    // Ordenar por score descendente
    sugerencias.sort((a, b) => b.score - a.score);

    // Limitar a MAX_SUGERENCIAS
    const sugerenciasLimitadas = sugerencias.slice(0, CONFIG.FUZZY.MAX_SUGERENCIAS);

    return {
      success: true,
      sugerencias: sugerenciasLimitadas,
      total: sugerenciasLimitadas.length
    };
  } catch (error) {
    log('Error en rematchearNombreConSugerencias: ' + error.message, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 6: Guarda un movimiento individual desde el HTML
 * @param {Object} movimientoData - Datos del movimiento
 * @returns {Object} Movimiento guardado
 */
function guardarMovimientoDesdeHTML(movimientoData) {
  log('📥 guardarMovimientoDesdeHTML - Inicio', 'debug');

  try {
    // VALIDACIÓN OBLIGATORIA DE DATOS usando función de validación
    const validacion = validarMovimiento(movimientoData);
    
    if (!validacion.valid) {
      throw new Error('Datos inválidos: ' + validacion.errors.join(', '));
    }

    // Validar fecha específicamente
    const fechaValidada = validarFecha(movimientoData.fecha);
    if (!fechaValidada) {
      throw new Error('Fecha inválida: no se pudo convertir a fecha válida');
    }

    // Normalizar cliente
    movimientoData.cliente = normalizarString(movimientoData.cliente);

    const movimiento = MovimientosRepository.registrar(movimientoData);

    log('✅ Movimiento guardado exitosamente - ID: ' + (movimiento.id || 'N/A'), 'debug');

    return {
      success: true,
      movimiento: movimiento
    };
  } catch (error) {
    log('❌ Error en guardarMovimientoDesdeHTML: ' + error.message, 'error');
    log('Stack trace: ' + error.stack, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 7: Guarda lote de movimientos desde Visual Reasoning
 * @param {Object} payload - {movimientos: Array}
 * @returns {Object} Resultado con exitosos y errores
 */
function guardarMovimientosDesdeVR(payload) {
  try {
    if (!payload.movimientos || !Array.isArray(payload.movimientos)) {
      throw new Error('Payload inválido: se esperaba {movimientos: Array}');
    }

    const resultado = MovimientosRepository.registrarLote(payload.movimientos);

    return {
      success: true,
      exitosos: resultado.exitosos,
      errores: resultado.errores,
      totalExitosos: resultado.exitosos.length,
      totalErrores: resultado.errores.length
    };
  } catch (error) {
    Logger.log('Error en guardarMovimientosDesdeVR: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 8a: Actualizar movimiento existente
 */
function actualizarMovimiento(idMovimiento, nuevoMonto, nuevaObs) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // Timeout de 30 segundos
    
    const repo = MovimientosRepository;
    const hoja = repo.getHoja();
    const datos = hoja.getDataRange().getValues();

    // Find row by ID
    let rowIndex = -1;
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG.COLS_MOVS.ID] == idMovimiento) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Movimiento no encontrado');
    }

    const movimientoRow = datos[rowIndex - 1];
    const clienteNombre = movimientoRow[CONFIG.COLS_MOVS.CLIENTE];
    const tipoMov = movimientoRow[CONFIG.COLS_MOVS.TIPO];
    const montoAnterior = Number(movimientoRow[CONFIG.COLS_MOVS.MONTO]);
    const saldoPostAnterior = Number(movimientoRow[CONFIG.COLS_MOVS.SALDO_POST]);

    // Calculate balance difference and new saldoPost
    const montoDiff = Number(nuevoMonto) - montoAnterior;
    const nuevoSaldoPost = saldoPostAnterior + (tipoMov === 'DEBE' ? montoDiff : -montoDiff);

    // Update monto, obs, and saldoPost
    hoja.getRange(rowIndex, CONFIG.COLS_MOVS.MONTO + 1).setValue(nuevoMonto);
    hoja.getRange(rowIndex, CONFIG.COLS_MOVS.OBS + 1).setValue(nuevaObs);
    hoja.getRange(rowIndex, CONFIG.COLS_MOVS.SALDO_POST + 1).setValue(nuevoSaldoPost);

    // Recalculate client balance
    const clientesRepo = ClientesRepository;
    const clienteData = clientesRepo.buscarPorNombre(clienteNombre);
    const nuevoSaldo = tipoMov === 'DEBE' ?
      (clienteData.saldo + montoDiff) :
      (clienteData.saldo - montoDiff);

    ClientesRepository.actualizarSaldoDirecto(clienteNombre, nuevoSaldo);

    log('✅ Movimiento ' + idMovimiento + ' actualizado', 'debug');

    return {
      success: true,
      movimiento: {
        id: idMovimiento,
        monto: nuevoMonto,
        obs: nuevaObs,
        nuevoSaldo: nuevoSaldo
      }
    };
  } catch (error) {
    log('❌ ERROR en actualizarMovimiento: ' + error.message, 'error');
    return {
      success: false,
      error: error.message
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * API 8b: Eliminar movimiento existente
 */
function eliminarMovimiento(idMovimiento) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); // Timeout de 30 segundos
    
    const repo = MovimientosRepository;
    const hoja = repo.getHoja();
    const datos = hoja.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG.COLS_MOVS.ID] == idMovimiento) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Movimiento no encontrado');
    }

    const movimientoRow = datos[rowIndex - 1];
    const clienteNombre = movimientoRow[CONFIG.COLS_MOVS.CLIENTE];
    const tipoMov = movimientoRow[CONFIG.COLS_MOVS.TIPO];
    const monto = Number(movimientoRow[CONFIG.COLS_MOVS.MONTO]);

    // Delete the row
    hoja.deleteRow(rowIndex);

    // Recalculate client balance (reverse the movement)
    const clientesRepo = ClientesRepository;
    const clienteData = clientesRepo.buscarPorNombre(clienteNombre);
    const nuevoSaldo = tipoMov === 'DEBE' ?
      (clienteData.saldo - monto) :
      (clienteData.saldo + monto);

    ClientesRepository.actualizarSaldoDirecto(clienteNombre, nuevoSaldo);

    log('✅ Movimiento ' + idMovimiento + ' eliminado', 'debug');

    return {
      success: true,
      mensaje: 'Movimiento eliminado',
      nuevoSaldo: nuevoSaldo
    };
  } catch (error) {
    log('❌ ERROR en eliminarMovimiento: ' + error.message, 'error');
    return {
      success: false,
      error: error.message
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Recalcula todos los saldos de clientes basándose en los movimientos
 * Optimizado con operaciones batch para mejor rendimiento
 * Útil cuando hay inconsistencias en los datos
 */
function recalcularTodosSaldos() {
  try {
    const clientesRepo = ClientesRepository;
    const movimientosRepo = MovimientosRepository;
    const todosClientes = clientesRepo.obtenerTodos();

    log('🔄 Iniciando recálculo de saldos para ' + todosClientes.length + ' clientes', 'info');

    let clientesActualizados = 0;
    const actualizaciones = []; // Array para batch updates

    for (const cliente of todosClientes) {
      const movimientos = movimientosRepo.obtenerPorCliente(cliente.nombre);
      let saldoCalculado = 0;

      for (const mov of movimientos) {
        const monto = Number(mov.monto) || 0;
        if (mov.tipo === 'DEBE') {
          saldoCalculado += monto;
        } else if (mov.tipo === 'HABER') {
          saldoCalculado -= monto;
        }
      }

      if (saldoCalculado !== cliente.saldo) {
        log(`⚠️ Corrigiendo ${cliente.nombre}: ${cliente.saldo} → ${saldoCalculado}`, 'debug');
        actualizaciones.push({
          nombre: cliente.nombre,
          saldo: saldoCalculado
        });
        clientesActualizados++;
      }
    }

    // Batch update all at once for better performance
    if (actualizaciones.length > 0) {
      const hoja = clientesRepo.getHoja();
      const datos = hoja.getDataRange().getValues();
      
      // Build a map for quick lookup
      const actualizacionesMap = new Map(
        actualizaciones.map(a => [normalizarString(a.nombre), a.saldo])
      );
      
      // Collect all updates to apply in batch
      const rangesToUpdate = [];
      
      for (let i = 1; i < datos.length; i++) {
        const nombreFila = normalizarString(datos[i][CONFIG.COLS_CLIENTES.NOMBRE]);
        if (actualizacionesMap.has(nombreFila)) {
          const nuevoSaldo = actualizacionesMap.get(nombreFila);
          const fila = i + 1; // 1-indexed
          rangesToUpdate.push({
            range: hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1),
            value: nuevoSaldo
          });
        }
      }
      
      // Apply all updates in batch
      rangesToUpdate.forEach(update => {
        update.range.setValue(update.value);
      });
    }

    log('✅ Recálculo completado: ' + clientesActualizados + ' clientes corregidos', 'info');
    return {
      success: true,
      mensaje: clientesActualizados + ' clientes fueron recalculados',
      clientesActualizados: clientesActualizados,
      totalClientes: todosClientes.length
    };

  } catch (error) {
    log('❌ Error en recalcularTodosSaldos: ' + error.message, 'error');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 8: Crea un nuevo cliente completo
 * @param {Object} clienteData - Datos del cliente
 * @returns {Object} Cliente creado
 */
function crearNuevoClienteCompleto(clienteData) {
  Logger.log('📥 crearNuevoClienteCompleto - Inicio: ' + JSON.stringify(clienteData));

  try {
    // VALIDACIÓN OBLIGATORIA DE DATOS
    if (!clienteData || typeof clienteData !== 'object') {
      throw new Error('Datos inválidos: se esperaba un objeto');
    }

    if (!clienteData.nombre || typeof clienteData.nombre !== 'string' || clienteData.nombre.trim() === '') {
      throw new Error('Nombre inválido: debe ser un texto no vacío');
    }

    if (clienteData.limite !== undefined && (isNaN(clienteData.limite) || clienteData.limite < 0)) {
      throw new Error('Límite de crédito inválido: debe ser un número no negativo');
    }

    const cliente = ClientesRepository.crear(clienteData);

    Logger.log('✅ Cliente creado exitosamente: ' + clienteData.nombre);

    return {
      success: true,
      cliente: cliente
    };
  } catch (error) {
    Logger.log('❌ Error en crearNuevoClienteCompleto: ' + error.message);
    Logger.log('Stack trace: ' + error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 9: Actualiza datos de un cliente
 * @param {string} nombreCliente - Nombre del cliente
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Cliente actualizado
 */
function actualizarDatosCliente(nombreCliente, datos) {
  Logger.log('📥 actualizarDatosCliente - Cliente: ' + nombreCliente + ', Datos: ' + JSON.stringify(datos));

  try {
    // VALIDACIÓN OBLIGATORIA DE DATOS
    if (!nombreCliente || typeof nombreCliente !== 'string' || nombreCliente.trim() === '') {
      throw new Error('Nombre de cliente inválido: debe ser un texto no vacío');
    }

    if (!datos || typeof datos !== 'object') {
      throw new Error('Datos inválidos: se esperaba un objeto');
    }

    if (datos.limite !== undefined && (isNaN(datos.limite) || datos.limite < 0)) {
      throw new Error('Límite de crédito inválido: debe ser un número no negativo');
    }

    const cliente = ClientesRepository.actualizar(nombreCliente, datos);

    Logger.log('✅ Cliente actualizado exitosamente: ' + nombreCliente);

    return {
      success: true,
      cliente: cliente
    };
  } catch (error) {
    Logger.log('❌ Error en actualizarDatosCliente: ' + error.message);
    Logger.log('Stack trace: ' + error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 10: Elimina un cliente completo (solo si no tiene movimientos)
 * @param {string} nombreCliente - Nombre del cliente
 * @returns {Object} Resultado de eliminación
 */
function eliminarClienteCompleto(nombreCliente) {
  try {
    ClientesRepository.eliminar(nombreCliente);

    return {
      success: true,
      mensaje: `Cliente "${nombreCliente}" eliminado correctamente`
    };
  } catch (error) {
    Logger.log('Error en eliminarClienteCompleto: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 11: Guarda la API Key de Claude en PropertiesService
 * @param {string} apiKey - API Key de Claude
 * @returns {Object} Resultado
 */
function guardarApiKey(apiKey) {
  try {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('API Key inválida');
    }

    const props = PropertiesService.getUserProperties();
    props.setProperty(CONFIG.PROPS.API_KEY, apiKey.trim());

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
 * API 12: Analiza imagen con Claude Vision (Visual Reasoning)
 * @param {string} imageBase64 - Imagen en Base64
 * @returns {Object} Movimientos extraídos
 */
/**
 * FIX: Recibe token en lugar de Base64 directamente
 * El Base64 se guarda en el frontend en sessionStorage y luego en backend CacheService
 * Esto evita el límite de serialización silencioso de google.script.run
 */
/**
 * API 12: Analiza imagen con Claude Vision - Versión Simplificada
 * Recibe directamente el Base64 del frontend
 * @param {string} imageBase64 - Imagen en Base64
 * @returns {Object} Movimientos extraídos
 */
function analizarImagenVisualReasoningSimple(imageBase64) {
  try {
    Logger.log('📞 LLAMADA: analizarImagenVisualReasoningSimple');
    Logger.log('📊 Base64 length: ' + (imageBase64 ? imageBase64.length : 0) + ' caracteres');

    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Base64 inválido o muy pequeño');
    }

    Logger.log('🚀 Llamando ClaudeService.analizarImagen()...');
    const resultado = ClaudeService.analizarImagen(imageBase64);

    Logger.log('✅ Análisis completado');
    Logger.log('📊 Movimientos extraídos: ' + resultado.totalExtraidos);

    return {
      success: true,
      movimientos: resultado.movimientos,
      totalExtraidos: resultado.totalExtraidos
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Guarda Base64 en CacheService para evitar límite de serialización
 */
function guardarImagenTemporalVR(imageBase64) {
  try {
    Logger.log('📞 LLAMADA: guardarImagenTemporalVR');
    Logger.log('📊 Base64 length: ' + (imageBase64 ? imageBase64.length : 0) + ' caracteres');

    if (!imageBase64 || imageBase64.length < 100) {
      throw new Error('Base64 inválido o muy pequeño');
    }

    const token = Utilities.getUuid();
    Logger.log('✓ Token generado: ' + token);

    const cache = CacheService.getUserCache();
    cache.put('vr_image_' + token, imageBase64, 900);

    Logger.log('✅ Base64 guardado en cache con token: ' + token);

    return {
      success: true,
      token: token,
      dataSize: imageBase64.length
    };
  } catch (error) {
    Logger.log('❌ ERROR en guardarImagenTemporalVR: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Analiza imagen usando token del cache (CacheService workaround)
 */
function analizarImagenConToken(vrDataToken) {
  try {
    Logger.log('📞 LLAMADA: analizarImagenConToken');
    Logger.log('📊 Token recibido: ' + vrDataToken);

    const cache = CacheService.getUserCache();
    const imageBase64 = cache.get('vr_image_' + vrDataToken);

    Logger.log('✓ Base64 recuperado, longitud: ' + (imageBase64 ? imageBase64.length : 0));

    if (!imageBase64 || imageBase64.length < 100) {
      const errorMsg = !imageBase64 ? 'No se encontró Base64 en cache' : 'Base64 muy pequeño';
      throw new Error('Image Base64 inválida: ' + errorMsg);
    }

    Logger.log('🚀 Llamando ClaudeService.analizarImagen()...');
    const resultado = ClaudeService.analizarImagen(imageBase64);

    Logger.log('✅ Análisis completado');
    cache.remove('vr_image_' + vrDataToken);

    return {
      success: true,
      movimientos: resultado.movimientos,
      totalExtraidos: resultado.totalExtraidos
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 13: Crea múltiples clientes con saldo inicial
 * @param {Object} payload - {clientes: Array}
 * @returns {Object} Resultado con exitosos y errores
 */
function crearClientesMasivos(payload) {
  try {
    if (!payload.clientes || !Array.isArray(payload.clientes)) {
      throw new Error('Payload inválido: se esperaba {clientes: Array}');
    }

    const resultados = {
      exitosos: 0,
      errores: 0,
      detalleExitosos: [],
      detalleErrores: []
    };

    const lock = LockService.getScriptLock();

    payload.clientes.forEach((clienteData, index) => {
      try {
        lock.waitLock(30000);

        // 1. Crear cliente con saldo 0
        const cliente = ClientesRepository.crear({
          nombre: clienteData.nombre,
          tel: clienteData.tel,
          email: clienteData.email,
          limite: clienteData.limite || 100000,
          obs: clienteData.obs
        });

        // 2. Si tiene saldo inicial ≠ 0, crear movimiento de ajuste
        if (clienteData.saldoInicial && clienteData.saldoInicial !== 0) {
          const tipoMovimiento = clienteData.saldoInicial > 0
            ? CONFIG.TIPOS_MOVIMIENTO.DEBE
            : CONFIG.TIPOS_MOVIMIENTO.HABER;

          const montoAbsoluto = Math.abs(clienteData.saldoInicial);

          MovimientosRepository.registrar({
            cliente: clienteData.nombre,
            tipo: tipoMovimiento,
            monto: montoAbsoluto,
            obs: `SALDO INICIAL (Carga Masiva)`
          });

          resultados.detalleExitosos.push({
            nombre: clienteData.nombre,
            saldoInicial: clienteData.saldoInicial,
            movimientoCreado: true
          });
        } else {
          resultados.detalleExitosos.push({
            nombre: clienteData.nombre,
            saldoInicial: 0,
            movimientoCreado: false
          });
        }

        resultados.exitosos++;
        lock.releaseLock();

      } catch (error) {
        lock.releaseLock();
        resultados.errores++;
        resultados.detalleErrores.push({
          indice: index,
          nombre: clienteData.nombre,
          error: error.message
        });
      }
    });

    return {
      success: true,
      exitosos: resultados.exitosos,
      errores: resultados.errores,
      detalleExitosos: resultados.detalleExitosos,
      detalleErrores: resultados.detalleErrores
    };

  } catch (error) {
    Logger.log('Error en crearClientesMasivos: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 14: Registra una recaudación de efectivo
 * @param {Object} recaudacionData - {cliente, monto, forma_pago, obs}
 * @returns {Object} {success, recaudacion} o {success: false, error}
 */
function guardarRecaudacion(recaudacionData) {
  Logger.log('📥 guardarRecaudacion - Inicio: ' + JSON.stringify(recaudacionData));

  try {
    if (!recaudacionData || typeof recaudacionData !== 'object') {
      throw new Error('Datos inválidos');
    }

    const recaudacion = RecaudacionRepository.registrar(recaudacionData);

    Logger.log('✅ Recaudación guardada - ID: ' + recaudacion.id);

    return {
      success: true,
      recaudacion: recaudacion
    };
  } catch (error) {
    Logger.log('❌ Error en guardarRecaudacion: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 15: Obtiene recaudaciones por cliente
 * @param {string} nombreCliente - Nombre del cliente
 * @returns {Object} {success, recaudaciones: Array}
 */
function obtenerRecaudacionesPorCliente(nombreCliente) {
  try {
    const recaudaciones = RecaudacionRepository.obtenerPorCliente(nombreCliente);

    return {
      success: true,
      recaudaciones: recaudaciones
    };
  } catch (error) {
    Logger.log('Error en obtenerRecaudacionesPorCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * API 16: Obtiene totales diarios de recaudación
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @returns {Object} {success, totales}
 */
function obtenerTotalesRecaudacionDia(fecha) {
  try {
    const totales = RecaudacionRepository.obtenerTotalesDiarios(new Date(fecha));

    return {
      success: true,
      totales: totales
    };
  } catch (error) {
    Logger.log('Error en obtenerTotalesRecaudacionDia: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// SISTEMA DE ARQUEO DE CAJA - Backend Functions
// ============================================================================

/**
 * Inicializa las hojas necesarias para el sistema de Arqueo de Caja
 * Crea "Config" y "Historial_Caja" si no existen
 */
function setupCashSystemSheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Crear hoja Config si no existe
    if (!ss.getSheetByName('Config')) {
      const configSheet = ss.insertSheet('Config');
      configSheet.getRange('A1').setValue('Proveedores');
      configSheet.getRange(1, 1, 1, 1).setFontWeight('bold').setBackground('#efefef');
    }

    // Crear hoja Historial_Caja si no existe
    if (!ss.getSheetByName('Historial_Caja')) {
      const historySheet = ss.insertSheet('Historial_Caja');
      historySheet.appendRow([
        'Fecha', 'Hora', 'Usuario',
        'Total Efectivo', 'Pagos Prov.', 'Extras', 'Aportes',
        'Recaudación Total',
        'Detalles (JSON)'
      ]);
      historySheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#efefef');
      historySheet.setFrozenRows(1);
    }

    return { success: true, message: 'Hojas inicializadas correctamente' };
  } catch (error) {
    Logger.log('Error en setupCashSystemSheets: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Inicializa el historial de Arqueo de Caja con datos históricos
 * Agrega 4 registros de cierre de caja desde 19-23 de enero 2026
 * @returns {Object} {success: true, recordsAdded: N}
 */
function initializeHistoricalCashData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Historial_Caja');

    if (!sheet) {
      return { success: false, error: 'Historial_Caja sheet not found' };
    }

    // Verificar si ya hay datos
    if (sheet.getLastRow() > 1) {
      Logger.log('✅ Historial_Caja ya contiene datos, skipping initialization');
      return { success: true, recordsAdded: 0 };
    }

    // Datos históricos de 4 cierres de caja
    const historicalRecords = [
      {
        fecha: '2026-01-19',
        hora: '17:30',
        usuario: 'adminuser',
        cash: 185200,
        providers: 45000,
        extras: 500,
        injections: 2000,
        balance: 141700,
        details: {
          bills: { 20000: 5, 10000: 8, 2000: 2, 1000: 3, 500: 4, 200: 1, 100: 0, 50: 2, 20: 1, 10: 0 },
          providers: [{ name: 'Proveedor A', amount: 25000 }, { name: 'Proveedor B', amount: 20000 }],
          injections: [{ desc: 'Aporte inicial', amount: 2000 }],
          extras: [{ desc: 'Combustible', amount: 500 }]
        }
      },
      {
        fecha: '2026-01-20',
        hora: '18:15',
        usuario: 'adminuser',
        cash: 192500,
        providers: 48500,
        extras: 300,
        injections: 1500,
        balance: 145200,
        details: {
          bills: { 20000: 6, 10000: 9, 2000: 1, 1000: 2, 500: 5, 200: 0, 100: 1, 50: 1, 20: 0, 10: 0 },
          providers: [{ name: 'Proveedor A', amount: 28000 }, { name: 'Proveedor B', amount: 20500 }],
          injections: [{ desc: 'Aporte', amount: 1500 }],
          extras: [{ desc: 'Mantenimiento', amount: 300 }]
        }
      },
      {
        fecha: '2026-01-22',
        hora: '17:45',
        usuario: 'adminuser',
        cash: 188750,
        providers: 46200,
        extras: 400,
        injections: 2200,
        balance: 144150,
        details: {
          bills: { 20000: 5, 10000: 8, 2000: 3, 1000: 3, 500: 5, 200: 0, 100: 0, 50: 3, 20: 1, 10: 0 },
          providers: [{ name: 'Proveedor A', amount: 26200 }, { name: 'Proveedor B', amount: 20000 }],
          injections: [{ desc: 'Aporte', amount: 2200 }],
          extras: [{ desc: 'Servicios', amount: 400 }]
        }
      },
      {
        fecha: '2026-01-23',
        hora: '18:00',
        usuario: 'adminuser',
        cash: 195000,
        providers: 50000,
        extras: 600,
        injections: 1800,
        balance: 143400,
        details: {
          bills: { 20000: 6, 10000: 9, 2000: 2, 1000: 2, 500: 4, 200: 1, 100: 1, 50: 2, 20: 0, 10: 0 },
          providers: [{ name: 'Proveedor A', amount: 30000 }, { name: 'Proveedor B', amount: 20000 }],
          injections: [{ desc: 'Aporte', amount: 1800 }],
          extras: [{ desc: 'Otros', amount: 600 }]
        }
      }
    ];

    // Agregar los registros históricos
    let recordsAdded = 0;
    for (const record of historicalRecords) {
      sheet.appendRow([
        record.fecha,
        record.hora,
        record.usuario,
        record.cash,
        record.providers,
        record.extras,
        record.injections,
        record.balance,
        JSON.stringify(record.details)
      ]);
      recordsAdded++;
    }

    Logger.log(`✅ Historial_Caja inicializado con ${recordsAdded} registros históricos`);
    return { success: true, recordsAdded: recordsAdded };

  } catch (error) {
    Logger.log('Error en initializeHistoricalCashData: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene la configuración del sistema de Arqueo (lista de proveedores)
 * @returns {Object} {providers: [...]}
 */
function getCashSystemConfig() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('Config');

    if (!configSheet) {
      return { providers: ['Proveedor 1', 'Proveedor 2', 'Proveedor 3'] };
    }

    const lastRow = configSheet.getLastRow();
    const providers = [];

    if (lastRow > 1) {  // Cambiar a > 1 para skipear header
      const data = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const filtered = data.flat().filter(String);
      if (filtered.length > 0) {
        return { providers: filtered };
      }
    }

    // Si no hay datos, retornar proveedores predeterminados
    return { providers: ['Proveedor 1', 'Proveedor 2', 'Proveedor 3'] };
  } catch (error) {
    Logger.log('Error en getCashSystemConfig: ' + error.message);
    return { providers: ['Proveedor 1', 'Proveedor 2', 'Proveedor 3'] };
  }
}

/**
 * Obtiene el historial de cierres de caja de manera inteligente
 * Busca el JSON en cualquier columna y lo parsea correctamente
 * @returns {Array} Array de entradas históricas
 */
function getCashHistoryEntries() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Historial_Caja');

    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const lastCol = sheet.getLastColumn();
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const entries = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      let jsonStr = "";
      let balance = 0;

      // Buscar la columna que tiene el JSON (empieza con "{")
      for (let j = row.length - 1; j >= 0; j--) {
        const cell = row[j];
        if (typeof cell === 'string' && cell.trim().startsWith('{')) {
          jsonStr = cell;
          // Intentar obtener el balance de la columna anterior
          if (j > 0) balance = row[j - 1];
          break;
        }
      }

      // Si no encontramos JSON, saltamos esta fila
      if (!jsonStr) continue;

      // Formatear fecha
      let dateStr = "";
      try {
        const dateObj = row[0];
        if (dateObj instanceof Date) {
          dateStr = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
          dateStr = String(dateObj);
        }
      } catch (e) {
        dateStr = "Fecha desc.";
      }

      const timeStr = row[1] ? String(row[1]) : "";

      entries.push({
        date: dateStr,
        time: timeStr,
        balance: balance,
        jsonData: jsonStr
      });
    }

    // Devolver invertido para ver lo más reciente arriba
    return entries.reverse();
  } catch (error) {
    Logger.log('Error en getCashHistoryEntries: ' + error.message);
    return [];
  }
}

/**
 * Guarda los datos de una sesión de arqueo de caja
 * @param {Object} data - {details: {...}, totals: {...}}
 * @returns {Object} {success, message}
 */
function saveCashSessionData(data) {
  try {
    // FIX: Validar que hay efectivo antes de guardar
    if (!data || !data.totals || data.totals.cash <= 0) {
      throw new Error('El total de efectivo debe ser mayor a 0. Por favor, ingrese montos en las denominaciones.');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let historySheet = ss.getSheetByName('Historial_Caja');

    // Si la hoja no existe, crearla
    if (!historySheet) {
      historySheet = ss.insertSheet('Historial_Caja');
      historySheet.appendRow([
        'Fecha', 'Hora', 'Usuario',
        'Total Efectivo', 'Pagos Prov.', 'Extras', 'Aportes',
        'Recaudación Total',
        'Detalles (JSON)'
      ]);
      historySheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#efefef');
      historySheet.setFrozenRows(1);
    }

    const now = new Date();
    let user = "Sistema";
    try {
      user = Session.getActiveUser().getEmail();
    } catch (e) {
      user = "Sistema";
    }

    const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");
    const jsonDetails = JSON.stringify(data);

    historySheet.appendRow([
      now,
      timeStr,
      user,
      data.totals.cash || 0,
      data.totals.providers || 0,
      data.totals.extras || 0,
      data.totals.injections || 0,
      data.totals.balance || 0,
      jsonDetails
    ]);

    return { success: true, message: 'Cierre guardado correctamente.' };
  } catch (error) {
    Logger.log('Error en saveCashSessionData: ' + error.message);
    return { success: false, error: error.message };
  }
}


// ============================================================================
// FIN DEL ARCHIVO
// ============================================================================
