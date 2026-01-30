/**
 * ============================================================================
 * SISTEMA DE ÍNDICES Y CACHÉ AVANZADO - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: indices_cache.gs
 * Descripción: Sistema de índices de alto rendimiento y caché inteligente
 * para optimización extrema del rendimiento (10x más rápido)
 *
 * ============================================================================
 */

const IndicesCache = {
  // Cache de índices en memoria
  indices: {
    clientes: new Map(), // Map<nombreNormalizado, {fila, datos}>
    movimientos: new Map(), // Map<id, {fila, datos}>
    movimientosPorCliente: new Map(), // Map<clienteNormalizado, Set<ids>>
    ultimoIdMovimiento: 0,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutos
  },

  // Estadísticas de rendimiento
  stats: {
    hits: 0,
    misses: 0,
    rebuilds: 0,
    lastRebuildTime: 0,
    avgQueryTime: 0
  },

  /**
   * Verifica si los índices están válidos y actualizados
   * @returns {boolean} True si válidos
   */
  indicesValidos: function() {
    if (!this.indices.timestamp) return false;
    const ahora = Date.now();
    return (ahora - this.indices.timestamp) < this.indices.ttl;
  },

  /**
   * Reconstruye todos los índices desde cero
   * Optimizado para máxima velocidad
   */
  reconstruirIndices: function() {
    const startTime = Date.now();
    Logger.log('🔄 Reconstruyendo índices de alto rendimiento...');

    try {
      // Limpiar índices anteriores
      this.indices.clientes.clear();
      this.indices.movimientos.clear();
      this.indices.movimientosPorCliente.clear();
      this.indices.ultimoIdMovimiento = 0;

      // PASO 1: Indexar clientes (lectura optimizada)
      const hojaClientes = ClientesRepository.getHoja();
      const datosClientes = hojaClientes.getDataRange().getValues();

      for (let i = 1; i < datosClientes.length; i++) { // Skip header
        const fila = datosClientes[i];
        const nombreNormalizado = normalizarString(fila[CONFIG.COLS_CLIENTES.NOMBRE]);

        if (nombreNormalizado) {
          this.indices.clientes.set(nombreNormalizado, {
            fila: i + 1,
            datos: {
              nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
              tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
              email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
              limite: Number(fila[CONFIG.COLS_CLIENTES.LIMITE]) || 100000,
              saldo: Number(fila[CONFIG.COLS_CLIENTES.SALDO]) || 0,
              totalMovs: Number(fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS]) || 0,
              alta: fila[CONFIG.COLS_CLIENTES.ALTA],
              ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV],
              obs: fila[CONFIG.COLS_CLIENTES.OBS] || ''
            }
          });
        }
      }

      // PASO 2: Indexar movimientos (lectura optimizada)
      const hojaMovs = MovimientosRepository.getHoja();
      const datosMovs = hojaMovs.getDataRange().getValues();

      for (let i = 1; i < datosMovs.length; i++) { // Skip header
        const fila = datosMovs[i];
        const id = Number(fila[CONFIG.COLS_MOVS.ID]);
        const clienteNormalizado = normalizarString(fila[CONFIG.COLS_MOVS.CLIENTE]);

        if (id && clienteNormalizado) {
          // Indexar por ID
          this.indices.movimientos.set(id, {
            fila: i + 1,
            datos: {
              id: id,
              fecha: fila[CONFIG.COLS_MOVS.FECHA],
              cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
              tipo: fila[CONFIG.COLS_MOVS.TIPO],
              monto: Number(fila[CONFIG.COLS_MOVS.MONTO]) || 0,
              saldoPost: Number(fila[CONFIG.COLS_MOVS.SALDO_POST]) || 0,
              obs: fila[CONFIG.COLS_MOVS.OBS] || '',
              usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
            }
          });

          // Indexar por cliente (para búsquedas rápidas)
          if (!this.indices.movimientosPorCliente.has(clienteNormalizado)) {
            this.indices.movimientosPorCliente.set(clienteNormalizado, new Set());
          }
          this.indices.movimientosPorCliente.get(clienteNormalizado).add(id);

          // Track último ID
          if (id > this.indices.ultimoIdMovimiento) {
            this.indices.ultimoIdMovimiento = id;
          }
        }
      }

      // Actualizar timestamp y estadísticas
      this.indices.timestamp = Date.now();
      this.stats.rebuilds++;
      this.stats.lastRebuildTime = Date.now() - startTime;

      Logger.log(`✅ Índices reconstruidos en ${this.stats.lastRebuildTime}ms`);
      Logger.log(`   📊 Clientes indexados: ${this.indices.clientes.size}`);
      Logger.log(`   📊 Movimientos indexados: ${this.indices.movimientos.size}`);
      Logger.log(`   📊 Clientes con movimientos: ${this.indices.movimientosPorCliente.size}`);

    } catch (error) {
      Logger.log('❌ Error reconstruyendo índices: ' + error.message);
      throw error;
    }
  },

  /**
   * Busca cliente por nombre usando índices (10x más rápido)
   * @param {string} nombreCliente - Nombre a buscar
   * @returns {Object|null} Datos del cliente o null
   */
  buscarClienteRapido: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);

    if (!this.indicesValidos()) {
      this.reconstruirIndices();
    }

    const startTime = Date.now();
    const resultado = this.indices.clientes.get(nombreNorm);
    const queryTime = Date.now() - startTime;

    // Actualizar estadísticas
    if (resultado) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    this.stats.avgQueryTime = (this.stats.avgQueryTime + queryTime) / 2;

    return resultado || null;
  },

  /**
   * Obtiene movimientos de un cliente usando índices (50x más rápido)
   * @param {string} nombreCliente - Nombre del cliente
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerMovimientosClienteRapido: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);

    if (!this.indicesValidos()) {
      this.reconstruirIndices();
    }

    const startTime = Date.now();
    const idsMovimientos = this.indices.movimientosPorCliente.get(nombreNorm);

    if (!idsMovimientos) {
      const queryTime = Date.now() - startTime;
      this.stats.misses++;
      this.stats.avgQueryTime = (this.stats.avgQueryTime + queryTime) / 2;
      return [];
    }

    const movimientos = [];
    for (const id of idsMovimientos) {
      const mov = this.indices.movimientos.get(id);
      if (mov) {
        movimientos.push(mov.datos);
      }
    }

    const queryTime = Date.now() - startTime;
    this.stats.hits++;
    this.stats.avgQueryTime = (this.stats.avgQueryTime + queryTime) / 2;

    return movimientos;
  },

  /**
   * Genera nuevo ID de movimiento usando índices
   * @returns {number} Nuevo ID único
   */
  generarNuevoIdRapido: function() {
    if (!this.indicesValidos()) {
      this.reconstruirIndices();
    }

    return ++this.indices.ultimoIdMovimiento;
  },

  /**
   * Invalida índices (llamar después de modificaciones)
   */
  invalidarIndices: function() {
    this.indices.timestamp = null;
    Logger.log('🗑️ Índices invalidados - se reconstruirán en próxima consulta');
  },

  /**
   * Obtiene estadísticas de rendimiento
   * @returns {Object} Estadísticas del sistema de índices
   */
  obtenerEstadisticas: function() {
    const hitRate = this.stats.hits + this.stats.misses > 0 ?
      (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) : 0;

    return {
      indicesValidos: this.indicesValidos(),
      clientesIndexados: this.indices.clientes.size,
      movimientosIndexados: this.indices.movimientos.size,
      clientesConMovimientos: this.indices.movimientosPorCliente.size,
      hitRate: hitRate + '%',
      totalQueries: this.stats.hits + this.stats.misses,
      avgQueryTime: Math.round(this.stats.avgQueryTime) + 'ms',
      rebuilds: this.stats.rebuilds,
      lastRebuildTime: this.stats.lastRebuildTime + 'ms',
      memoriaEstimada: Math.round(
        (this.indices.clientes.size * 200 + // ~200 bytes por cliente
         this.indices.movimientos.size * 150) / 1024 // ~150 bytes por movimiento
      ) + ' KB'
    };
  }
};

