/**
 * ============================================================================
 * CORE OPTIMIZATIONS - SISTEMA SOL & VERDE
 * ============================================================================
 * Capa de optimización de rendimiento y seguridad
 * - Caching de referencias a nivel de ejecución
 * - Validadores de seguridad
 * - Operaciones batch
 * ============================================================================
 */

// ============================================================================
// CACHE DE REFERENCIAS (Execution-level caching)
// ============================================================================

/**
 * Cache global de referencias a hojas para toda la ejecución
 * Se resetea automáticamente al finalizar cada request en GAS
 */
var _SheetCache = {
  _cache: {},
  
  /**
   * Obtiene una hoja desde cache o la crea si no existe
   * @param {string} nombre - Nombre de la hoja
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  get: function(nombre) {
    if (!nombre) return null;
    
    // Intentar obtener desde cache
    if (this._cache[nombre]) {
      return this._cache[nombre];
    }
    
    // Si no está en cache, obtener y guardar
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(nombre);
    
    // Crear hoja si no existe
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      Logger.log('[SheetCache] Hoja creada: ' + nombre);
    }
    
    // Guardar en cache para esta ejecución
    this._cache[nombre] = hoja;
    return hoja;
  },
  
  /**
   * Invalida el cache (útil después de operaciones masivas)
   */
  invalidar: function() {
    this._cache = {};
  },
  
  /**
   * Invalida una hoja específica del cache
   * @param {string} nombre - Nombre de la hoja
   */
  invalidarHoja: function(nombre) {
    if (nombre) {
      delete this._cache[nombre];
    }
  }
};

// ============================================================================
// VALIDADORES DE SEGURIDAD (Error Safety)
// ============================================================================

/**
 * Valida que un valor sea un número válido (no NaN, no Infinity)
 * @param {*} valor - Valor a validar
 * @returns {boolean}
 */
function esNumeroValido(valor) {
  return typeof valor === 'number' && isFinite(valor) && !isNaN(valor);
}

/**
 * Valida y normaliza un monto (previene NaN, negativos, etc.)
 * @param {*} monto - Monto a validar
 * @param {number} minimo - Valor mínimo permitido (default: 0)
 * @returns {{valido: boolean, valor: number, error: string|null}}
 */
function validarMonto(monto, minimo) {
  minimo = minimo !== undefined ? minimo : 0;
  
  if (monto === null || monto === undefined) {
    return { valido: false, valor: 0, error: 'Monto no proporcionado' };
  }
  
  // Convertir string a número (formato argentino)
  let valorNumerico;
  if (typeof monto === 'string') {
    valorNumerico = parsearMontoARG(monto);
  } else if (typeof monto === 'number') {
    valorNumerico = monto;
  } else {
    return { valido: false, valor: 0, error: 'Tipo de monto inválido' };
  }
  
  // Validar que sea número válido
  if (!esNumeroValido(valorNumerico)) {
    return { valido: false, valor: 0, error: 'Monto inválido (NaN o Infinity)' };
  }
  
  // Validar rango
  if (valorNumerico < minimo) {
    return { valido: false, valor: 0, error: 'Monto menor al mínimo permitido (' + minimo + ')' };
  }
  
  return { valido: true, valor: valorNumerico, error: null };
}

/**
 * Valida que un nombre de cliente no esté vacío o indefinido
 * @param {*} nombre - Nombre a validar
 * @returns {{valido: boolean, valor: string, error: string|null}}
 */
function validarNombreCliente(nombre) {
  if (!nombre || nombre === null || nombre === undefined) {
    return { valido: false, valor: '', error: 'Nombre de cliente no proporcionado' };
  }
  
  if (typeof nombre !== 'string') {
    return { valido: false, valor: '', error: 'Nombre debe ser texto' };
  }
  
  const nombreNorm = normalizarString(nombre);
  
  if (nombreNorm.length < 3) {
    return { valido: false, valor: '', error: 'Nombre demasiado corto (mínimo 3 caracteres)' };
  }
  
  if (nombreNorm.length > 100) {
    return { valido: false, valor: '', error: 'Nombre demasiado largo (máximo 100 caracteres)' };
  }
  
  return { valido: true, valor: nombreNorm, error: null };
}

