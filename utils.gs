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
 * Sanitiza texto para evitar inyección de HTML/XSS
 * @param {string} str - Texto a sanitizar
 * @returns {string} Texto seguro
 */
function sanitizarTexto(str) {
  if (!str) return '';
  return String(str)
    .replace(/[<>]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serializa objetos para enviar al frontend (convierte Dates a ISO strings)
 * @param {*} obj - Objeto a serializar
 * @returns {*} Objeto serializado
 */
function serializarParaWeb(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return formatearFechaLocal(obj);
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
 * Parsea un monto en formato argentino a número.
 * En Argentina: punto = separador de miles, coma = decimal.
 * Ejemplo: '15.000' → 15000, '1.500,50' → 1500.50, '1500' → 1500
 * IMPORTANTE: Number('15.000') = 15 en JS estándar (incorrecto para Argentina).
 * @param {string|number} valor - Monto en formato argentino o número
 * @returns {number} Monto como número de JavaScript
 */
function parsearMontoARG(valor) {
  if (typeof valor === 'number') return valor;
  if (!valor && valor !== 0) return 0;
  const str = String(valor).trim();
  if (!str) return 0;
  // Detectar formato: si hay coma decimal (1.500,50) → quitar puntos, reemplazar coma
  if (str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Solo puntos (15.000 o 1.500.000) → quitar puntos (son miles)
  if (str.includes('.')) {
    // Verificar si el punto es decimal (1 o 2 decimales al final) o de miles
    const partes = str.split('.');
    if (partes[partes.length - 1].length <= 2 && partes.length === 2) {
      // Podría ser decimal: 1500.50 → es decimal legítimo de JS
      return parseFloat(str) || 0;
    }
    // Múltiples puntos o más de 2 decimales → son separadores de miles
    return parseFloat(str.replace(/\./g, '')) || 0;
  }
  return parseFloat(str) || 0;
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

// ============================================================================
// VALIDACION DE CUIT - ALGORITMO OFICIAL AFIP/ARCA
// ============================================================================

/**
 * Valida un CUIT argentino usando el algoritmo oficial de AFIP/ARCA (módulo 11).
 * El CUIT debe tener 11 dígitos: XX-XXXXXXXX-X donde el último dígito es verificador.
 * 
 * Algoritmo:
 * 1. Multiplicar cada uno de los 10 primeros dígitos por los pesos [5,4,3,2,7,6,5,4,3,2]
 * 2. Sumar los resultados
 * 3. Calcular módulo 11
 * 4. Restar de 11 para obtener el dígito verificador esperado
 * 5. Casos especiales: si resto=0 o 1, ajustar cálculo
 * 
 * @param {string|number} cuit - CUIT a validar (con o sin guiones)
 * @returns {{valido: boolean, error?: string, cuitLimpio: string}} Resultado de validación
 */
function validarCUIT(cuit) {
  if (!cuit) {
    return { valido: false, error: 'CUIT vacío', cuitLimpio: '' };
  }

  // Limpiar CUIT: quitar guiones, espacios y puntos
  const cuitLimpio = String(cuit).replace(/[-\s.]/g, '');

  // Verificar que sean exactamente 11 dígitos numéricos
  if (!/^\d{11}$/.test(cuitLimpio)) {
    return { valido: false, error: 'CUIT inválido: debe tener 11 dígitos numéricos', cuitLimpio: cuitLimpio };
  }

  // Pesos para el cálculo (oficial AFIP)
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  
  // Calcular suma ponderada de los primeros 10 dígitos
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(cuitLimpio.charAt(i)) * pesos[i];
  }

  // Calcular dígito verificador según algoritmo módulo 11
  let digitoVerificador;
  const resto = suma % 11;
  
  if (resto === 0) {
    digitoVerificador = 0;
  } else if (resto === 1) {
    // Caso especial: si resto=1, se usa el método alternativo
    // Se suma 1 al número de CUIT sin dígito verificador y se recalcula
    const cuitSinDV = cuitLimpio.substring(0, 10);
    const cuitIncrementado = String(parseInt(cuitSinDV) + 1).padStart(10, '0');
    
    // Recalcular con el número incrementado
    suma = 0;
    for (let i = 0; i < 10; i++) {
      suma += parseInt(cuitIncrementado.charAt(i)) * pesos[i];
    }
    
    const nuevoResto = suma % 11;
    if (nuevoResto === 0) {
      digitoVerificador = 0;
    } else if (nuevoResto === 1) {
      // Segundo caso especial: CUIT inválido por configuración de dígitos
      // Esto indica un CUIT mal formado
      return { valido: false, error: 'CUIT inválido: configuración de dígitos no válida', cuitLimpio: cuitLimpio };
    } else {
      digitoVerificador = 11 - nuevoResto;
    }
  } else {
    digitoVerificador = 11 - resto;
  }

  // Obtener dígito verificador real del CUIT
  const digitoReal = parseInt(cuitLimpio.charAt(10));

  // Comparar
  if (digitoVerificador !== digitoReal) {
    return { valido: false, error: 'CUIT inválido: dígito verificador incorrecto (esperado: ' + digitoVerificador + ', recibido: ' + digitoReal + ')', cuitLimpio: cuitLimpio };
  }

  // CUIT válido
  return { valido: true, cuitLimpio: cuitLimpio };
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

/**
 * Valida datos de cliente para facturación electrónica ARCA/AFIP
 * 
 * REGLAS FISCALES ARGENTINAS:
 * - Responsables Inscriptos (RI): Requieren CUIT válido, razón social y domicilio fiscal
 * - Monotributistas (M): Requieren CUIT válido, razón social y domicilio fiscal
 * - Consumidor Final (CF): 
 *   - Sin CUIT: No requiere datos adicionales
 *   - Con CUIT: Solo requiere CUIT válido (razón social y domicilio OPCIONALES)
 * 
 * @param {Object} cliente - Datos del cliente
 * @param {string} tipoComprobante - 'A' o 'B' (opcional, default 'B')
 * @returns {{valid: boolean, errors: Array, advertencias: Array}}
 */
function validarClienteFacturacion(cliente, tipoComprobante) {
  const errors = [];
  const advertencias = [];
  const tipo = (tipoComprobante || 'B').toUpperCase();
  
  // Validación básica de nombre
  if (!cliente.nombre || typeof cliente.nombre !== 'string' || cliente.nombre.trim() === '') {
    errors.push('Nombre del cliente es requerido');
    return { valid: false, errors: errors, advertencias: advertencias };
  }
  
  // Si tiene CUIT, validarlo con algoritmo oficial
  if (cliente.cuit) {
    const validacionCUIT = validarCUIT(cliente.cuit);
    if (!validacionCUIT.valido) {
      errors.push('CUIT inválido: ' + validacionCUIT.error);
    }
  }
  
  // Para Factura A: CUIT obligatorio y debe ser RI o Monotributista
  if (tipo === 'A') {
    if (!cliente.cuit) {
      errors.push('Factura A requiere CUIT del cliente');
    } else if (!cliente.condicionFiscal || 
               (cliente.condicionFiscal !== 'RI' && 
                cliente.condicionFiscal !== 'Responsable Inscripto' &&
                cliente.condicionFiscal !== 'M' &&
                cliente.condicionFiscal !== 'Monotributista' &&
                cliente.condicionFiscal !== 'Monotributo')) {
      errors.push('Factura A requiere cliente RI o Monotributista. Condición actual: ' + (cliente.condicionFiscal || 'No especificada'));
    }
    
    // Para RI/Monotributo, razón social es obligatoria
    if (!cliente.razonSocial || cliente.razonSocial.trim() === '') {
      errors.push('Cliente RI/Monotributista requiere razón social');
    }
  }
  
  // Para Factura B con CUIT: NO exigir razón social ni domicilio (Consumidor Final válido)
  if (tipo === 'B' && cliente.cuit) {
    const esConsumidorFinal = !cliente.condicionFiscal || 
                              cliente.condicionFiscal === 'CF' ||
                              cliente.condicionFiscal === 'Consumidor Final';
    
    if (esConsumidorFinal) {
      // VÁLIDO: CF con CUIT sin razón social ni domicilio
      if (!cliente.razonSocial || cliente.razonSocial.trim() === '') {
        advertencias.push('Cliente CF con CUIT sin razón social. Se usará el nombre como razón social.');
      }
      if (!cliente.domicilioFiscal || cliente.domicilioFiscal.trim() === '') {
        advertencias.push('Cliente CF con CUIT sin domicilio fiscal. No requerido para Consumidor Final.');
      }
    }
  }
  
  return { valid: errors.length === 0, errors: errors, advertencias: advertencias };
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
  const fuzzyConfig = CONFIG.getFuzzy();

  // Match exacto
  if (busqueda === candidato) return fuzzyConfig.PESO_EXACTO;

  // Comienza con
  if (candidato.startsWith(busqueda)) return fuzzyConfig.PESO_COMIENZA;

  // Contiene
  if (candidato.includes(busqueda)) return fuzzyConfig.PESO_CONTIENE;

  // Levenshtein
  const maxLen = Math.max(busqueda.length, candidato.length);
  const maxDistanceAllowed = Math.floor(maxLen * (1 - fuzzyConfig.MIN_SCORE / 100));
  const distancia = levenshteinDistance(busqueda, candidato, maxDistanceAllowed);

  if (distancia > maxDistanceAllowed) return 0;

  const similitud = 1 - (distancia / maxLen);
  return Math.round(similitud * fuzzyConfig.PESO_LEVENSHTEIN);
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

  const fuzzyConfig = CONFIG.getFuzzy();
  const resultados = [];

  for (const cliente of clientes) {
    const nombreNorm = normalizarString(cliente.nombre);
    const score = calcularScoreFuzzy(terminoNorm, nombreNorm);

    if (score >= fuzzyConfig.MIN_SCORE) {
      resultados.push({
        cliente: cliente,
        score: score,
        esExacto: score === fuzzyConfig.PESO_EXACTO
      });
    }
  }

  // Ordenar por score descendente
  resultados.sort((a, b) => b.score - a.score);

  return resultados.slice(0, fuzzyConfig.MAX_SUGERENCIAS);
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

// ============================================================================
// UTILIDADES DE ARITMÉTICA FINANCIERA
// Convierte a enteros (centavos) para evitar errores de punto flotante IEEE 754
// ============================================================================

/**
 * Convierte pesos a centavos enteros para aritmética financiera exacta.
 * Ejemplo: centavos(1500.50) → 150050
 * @param {number} pesos - Monto en pesos
 * @returns {number} Monto en centavos (entero)
 */
function centavos(pesos) {
  return Math.round((pesos || 0) * 100);
}

/**
 * Convierte centavos enteros a pesos para almacenamiento y display.
 * Ejemplo: pesos(150050) → 1500.50
 * @param {number} cts - Monto en centavos
 * @returns {number} Monto en pesos
 */
function pesos(cts) {
  return cts / 100;
}

/**
 * Suma financiera exacta de dos montos en pesos.
 * @param {number} a - Primer monto en pesos
 * @param {number} b - Segundo monto en pesos
 * @returns {number} Suma exacta en pesos
 */
function sumaFinanciera(a, b) {
  return pesos(centavos(a) + centavos(b));
}

/**
 * Resta financiera exacta de dos montos en pesos.
 * @param {number} a - Minuendo en pesos
 * @param {number} b - Sustraendo en pesos
 * @returns {number} Resta exacta en pesos
 */
function restaFinanciera(a, b) {
  return pesos(centavos(a) - centavos(b));
}

// ============================================================================
// REQUEST-SCOPED CACHE — In-Memory Index por ejecución GAS
// Las variables module-level persisten durante todo el request lifecycle.
// Se invalidan automáticamente al terminar la ejecución (no hay memoria cruzada).
// ============================================================================

const RequestCache = {
  _store: {},

  /**
   * Obtiene un valor del cache de request.
   * @param {string} key
   * @returns {*} Valor o undefined si no existe
   */
  get: function(key) {
    return this._store[key];
  },

  /**
   * Guarda un valor en el cache de request.
   * @param {string} key
   * @param {*} value
   */
  set: function(key, value) {
    this._store[key] = value;
  },

  /**
   * Invalida una o más claves del cache.
   * Debe llamarse en CADA operación de escritura (crear, editar, eliminar).
   * @param {...string} keys
   */
  invalidar: function(...keys) {
    keys.forEach(k => delete this._store[k]);
  },

  /**
   * Obtiene o computa un valor del cache.
   * Si existe, retorna el cacheado. Si no, ejecuta fn(), cachea y retorna.
   * @param {string} key
   * @param {Function} fn - Función que produce el valor
   * @returns {*}
   */
  obtenerOComputar: function(key, fn) {
    if (this._store[key] !== undefined) {
      return this._store[key];
    }
    const valor = fn();
    this._store[key] = valor;
    return valor;
  }
};

// ============================================================================
// SHEETS CACHE LAYER — CacheService wrapper con invalidación explícita
// TTL corto (60s) para balance óptimo entre frescura y performance.
// Diseñado para datos de lectura frecuente con escritura infrecuente.
// ============================================================================

const SheetsCache = {
  _cache: null,

  _getCache: function() {
    if (!this._cache) this._cache = CacheService.getScriptCache();
    return this._cache;
  },

  /**
   * Guarda datos en CacheService, manejando el límite de 100KB con chunking.
   * @param {string} key - Clave del cache
   * @param {*} data - Datos a cachear (se serializan como JSON)
   * @param {number} ttlSegundos - TTL en segundos (default: 60)
   */
  set: function(key, data, ttlSegundos) {
    ttlSegundos = ttlSegundos || 60;
    try {
      const json = JSON.stringify(data);
      const cache = this._getCache();

      if (json.length <= 95000) {
        // Cabe en un solo valor
        cache.put(key, json, ttlSegundos);
        cache.put(key + '_meta', JSON.stringify({ chunks: 1 }), ttlSegundos);
      } else {
        // Chunking para datos > 95KB
        const chunkSize = 90000;
        const chunks = [];
        for (let i = 0; i < json.length; i += chunkSize) {
          chunks.push(json.substring(i, i + chunkSize));
        }
        const putEntries = {};
        putEntries[key + '_meta'] = JSON.stringify({ chunks: chunks.length });
        chunks.forEach((chunk, idx) => {
          putEntries[key + '_' + idx] = chunk;
        });
        cache.putAll(putEntries, ttlSegundos);
      }
    } catch (e) {
      Logger.log('[SheetsCache] Error en set(' + key + '): ' + e.message);
    }
  },

  /**
   * Recupera datos del cache.
   * @param {string} key
   * @returns {*} Datos deserializados o null si no existe/expiró
   */
  get: function(key) {
    try {
      const cache = this._getCache();
      const metaStr = cache.get(key + '_meta');
      if (!metaStr) return null;

      const meta = JSON.parse(metaStr);
      if (meta.chunks === 1) {
        const raw = cache.get(key);
        return raw ? JSON.parse(raw) : null;
      }

      // Reconstruir chunks
      let json = '';
      const keys = [];
      for (let i = 0; i < meta.chunks; i++) keys.push(key + '_' + i);
      const chunks = cache.getAll(keys);
      for (let i = 0; i < meta.chunks; i++) {
        const chunk = chunks[key + '_' + i];
        if (!chunk) return null; // chunk expirado → cache miss
        json += chunk;
      }
      return JSON.parse(json);
    } catch (e) {
      Logger.log('[SheetsCache] Error en get(' + key + '): ' + e.message);
      return null;
    }
  },

  /**
   * Invalida claves del cache (borrado inmediato).
   * Llamar en TODA operación de escritura sobre los datos cacheados.
   * @param {...string} keys
   */
  invalidar: function(...keys) {
    try {
      const cache = this._getCache();
      const allKeys = [];
      keys.forEach(k => {
        allKeys.push(k + '_meta', k + '_0', k + '_1', k + '_2', k + '_3', k);
      });
      cache.removeAll(allKeys);
    } catch (e) {
      Logger.log('[SheetsCache] Error en invalidar: ' + e.message);
    }
  }
};

// ============================================================================
// RETRY WRAPPER — Backoff exponencial para errores transitorios de Sheets API
// Detecta: ServiceUnavailableException, QuotaExceeded, timeout genérico.
// NO hace retry en: errores de validación, not found, permisos.
// ============================================================================

/**
 * Ejecuta una función con retry y backoff exponencial.
 * @param {Function} fn - Función a ejecutar (debe ser idempotente)
 * @param {Object} opciones
 * @param {number} opciones.maxIntentos - Máximo de intentos (default: 3)
 * @param {number} opciones.delayBaseMs - Delay base en ms (default: 1000)
 * @param {string} opciones.contexto - Nombre del contexto para logging
 * @returns {*} Resultado de fn() en el primer intento exitoso
 * @throws {Error} Si agota todos los intentos
 */
function conRetry(fn, opciones) {
  const maxIntentos = (opciones && opciones.maxIntentos) || 3;
  const delayBaseMs = (opciones && opciones.delayBaseMs) || 1000;
  const contexto    = (opciones && opciones.contexto)    || 'conRetry';

  // Mensajes que indican error transitorio (reintentable)
  const ERRORES_REINTENTABLES = [
    'service spreadsheets failed',
    'exceeded',
    'quota',
    'timeout',
    'timed out',
    'service unavailable',
    'internal error',
    'backend error',
    'try again'
  ];

  let ultimoError;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      return fn();
    } catch (e) {
      ultimoError = e;
      const msgLower = (e.message || '').toLowerCase();
      const esReintentable = ERRORES_REINTENTABLES.some(patron => msgLower.includes(patron));

      if (!esReintentable || intento === maxIntentos) {
        // Error no reintentable o agotamos intentos → propagar
        Logger.log('[' + contexto + '] Error no reintentable o intentos agotados (' + intento + '/' + maxIntentos + '): ' + e.message);
        throw e;
      }

      const delayMs = delayBaseMs * Math.pow(2, intento - 1); // 1s, 2s, 4s
      Logger.log('[' + contexto + '] Intento ' + intento + '/' + maxIntentos + ' fallido. Reintentando en ' + delayMs + 'ms. Error: ' + e.message);
      Utilities.sleep(delayMs);
    }
  }
  throw ultimoError; // never reached, TypeScript appeasement
}