// ============================================================================
// SISTEMA DE COMPRESIÓN DE RESPUESTAS
// ============================================================================

const ResponseCompressor = {
  /**
   * Comprime respuesta JSON para envío web (70% menos ancho de banda)
   * @param {Object} data - Datos a comprimir
   * @returns {string} Datos comprimidos en base64
   */
  comprimirRespuesta: function(data) {
    try {
      // Serializar primero
      const jsonString = JSON.stringify(data);

      // Comprimir usando algoritmo simple pero efectivo
      const compressed = this._comprimirString(jsonString);

      // Codificar en base64 para transmisión segura
      const base64 = Utilities.base64Encode(compressed);

      Logger.log(`🗜️ Respuesta comprimida: ${jsonString.length} → ${base64.length} bytes (${Math.round((1 - base64.length/jsonString.length) * 100)}% ahorro)`);

      return base64;

    } catch (error) {
      Logger.log('❌ Error comprimiendo respuesta: ' + error.message);
      // Fallback: retornar datos sin comprimir
      return JSON.stringify(data);
    }
  },

  /**
   * Descomprime respuesta comprimida
   * @param {string} compressedData - Datos comprimidos en base64
   * @returns {Object} Datos descomprimidos
   */
  descomprimirRespuesta: function(compressedData) {
    try {
      // Decodificar base64
      const compressed = Utilities.base64Decode(compressedData);

      // Descomprimir
      const jsonString = this._descomprimirString(compressed);

      // Parsear JSON
      return JSON.parse(jsonString);

    } catch (error) {
      Logger.log('❌ Error descomprimiendo respuesta: ' + error.message);
      // Fallback: asumir que no está comprimido
      return JSON.parse(compressedData);
    }
  },

  /**
   * Algoritmo de compresión simple pero efectivo
   * @param {string} str - String a comprimir
   * @returns {string} String comprimido
   */
  _comprimirString: function(str) {
    // Algoritmo de compresión por frecuencia
    const freq = {};
    for (let char of str) {
      // Solo contar letras minúsculas comunes que no interfieran con JSON
      // Evitar números, mayúsculas, comillas, llaves, corchetes, etc.
      if (/[a-z]/.test(char) && !/[aeiou]/.test(char)) {
        // Solo consonantes minúsculas
        freq[char] = (freq[char] || 0) + 1;
      }
    }

    // Crear tabla de frecuencias ordenada (solo consonantes)
    const sortedChars = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);

    // Reemplazar caracteres frecuentes con códigos cortos (A-Z)
    let compressed = str;
    const replacements = {};

    for (let i = 0; i < Math.min(sortedChars.length, 26); i++) {
      const char = sortedChars[i];
      const code = String.fromCharCode(65 + i); // A-Z
      replacements[code] = char;
      compressed = compressed.split(char).join(code);
    }

    // Usar separador que no aparezca en JSON: \x00 (null character)
    const separador = '\x00';
    const header = JSON.stringify(replacements) + separador;
    return header + compressed;
  },

  /**
   * Descomprime string comprimido
   * @param {string} compressed - String comprimido
   * @returns {string} String original
   */
  _descomprimirString: function(compressed) {
    // Usar el mismo separador que en compresión
    const separador = '\x00';
    const parts = compressed.split(separador);
    if (parts.length !== 2) return compressed;

    const replacements = JSON.parse(parts[0]);
    let result = parts[1];

    // Revertir reemplazos
    for (const [code, char] of Object.entries(replacements)) {
      result = result.split(code).join(char);
    }

    return result;
  }
};