/**
 * Assert: Lanza error si la condición es falsa (para validaciones internas)
 * @param {boolean} condicion - Condición a verificar
 * @param {string} mensaje - Mensaje de error
 * @throws {Error} Si la condición es falsa
 */
function assert(condicion, mensaje) {
  if (!condicion) {
    throw new Error('[ASSERT] ' + (mensaje || 'Condición no cumplida'));
  }
}

/**
 * Assert silencioso: Loggea pero no lanza error
 * @param {boolean} condicion - Condición a verificar
 * @param {string} mensaje - Mensaje de advertencia
 */
function assertSilent(condicion, mensaje) {
  if (!condicion) {
    Logger.log('[ASSERT WARNING] ' + mensaje);
  }
}

// ============================================================================
// OPERACIONES BATCH (Bulk operations)
// ============================================================================

/**
 * Lee múltiples rangos de una hoja en una sola operación
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Hoja a leer
 * @param {Array<Array<number>>} rangos - Array de [fila, columna, filas, columnas]
 * @returns {Array} Resultados de cada rango
 */
function leerRangosBatch(hoja, rangos) {
  if (!hoja || !rangos || rangos.length === 0) return [];
  
  const resultados = [];
  
  for (var i = 0; i < rangos.length; i++) {
    var r = rangos[i];
    try {
      var datos = hoja.getRange(r[0], r[1], r[2], r[3]).getValues();
      resultados.push(datos);
    } catch (e) {
      Logger.log('[Batch Read Error] Rango ' + i + ': ' + e.message);
      resultados.push([]);
    }
  }
  
  return resultados;
}

/**
 * Escribe múltiples valores en una hoja eficientemente
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Hoja a escribir
 * @param {Array<Object>} escrituras - Array de {fila, columna, valor}
 * @returns {number} Cantidad de escrituras exitosas
 */
function escribirBatch(hoja, escrituras) {
  if (!hoja || !escrituras || escrituras.length === 0) return 0;
  
  var exitosas = 0;
  
  for (var i = 0; i < escrituras.length; i++) {
    var e = escrituras[i];
    try {
      hoja.getRange(e.fila, e.columna).setValue(e.valor);
      exitosas++;
    } catch (e) {
      Logger.log('[Batch Write Error] Fila ' + e.fila + ', Col ' + e.columna + ': ' + e.message);
    }
  }
  
  return exitosas;
}

/**
 * Actualiza una fila completa eficientemente
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Hoja
 * @param {number} fila - Número de fila (1-indexed)
 * @param {Array} valores - Array de valores
 * @returns {boolean}
 */
function actualizarFila(hoja, fila, valores) {
  if (!hoja || !fila || !valores) return false;
  
  try {
    hoja.getRange(fila, 1, 1, valores.length).setValues([valores]);
    return true;
  } catch (e) {
    Logger.log('[Update Row Error]: ' + e.message);
    return false;
  }
}

// ============================================================================
// UTILIDADES DE RENDIMIENTO
// ============================================================================

/**
 * Mide el tiempo de ejecución de una función
 * @param {Function} fn - Función a medir
 * @param {string} nombre - Nombre para logging
 * @returns {*} Resultado de la función
 */
function medirTiempo(fn, nombre) {
  var inicio = new Date().getTime();
  var resultado = fn();
  var fin = new Date().getTime();
  var duracion = fin - inicio;
  
  Logger.log('[PERF] ' + nombre + ': ' + duracion + 'ms');
  
  return resultado;
}

/**
 * Ejecuta una función con reintentos y backoff exponencial
 * (Ya existe en utils.gs como conRetry, esta es una alias para compatibilidad)
 */
var ejecutarConRetry = conRetry;

// ============================================================================
// INICIALIZACIÓN OPTIMIZADA DE HOJAS
// ============================================================================

/**
 * Obtiene referencia optimizada a la hoja de CLIENTES
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHojaClientes() {
  return _SheetCache.get(CONFIG.HOJAS.CLIENTES);
}

/**
 * Obtiene referencia optimizada a la hoja de MOVIMIENTOS
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHojaMovimientos() {
  return _SheetCache.get(CONFIG.HOJAS.MOVIMIENTOS);
}

/**
 * Obtiene referencia optimizada a la hoja de CAJA_ARQUEOS
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHojaCajaArqueos() {
  return _SheetCache.get(CONFIG.HOJAS.CAJA_ARQUEOS);
}
