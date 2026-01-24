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
    MODEL: 'claude-3-5-sonnet-20241022',
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
  }
};


// ============================================================================
// 2. UTILIDADES
// ============================================================================

/**
 * Calcula la distancia de Levenshtein entre dos strings
 * @param {string} a - Primer string
 * @param {string} b - Segundo string
 * @returns {number} Distancia de Levenshtein
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  // Caso base: strings vacíos
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Inicializar primera fila y columna
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Llenar matriz
  for (let i = 1; i <= b.length; i++) {
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
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calcula un score de similitud fuzzy entre dos strings
 * @param {string} busqueda - String de búsqueda (normalizado)
 * @param {string} candidato - String candidato (normalizado)
 * @returns {number} Score de 0-100
 */
function calcularScoreFuzzy(busqueda, candidato) {
  // Match exacto
  if (busqueda === candidato) {
    return CONFIG.FUZZY.PESO_EXACTO;
  }

  // Comienza con
  if (candidato.startsWith(busqueda)) {
    return CONFIG.FUZZY.PESO_COMIENZA;
  }

  // Contiene
  if (candidato.includes(busqueda)) {
    return CONFIG.FUZZY.PESO_CONTIENE;
  }

  // Distancia Levenshtein
  const distancia = levenshteinDistance(busqueda, candidato);
  const maxLen = Math.max(busqueda.length, candidato.length);

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


// ============================================================================
// 3. CLIENTES REPOSITORY
// ============================================================================

const ClientesRepository = {
  /**
   * Obtiene la hoja de CLIENTES
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  obtenerTodos: function() {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return []; // Solo encabezados o vacío

    const clientes = [];
    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      clientes.push({
        nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE] || '',
        tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
        email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
        limite: fila[CONFIG.COLS_CLIENTES.LIMITE] || 100000,
        saldo: fila[CONFIG.COLS_CLIENTES.SALDO] || 0,
        totalMovs: fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS] || 0,
        alta: fila[CONFIG.COLS_CLIENTES.ALTA] || '',
        ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV] || '',
        obs: fila[CONFIG.COLS_CLIENTES.OBS] || ''
      });
    }

    return clientes;
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
        return {
          cliente: {
            nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
            tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
            email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
            limite: fila[CONFIG.COLS_CLIENTES.LIMITE] || 100000,
            saldo: fila[CONFIG.COLS_CLIENTES.SALDO] || 0,
            totalMovs: fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS] || 0,
            alta: fila[CONFIG.COLS_CLIENTES.ALTA] || '',
            ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV] || '',
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
      alta: ahora,
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      const fecha = new Date();
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
        fecha: fecha,
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
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const movimientos = [];

    // Comenzar desde el final (más recientes primero)
    for (let i = datos.length - 1; i >= 1 && movimientos.length < limite; i--) {
      const fila = datos[i];
      movimientos.push({
        id: fila[CONFIG.COLS_MOVS.ID],
        fecha: fila[CONFIG.COLS_MOVS.FECHA],
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
        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fila[CONFIG.COLS_MOVS.FECHA],
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
        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fila[CONFIG.COLS_MOVS.FECHA],
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
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('API Key de Claude no configurada. Por favor, configure la API Key en el módulo de Configuración.');
    }

    // Detectar tipo de imagen desde el prefijo Base64
    let mediaType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) {
      mediaType = 'image/png';
    } else if (imageBase64.includes('data:image/webp')) {
      mediaType = 'image/webp';
    } else if (imageBase64.includes('data:image/gif')) {
      mediaType = 'image/gif';
    }

    // Limpiar prefijo Base64
    const base64Clean = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    // Construir payload para Claude API
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

    // Hacer request a Claude API
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

    try {
      const response = UrlFetchApp.fetch(CONFIG.CLAUDE.API_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (responseCode !== 200) {
        Logger.log('Error de Claude API: ' + responseText);
        throw new Error(`Error de Claude API (${responseCode}): ${responseText}`);
      }

      const resultado = JSON.parse(responseText);

      // Extraer texto de la respuesta
      if (!resultado.content || !resultado.content[0] || !resultado.content[0].text) {
        throw new Error('Respuesta de Claude API inválida');
      }

      const textoRespuesta = resultado.content[0].text;

      // Parsear JSON de la respuesta
      // Claude a veces envuelve el JSON en ```json ... ```, limpiarlo
      let jsonLimpio = textoRespuesta.trim();
      jsonLimpio = jsonLimpio.replace(/^```json\n?/, '').replace(/\n?```$/, '');

      const datosExtraidos = JSON.parse(jsonLimpio);

      // Validar estructura
      if (!datosExtraidos.movimientos || !Array.isArray(datosExtraidos.movimientos)) {
        throw new Error('Formato de respuesta inválido: falta array "movimientos"');
      }

      return {
        success: true,
        movimientos: datosExtraidos.movimientos,
        totalExtraidos: datosExtraidos.movimientos.length
      };

    } catch (error) {
      Logger.log('Error en analizarImagen: ' + error.message);
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
  try {
    const clientes = ClientesRepository.obtenerTodos();
    const movimientos = MovimientosRepository.obtenerRecientes(50); // Últimos 50 movimientos

    return {
      success: true,
      clientes: clientes,
      movimientos: movimientos
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosParaHTML: ' + error.message);
    return {
      success: false,
      error: error.message
    };
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
    Logger.log('Error en obtenerDatosCompletoCliente: ' + error.message);
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
 * API 5: Fuzzy matching para buscar clientes con sugerencias
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

    // Calcular score para cada cliente
    clientes.forEach(cliente => {
      const nombreCliente = normalizarString(cliente.nombre);
      const score = calcularScoreFuzzy(nombreBusqueda, nombreCliente);

      if (score >= CONFIG.FUZZY.MIN_SCORE) {
        sugerencias.push({
          nombre: cliente.nombre,
          score: score,
          saldo: cliente.saldo,
          tel: cliente.tel
        });
      }
    });

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
    Logger.log('Error en rematchearNombreConSugerencias: ' + error.message);
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
  try {
    const movimiento = MovimientosRepository.registrar(movimientoData);

    return {
      success: true,
      movimiento: movimiento
    };
  } catch (error) {
    Logger.log('Error en guardarMovimientoDesdeHTML: ' + error.message);
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
 * API 8: Crea un nuevo cliente completo
 * @param {Object} clienteData - Datos del cliente
 * @returns {Object} Cliente creado
 */
function crearNuevoClienteCompleto(clienteData) {
  try {
    const cliente = ClientesRepository.crear(clienteData);

    return {
      success: true,
      cliente: cliente
    };
  } catch (error) {
    Logger.log('Error en crearNuevoClienteCompleto: ' + error.message);
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
  try {
    const cliente = ClientesRepository.actualizar(nombreCliente, datos);

    return {
      success: true,
      cliente: cliente
    };
  } catch (error) {
    Logger.log('Error en actualizarDatosCliente: ' + error.message);
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
function analizarImagenVisualReasoning(imageBase64) {
  try {
    const resultado = ClaudeService.analizarImagen(imageBase64);

    return {
      success: true,
      movimientos: resultado.movimientos,
      totalExtraidos: resultado.totalExtraidos
    };
  } catch (error) {
    Logger.log('Error en analizarImagenVisualReasoning: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}


// ============================================================================
// FIN DEL ARCHIVO
// ============================================================================