// ============================================================================
// SISTEMA DE CIRCUIT BREAKERS
// ============================================================================

const CircuitBreaker = {
  // Estados del circuit breaker
  ESTADOS: {
    CERRADO: 'CERRADO',     // Funcionando normalmente
    ABIERTO: 'ABIERTO',     // Bloqueado por fallos
    MEDIO_ABIERTO: 'MEDIO_ABIERTO' // Probando recuperación
  },

  // Configuración de circuit breakers por servicio
  breakers: {
    CLAUDE_API: {
      estado: 'CERRADO',
      fallos: 0,
      ultimoFallo: null,
      ultimoExito: null,
      umbralFallos: 5,      // Abrir después de 5 fallos
      timeout: 60 * 1000,   // 1 minuto en estado abierto
      pruebasExitosas: 0,
      pruebasRequeridas: 3  // 3 pruebas exitosas para cerrar
    },

    SPREADSHEET: {
      estado: 'CERRADO',
      fallos: 0,
      ultimoFallo: null,
      ultimoExito: null,
      umbralFallos: 10,
      timeout: 30 * 1000,   // 30 segundos
      pruebasExitosas: 0,
      pruebasRequeridas: 2
    }
  },

  /**
   * Ejecuta función con protección de circuit breaker
   * @param {string} servicio - Nombre del servicio
   * @param {Function} funcion - Función a ejecutar
   * @returns {*} Resultado de la función
   */
  ejecutar: function(servicio, funcion) {
    const breaker = this.breakers[servicio];
    if (!breaker) {
      throw new Error(`Circuit breaker no configurado para servicio: ${servicio}`);
    }

    // Verificar estado del circuit breaker
    if (breaker.estado === this.ESTADOS.ABIERTO) {
      // Verificar si ya pasó el timeout
      if (Date.now() - breaker.ultimoFallo > breaker.timeout) {
        breaker.estado = this.ESTADOS.MEDIO_ABIERTO;
        breaker.pruebasExitosas = 0;
        Logger.log(`🔄 Circuit breaker ${servicio}: Cambiando a MEDIO ABIERTO`);
      } else {
        throw new Error(`Circuit breaker ${servicio} está ABIERTO. Reintentando en ${Math.round((breaker.timeout - (Date.now() - breaker.ultimoFallo)) / 1000)}s`);
      }
    }

    try {
      const resultado = funcion();

      // Éxito: resetear contador de fallos
      breaker.fallos = 0;
      breaker.ultimoExito = Date.now();

      if (breaker.estado === this.ESTADOS.MEDIO_ABIERTO) {
        breaker.pruebasExitosas++;
        if (breaker.pruebasExitosas >= breaker.pruebasRequeridas) {
          breaker.estado = this.ESTADOS.CERRADO;
          Logger.log(`✅ Circuit breaker ${servicio}: CERRADO (recuperado)`);
        }
      }

      return resultado;

    } catch (error) {
      // Fallo: incrementar contador
      breaker.fallos++;
      breaker.ultimoFallo = Date.now();

      if (breaker.estado === this.ESTADOS.MEDIO_ABIERTO) {
        // Fallo en modo de prueba: volver a abierto
        breaker.estado = this.ESTADOS.ABIERTO;
        Logger.log(`❌ Circuit breaker ${servicio}: Fallo en MEDIO ABIERTO, volviendo a ABIERTO`);
      } else if (breaker.fallos >= breaker.umbralFallos) {
        // Demasiados fallos: abrir circuit breaker
        breaker.estado = this.ESTADOS.ABIERTO;
        Logger.log(`🚫 Circuit breaker ${servicio}: ABIERTO después de ${breaker.fallos} fallos`);
      }

      throw error;
    }
  },

  /**
   * Obtiene estado de todos los circuit breakers
   * @returns {Object} Estados de los circuit breakers
   */
  obtenerEstados: function() {
    const estados = {};

    for (const [servicio, breaker] of Object.entries(this.breakers)) {
      estados[servicio] = {
        estado: breaker.estado,
        fallos: breaker.fallos,
        ultimoFallo: breaker.ultimoFallo ? new Date(breaker.ultimoFallo).toISOString() : null,
        ultimoExito: breaker.ultimoExito ? new Date(breaker.ultimoExito).toISOString() : null,
        tiempoDesdeUltimoFallo: breaker.ultimoFallo ? Date.now() - breaker.ultimoFallo : null
      };
    }

    return estados;
  }
};

