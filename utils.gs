/**
 * ============================================================================
 * UTILIDADES GLOBALES - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: utils.js
 * Descripción: Funciones de utilidad comunes
 *
 * ============================================================================
 */

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

// ============================================================================
// WRAPPERS EN INGLÉS PARA COMPATIBILIDAD CON TESTS
// ============================================================================

/**
 * Normaliza un nombre y lo capitaliza (wrapper en inglés para normalizarString)
 * @param {string} s - String a normalizar
 * @returns {string} String normalizado y capitalizado
 */
function normalizeName(s) {
  if (!s) return '';
  const normalized = normalizarString(s);
  return normalized.split(' ').map(capitalize).filter(w => w).join(' ');
}

/**
 * Capitaliza la primera letra de un string
 * @param {string} s - String a capitalizar
 * @returns {string} String capitalizado
 */
function capitalize(s) {
  if (!s || typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Búsqueda fuzzy en una lista (wrapper para calcularScoreFuzzy)
 * @param {string} query - String de búsqueda
 * @param {Array<string>} list - Lista de strings donde buscar
 * @param {number} maxResults - Máximo de resultados (default: 50)
 * @returns {Array<string>} Lista de resultados ordenados por score
 */
function fuzzySearch(query, list, maxResults = 50) {
  if (!query || !list || list.length === 0) return [];
  
  const queryNormalized = normalizarString(query);
  
  // Calcular scores para cada elemento
  const scores = list.map(item => ({
    item: item,
    score: calcularScoreFuzzy(queryNormalized, normalizarString(item))
  }));
  
  // Filtrar por score mínimo y ordenar
  const minScore = CONFIG.FUZZY.MIN_SCORE;
  const results = scores
    .filter(s => s.score >= minScore)
    .sort((a, b) => {
      // Prioridad: startsWith > includes > levenshtein
      const aStarts = normalizarString(a.item).startsWith(queryNormalized);
      const bStarts = normalizarString(b.item).startsWith(queryNormalized);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;
      
      const aIncludes = normalizarString(a.item).includes(queryNormalized);
      const bIncludes = normalizarString(b.item).includes(queryNormalized);
      if (aIncludes && !bIncludes) return -1;
      if (bIncludes && !aIncludes) return 1;
      
      return b.score - a.score;
    })
    .slice(0, maxResults)
    .map(s => s.item);
  
  return results;
}

/**
 * Elimina duplicados de un array
 * @param {Array} arr - Array con posibles duplicados
 * @returns {Array} Array sin duplicados
 */
function uniqueArray(arr) {
  if (!arr || !Array.isArray(arr)) return [];
  return Array.from(new Set(arr));
}

/**
 * Función debounce para limitar ejecución de funciones
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Delay en milisegundos
 * @returns {Function} Función con debounce
 */
function debounce(fn, delay = 250) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================================================
// FUNCIONES UTILITARIAS ORIGINALES (español)
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
function esTipoMovimientoValido(tipo) {
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

  if (!esTipoMovimientoValido(mov.tipo)) {
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