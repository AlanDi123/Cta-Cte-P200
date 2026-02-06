/**
 * ============================================================================
 * UTILIDADES - SISTEMA SOL & VERDE
 * ============================================================================
 * Funciones de utilidad, validacion y busqueda
 * ============================================================================
 */

// ============================================================================
// NORMALIZACION Y STRINGS
// ============================================================================

/**
 * Normaliza un string para comparacion
 * Convierte a mayusculas, quita acentos y espacios extras
 * @param {string} str - String a normalizar
 * @returns {string} String normalizado (mayusculas, sin acentos, sin espacios extras)
 */
function normalizarString(str) {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Normalizar acentos y caracteres especiales
    .replace(/[ÁÀÂÃ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/Ñ/g, 'N')
    .replace(/Ç/g, 'C');
}

/**
 * Serializa objetos para enviar al frontend (convierte Dates a ISO strings)
 * @param {*} obj - Objeto a serializar
 * @returns {*} Objeto serializado
 */
function serializarParaWeb(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(item => serializarParaWeb(item));
  if (typeof obj === 'object') {
    const resultado = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        resultado[key] = serializarParaWeb(obj[key]);
      }
    }
    return resultado;
  }
  return obj;
}

// ============================================================================
// VALIDACIONES
// ============================================================================

/**
 * Valida que un tipo de movimiento sea valido
 * @param {string} tipo - Tipo a validar
 * @returns {boolean} True si es valido
 */
function esTipoMovimientoValido(tipo) {
  return tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE ||
         tipo === CONFIG.TIPOS_MOVIMIENTO.HABER;
}

/**
 * Valida que un monto sea positivo
 * @param {number} monto - Monto a validar
 * @returns {boolean} True si es valido
 */
function esMontoValido(monto) {
  return typeof monto === 'number' && monto > 0 && isFinite(monto);
}

/**
 * Valida y convierte una fecha
 * @param {string|Date} fecha - Fecha a validar
 * @returns {Date|null} Objeto Date valido o null
 */
function validarFecha(fecha) {
  if (!fecha) return null;
  try {
    const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(fechaObj.getTime())) return null;
    const year = fechaObj.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return fechaObj;
  } catch (error) {
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
    errors.push('Tipo de movimiento invalido (debe ser DEBE o HABER)');
  }

  if (!esMontoValido(mov.monto)) {
    errors.push('Monto invalido (debe ser un numero positivo)');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Valida datos de cliente
 * @param {Object} cliente - Datos del cliente
 * @returns {Object} {valid: boolean, errors: Array}
 */
function validarCliente(cliente) {
  const errors = [];

  if (!cliente.nombre || typeof cliente.nombre !== 'string' || cliente.nombre.trim() === '') {
    errors.push('Nombre es requerido');
  }

  if (cliente.limite !== undefined && (typeof cliente.limite !== 'number' || cliente.limite < 0)) {
    errors.push('Limite de credito invalido');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ============================================================================
// BUSQUEDA FUZZY
// ============================================================================

/**
 * Calcula la distancia de Levenshtein entre dos strings
 * @param {string} a - Primer string
 * @param {string} b - Segundo string
 * @param {number} maxDistance - Distancia maxima antes de abandonar
 * @returns {number} Distancia de Levenshtein
 */
function levenshteinDistance(a, b, maxDistance = Infinity) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > maxDistance) return maxDistance + 1;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    let minInRow = Infinity;
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
      minInRow = Math.min(minInRow, matrix[i][j]);
    }
    if (minInRow > maxDistance) return maxDistance + 1;
  }

  return matrix[b.length][a.length];
}

/**
 * Calcula un score de similitud fuzzy entre dos strings
 * @param {string} busqueda - String de busqueda
 * @param {string} candidato - String candidato
 * @returns {number} Score de 0-100
 */