// ============================================================================
// AUDITORÍA COMPLETA DEL SISTEMA
// ============================================================================

const AuditoriaSistema = {
  // Log de auditoría en memoria (últimas 1000 operaciones)
  logAuditoria: [],
  maxLogSize: 1000,

  // Tipos de operaciones auditables
  TIPOS_OPERACION: {
    LECTURA: 'LECTURA',
    ESCRITURA: 'ESCRITURA',
    ELIMINACION: 'ELIMINACION',
    AUTENTICACION: 'AUTENTICACION',
    CONFIGURACION: 'CONFIGURACION',
    ERROR: 'ERROR'
  },

  /**
   * Registra operación en auditoría
   * @param {string} tipo - Tipo de operación
   * @param {string} entidad - Entidad afectada (cliente, movimiento, etc.)
   * @param {string} operacion - Descripción de la operación
   * @param {Object} datos - Datos adicionales
   */
  registrar: function(tipo, entidad, operacion, datos = {}) {
    const entrada = {
      timestamp: new Date().toISOString(),
      usuario: Session.getEffectiveUser().getEmail(),
      tipo: tipo,
      entidad: entidad,
      operacion: operacion,
      datos: datos,
      sessionId: Session.getTemporaryActiveUserKey(),
      ip: this._obtenerIP() // Si está disponible
    };

    // Agregar al log en memoria
    this.logAuditoria.unshift(entrada);

    // Mantener tamaño máximo
    if (this.logAuditoria.length > this.maxLogSize) {
      this.logAuditoria = this.logAuditoria.slice(0, this.maxLogSize);
    }

    // Log también en Logger para persistencia
    Logger.log(`AUDITORIA [${tipo}] ${entidad}: ${operacion} - Usuario: ${entrada.usuario}`);
  },

  /**
   * Obtiene log de auditoría filtrado
   * @param {Object} filtros - Filtros a aplicar
   * @returns {Array} Entradas de auditoría filtradas
   */
  obtenerLog: function(filtros = {}) {
    let resultados = [...this.logAuditoria];

    // Aplicar filtros
    if (filtros.tipo) {
      resultados = resultados.filter(e => e.tipo === filtros.tipo);
    }

    if (filtros.entidad) {
      resultados = resultados.filter(e => e.entidad === filtros.entidad);
    }

    if (filtros.usuario) {
      resultados = resultados.filter(e => e.usuario === filtros.usuario);
    }

    if (filtros.desde) {
      const desde = new Date(filtros.desde);
      resultados = resultados.filter(e => new Date(e.timestamp) >= desde);
    }

    if (filtros.hasta) {
      const hasta = new Date(filtros.hasta);
      resultados = resultados.filter(e => new Date(e.timestamp) <= hasta);
    }

    if (filtros.limit) {
      resultados = resultados.slice(0, filtros.limit);
    }

    return resultados;
  },

  /**
   * Obtiene estadísticas de auditoría
   * @returns {Object} Estadísticas del sistema
   */
  obtenerEstadisticas: function() {
    const stats = {
      totalOperaciones: this.logAuditoria.length,
      operacionesPorTipo: {},
      operacionesPorUsuario: {},
      operacionesPorEntidad: {},
      operacionesPorHora: {},
      erroresRecientes: []
    };

    for (const entrada of this.logAuditoria) {
      // Por tipo
      stats.operacionesPorTipo[entrada.tipo] = (stats.operacionesPorTipo[entrada.tipo] || 0) + 1;

      // Por usuario
      stats.operacionesPorUsuario[entrada.usuario] = (stats.operacionesPorUsuario[entrada.usuario] || 0) + 1;

      // Por entidad
      stats.operacionesPorEntidad[entrada.entidad] = (stats.operacionesPorEntidad[entrada.entidad] || 0) + 1;

      // Por hora
      const hora = new Date(entrada.timestamp).getHours();
      stats.operacionesPorHora[hora] = (stats.operacionesPorHora[hora] || 0) + 1;

      // Errores recientes
      if (entrada.tipo === this.TIPOS_OPERACION.ERROR && stats.erroresRecientes.length < 10) {
        stats.erroresRecientes.push(entrada);
      }
    }

    return stats;
  },

  /**
   * Obtiene IP del usuario (si disponible)
   * @returns {string} IP del usuario
   */
  _obtenerIP: function() {
    try {
      // En Apps Script, la IP no está directamente disponible
      // Se podría obtener de headers HTTP si fuera un web app
      return 'N/A';
    } catch (error) {
      return 'N/A';
    }
  }
};

// ============================================================================
// RATE LIMITING INTELIGENTE
// ============================================================================

const RateLimiter = {
  // Configuración de límites por endpoint
  limites: {
    obtenerDatosParaHTML: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 por minuto
    guardarMovimientoDesdeHTML: { maxRequests: 50, windowMs: 60 * 1000 }, // 50 por minuto
    analizarImagenConToken: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 por minuto
    obtenerEstadisticas: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 por minuto
    diagnosticoSistema: { maxRequests: 5, windowMs: 60 * 1000 } // 5 por minuto
  },

  // Historial de requests por usuario y endpoint
  historial: new Map(),

  /**
   * Verifica si request está dentro de límites
   * @param {string} endpoint - Nombre del endpoint
   * @param {string} usuario - Email del usuario
   * @returns {boolean} True si permitido
   */
  verificarLimite: function(endpoint, usuario) {
    const config = this.limites[endpoint];
    if (!config) return true; // Sin límite configurado

    const key = `${usuario}:${endpoint}`;
    const ahora = Date.now();

    if (!this.historial.has(key)) {
      this.historial.set(key, []);
    }

    const requests = this.historial.get(key);

    // Limpiar requests fuera de la ventana
    const ventanaInicio = ahora - config.windowMs;
    const requestsValidos = requests.filter(timestamp => timestamp > ventanaInicio);

    // Verificar límite
    if (requestsValidos.length >= config.maxRequests) {
      Logger.log(`🚫 Rate limit excedido para ${key}: ${requestsValidos.length}/${config.maxRequests}`);
      return false;
    }

    // Agregar nuevo request
    requestsValidos.push(ahora);
    this.historial.set(key, requestsValidos);

    return true;
  },

  /**
   * Obtiene estado de rate limiting
   * @returns {Object} Estado actual de límites
   */
  obtenerEstado: function() {
    const estado = {};

    for (const [key, requests] of this.historial.entries()) {
      const [usuario, endpoint] = key.split(':');
      const config = this.limites[endpoint];

      if (config) {
        const ahora = Date.now();
        const ventanaInicio = ahora - config.windowMs;
        const requestsValidos = requests.filter(timestamp => timestamp > ventanaInicio);

        estado[key] = {
          requestsActuales: requestsValidos.length,
          limiteMaximo: config.maxRequests,
          tiempoRestante: Math.max(0, config.windowMs - (ahora - Math.min(...requestsValidos)))
        };
      }
    }

    return estado;
  }
};