function calcularScoreFuzzy(busqueda, candidato) {
  // Match exacto
  if (busqueda === candidato) return CONFIG.FUZZY.PESO_EXACTO;

  // Comienza con
  if (candidato.startsWith(busqueda)) return CONFIG.FUZZY.PESO_COMIENZA;

  // Contiene
  if (candidato.includes(busqueda)) return CONFIG.FUZZY.PESO_CONTIENE;

  // Levenshtein
  const maxLen = Math.max(busqueda.length, candidato.length);
  const maxDistanceAllowed = Math.floor(maxLen * (1 - CONFIG.FUZZY.MIN_SCORE / 100));
  const distancia = levenshteinDistance(busqueda, candidato, maxDistanceAllowed);

  if (distancia > maxDistanceAllowed) return 0;

  const similitud = 1 - (distancia / maxLen);
  return Math.round(similitud * CONFIG.FUZZY.PESO_LEVENSHTEIN);
}

/**
 * Busca sugerencias de clientes por nombre fuzzy
 * @param {string} termino - Termino de busqueda
 * @param {Array} clientes - Array de clientes
 * @returns {Array} Array de sugerencias ordenadas por score
 */
function buscarClientesFuzzy(termino, clientes) {
  const terminoNorm = normalizarString(termino);
  if (!terminoNorm) return [];

  const resultados = [];

  for (const cliente of clientes) {
    const nombreNorm = normalizarString(cliente.nombre);
    const score = calcularScoreFuzzy(terminoNorm, nombreNorm);

    if (score >= CONFIG.FUZZY.MIN_SCORE) {
      resultados.push({
        cliente: cliente,
        score: score,
        esExacto: score === CONFIG.FUZZY.PESO_EXACTO
      });
    }
  }

  // Ordenar por score descendente
  resultados.sort((a, b) => b.score - a.score);

  return resultados.slice(0, CONFIG.FUZZY.MAX_SUGERENCIAS);
}

// ============================================================================
// UTILIDADES DE FECHA
// ============================================================================

/**
 * Formatea una fecha para mostrar
 * @param {Date|string} fecha - Fecha a formatear
 * @returns {string} Fecha formateada DD/MM/YYYY
 */
function formatearFecha(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Obtiene la fecha de hoy en formato YYYY-MM-DD
 * @returns {string} Fecha de hoy
 */
function obtenerFechaHoy() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Formatea una fecha a YYYY-MM-DD en zona horaria local (NO UTC)
 * IMPORTANTE: Usar en lugar de toISOString().split('T')[0] para evitar desfase de días
 * @param {Date|string} fecha - Fecha a formatear
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function formatearFechaLocal(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : parsearFechaLocal(fecha);
  if (!d || isNaN(d.getTime())) return '';
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Parsea una fecha string YYYY-MM-DD como fecha LOCAL (no UTC)
 * IMPORTANTE: new Date("2026-02-03") se interpreta como UTC, causando desfase
 * Esta función parsea la fecha como medianoche hora local
 * @param {string|Date} fecha - Fecha en formato YYYY-MM-DD o Date
 * @returns {Date} Objeto Date en hora local
 */
function parsearFechaLocal(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha;

  // Si es ISO string completo con T, parsearlo de forma segura
  if (typeof fecha === 'string' && fecha.includes('T')) {
    const d = new Date(fecha);
    // Crear nueva fecha con los componentes locales
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  // Para formato YYYY-MM-DD, parsear manualmente como local
  if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 0, 0, 0, 0);
  }

  // Fallback a Date constructor
  return new Date(fecha);
}

// ============================================================================
// UTILIDADES DE FORMATO
// ============================================================================

/**
 * Formatea un numero como moneda
 * @param {number} monto - Monto a formatear
 * @returns {string} Monto formateado
 */
function formatearMonto(monto) {
  if (typeof monto !== 'number') return '$0';
  return '$' + monto.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ============================================================================
// GENERACION DE IDS
// ============================================================================

/**
 * Genera un ID de sesion unico
 * @returns {string} ID de sesion
 */
function generarSesionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `SES_${timestamp}_${random}`.toUpperCase();
}