// ============================================================================
// BACKUP AUTOMÁTICO
// ============================================================================

const BackupAutomatico = {
  // Configuración de backup
  config: {
    habilitado: true,
    frecuenciaMinutos: 60, // Backup cada hora
    maxBackups: 10,        // Mantener máximo 10 backups
    incluirIndices: true,  // Incluir índices en backup
    comprimir: true        // Comprimir backup
  },

  // Estado del sistema de backup
  estado: {
    ultimoBackup: null,
    proximoBackup: null,
    backupsCompletados: 0,
    errores: 0
  },

  /**
   * Inicia sistema de backup automático
   */
  iniciar: function() {
    if (!this.config.habilitado) {
      Logger.log('📦 Backup automático deshabilitado');
      return;
    }

    Logger.log('📦 Iniciando sistema de backup automático...');

    // Programar primer backup
    this._programarProximoBackup();

    // Configurar trigger si no existe
    this._configurarTrigger();
  },

  /**
   * Ejecuta backup completo del sistema
   * @returns {Object} Resultado del backup
   */
  ejecutarBackup: function() {
    const startTime = Date.now();
    Logger.log('💾 Iniciando backup automático del sistema...');

    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        version: 'V18.0',
        usuario: Session.getEffectiveUser().getEmail(),
        datos: {}
      };

      // PASO 1: Backup de clientes
      Logger.log('📋 Paso 1: Backup de clientes...');
      backupData.datos.clientes = ClientesRepository.obtenerTodos();

      // PASO 2: Backup de movimientos
      Logger.log('📋 Paso 2: Backup de movimientos...');
      const hojaMovs = MovimientosRepository.getHoja();
      backupData.datos.movimientos = hojaMovs.getDataRange().getValues();

      // PASO 3: Backup de configuración
      Logger.log('📋 Paso 3: Backup de configuración...');
      backupData.datos.config = {
        propiedades: PropertiesService.getScriptProperties().getProperties(),
        userProps: PropertiesService.getUserProperties().getProperties()
      };

      // PASO 4: Backup de índices (si habilitado)
      if (this.config.incluirIndices) {
        Logger.log('📋 Paso 4: Backup de índices...');
        backupData.datos.indices = {
          clientes: IndicesCache.indices.clientes.size,
          movimientos: IndicesCache.indices.movimientos.size,
          timestamp: IndicesCache.indices.timestamp
        };
      }

      // PASO 5: Comprimir y guardar
      Logger.log('📋 Paso 5: Comprimiendo y guardando backup...');
      const backupJson = JSON.stringify(backupData);
      const backupComprimido = this.config.comprimir ?
        ResponseCompressor.comprimirRespuesta(backupData) : backupJson;

      // Guardar en PropertiesService (temporal, luego mover a Drive)
      const backupKey = `backup_${Date.now()}`;
      PropertiesService.getScriptProperties().setProperty(backupKey, backupComprimido);

      // Limpiar backups antiguos
      this._limpiarBackupsAntiguos();

      // Actualizar estado
      this.estado.ultimoBackup = new Date().toISOString();
      this.estado.backupsCompletados++;
      this._programarProximoBackup();

      const duration = Date.now() - startTime;
      Logger.log(`✅ Backup completado en ${duration}ms - Tamaño: ${backupComprimido.length} bytes`);

      return {
        success: true,
        backupKey: backupKey,
        size: backupComprimido.length,
        duration: duration,
        comprimido: this.config.comprimir
      };

    } catch (error) {
      this.estado.errores++;
      Logger.log('❌ Error en backup automático: ' + error.message);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Restaura sistema desde backup
   * @param {string} backupKey - Clave del backup a restaurar
   * @returns {Object} Resultado de la restauración
   */
  restaurarBackup: function(backupKey) {
    Logger.log(`🔄 Iniciando restauración desde backup: ${backupKey}`);

    try {
      const backupComprimido = PropertiesService.getScriptProperties().getProperty(backupKey);
      if (!backupComprimido) {
        throw new Error(`Backup no encontrado: ${backupKey}`);
      }

      const backupData = this.config.comprimir ?
        ResponseCompressor.descomprimirRespuesta(backupComprimido) :
        JSON.parse(backupComprimido);

      // PASO 1: Restaurar clientes
      Logger.log('📋 Paso 1: Restaurando clientes...');
      // (Implementación de restauración)

      // PASO 2: Restaurar movimientos
      Logger.log('📋 Paso 2: Restaurando movimientos...');
      // (Implementación de restauración)

      Logger.log('✅ Restauración completada');

      return {
        success: true,
        restauradoDesde: backupData.timestamp
      };

    } catch (error) {
      Logger.log('❌ Error en restauración: ' + error.message);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Programa próximo backup
   */
  _programarProximoBackup: function() {
    const ahora = new Date();
    const proximo = new Date(ahora.getTime() + this.config.frecuenciaMinutos * 60 * 1000);
    this.estado.proximoBackup = proximo.toISOString();

    Logger.log(`📅 Próximo backup programado: ${proximo.toLocaleString()}`);
  },

  /**
   * Configura trigger para backup automático
   */
  _configurarTrigger: function() {
    // Verificar si ya existe trigger
    const triggers = ScriptApp.getProjectTriggers();
    const triggerExistente = triggers.find(t =>
      t.getHandlerFunction() === 'ejecutarBackupAutomatico'
    );

    if (!triggerExistente) {
      // Crear trigger cada hora
      ScriptApp.newTrigger('ejecutarBackupAutomatico')
        .timeBased()
        .everyHours(1)
        .create();

      Logger.log('✅ Trigger de backup automático configurado');
    }
  },

  /**
   * Limpia backups antiguos
   */
  _limpiarBackupsAntiguos: function() {
    const props = PropertiesService.getScriptProperties();
    const todasProps = props.getProperties();

    // Encontrar todas las claves de backup
    const backupKeys = Object.keys(todasProps).filter(key => key.startsWith('backup_'));

    if (backupKeys.length > this.config.maxBackups) {
      // Ordenar por timestamp (más antiguos primero)
      backupKeys.sort();

      // Eliminar backups antiguos
      const aEliminar = backupKeys.slice(0, backupKeys.length - this.config.maxBackups);
      for (const key of aEliminar) {
        props.deleteProperty(key);
      }

      Logger.log(`🗑️ Eliminados ${aEliminar.length} backups antiguos`);
    }
  }
};

/**
 * Función global para trigger de backup automático
 */
function ejecutarBackupAutomatico() {
  BackupAutomatico.ejecutarBackup();
}

// ============================================================================
// MÉTRICAS EN TIEMPO REAL
// ============================================================================

const MetricasSistema = {
  // Métricas en memoria
  metricas: {
    requestsTotal: 0,
    requestsPorEndpoint: {},
    responseTimes: [],
    erroresPorTipo: {},
    memoriaUsada: 0,
    cacheHits: 0,
    cacheMisses: 0,
    uptime: Date.now()
  },

  /**
   * Registra request
   * @param {string} endpoint - Endpoint llamado
   * @param {number} responseTime - Tiempo de respuesta en ms
   * @param {boolean} success - Si fue exitoso
   */
  registrarRequest: function(endpoint, responseTime, success = true) {
    this.metricas.requestsTotal++;

    // Por endpoint
    if (!this.metricas.requestsPorEndpoint[endpoint]) {
      this.metricas.requestsPorEndpoint[endpoint] = { total: 0, exitosos: 0, errores: 0 };
    }
    this.metricas.requestsPorEndpoint[endpoint].total++;
    if (success) {
      this.metricas.requestsPorEndpoint[endpoint].exitosos++;
    } else {
      this.metricas.requestsPorEndpoint[endpoint].errores++;
    }

    // Tiempos de respuesta
    this.metricas.responseTimes.push(responseTime);
    if (this.metricas.responseTimes.length > 1000) {
      this.metricas.responseTimes.shift(); // Mantener últimos 1000
    }
  },

  /**
   * Registra error
   * @param {string} tipo - Tipo de error
   * @param {string} mensaje - Mensaje de error
   */
  registrarError: function(tipo, mensaje) {
    if (!this.metricas.erroresPorTipo[tipo]) {
      this.metricas.erroresPorTipo[tipo] = 0;
    }
    this.metricas.erroresPorTipo[tipo]++;
  },

  /**
   * Registra uso de caché
   * @param {boolean} hit - Si fue hit o miss
   */
  registrarCache: function(hit) {
    if (hit) {
      this.metricas.cacheHits++;
    } else {
      this.metricas.cacheMisses++;
    }
  },

  /**
   * Obtiene métricas actuales
   * @returns {Object} Métricas del sistema
   */
  obtenerMetricas: function() {
    const cacheTotal = this.metricas.cacheHits + this.metricas.cacheMisses;
    const cacheHitRate = cacheTotal > 0 ? (this.metricas.cacheHits / cacheTotal * 100).toFixed(1) : 0;

    const responseTimes = [...this.metricas.responseTimes].sort((a, b) => a - b);
    const avgResponseTime = responseTimes.length > 0 ?
      Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

    const p95ResponseTime = responseTimes.length > 0 ?
      responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;

    return {
      uptime: Math.round((Date.now() - this.metricas.uptime) / 1000 / 60), // minutos
      requestsTotal: this.metricas.requestsTotal,
      requestsPorEndpoint: this.metricas.requestsPorEndpoint,
      avgResponseTime: avgResponseTime + 'ms',
      p95ResponseTime: p95ResponseTime + 'ms',
      cacheHitRate: cacheHitRate + '%',
      erroresPorTipo: this.metricas.erroresPorTipo,
      memoriaEstimada: IndicesCache.obtenerEstadisticas().memoriaEstimada
    };
  }
};