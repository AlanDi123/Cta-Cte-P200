/**
 * ============================================================================
 * CONTABILIDAD - CAJA DIARIA - SISTEMA SOL & VERDE
 * ============================================================================
 * Módulo de Caja Diaria con ciclo de vida formal (apertura / cierre /
 * reapertura), movimientos automáticos calculados desde las fuentes
 * originales (Movimientos + Transferencias), movimientos manuales con
 * validación estricta, historial inmutable y sistema de impresión por
 * PrintContext.
 *
 * Arquitectura:
 *   1. CajaDiariaRepository   → acceso a hoja CAJA_DIARIA
 *   2. CajaMovManualRepository → acceso a hoja CAJA_MOV_MANUAL
 *   3. CajaDiariaService       → lógica de negocio pura (sin I/O de hoja)
 *   4. Funciones públicas      → expuestas al frontend via google.script.run
 * ============================================================================
 */

// ============================================================================
// 1. REPOSITORIO DE CAJA DIARIA
// ============================================================================

const CajaDiariaRepository = {

  /**
   * Obtiene (o crea) la hoja CAJA_DIARIA.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.CAJA_DIARIA);

    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.CAJA_DIARIA);
      hoja.appendRow([
        'ID', 'FECHA', 'CAJA_INICIAL', 'CAJA_FINAL', 'ESTADO',
        'CAJA_SIGUIENTE', 'RAZON_REAPERTURA', 'RAZON_DIFERENCIA',
        'USUARIO', 'TIMESTAMP_APERTURA', 'TIMESTAMP_CIERRE'
      ]);
      hoja.getRange(1, 1, 1, 11)
        .setFontWeight('bold')
        .setBackground('#2E7D32')
        .setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
      // Dar formato de fecha a las columnas correspondientes
      hoja.getRange('B:B').setNumberFormat('dd/MM/yyyy');
    }

    return hoja;
  },

  /**
   * Genera un ID autoincremental.
   * @returns {number}
   */
  generarId: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;
    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    let maxId = 0;
    for (const [id] of ids) {
      if (typeof id === 'number' && id > maxId) maxId = id;
    }
    return maxId + 1;
  },

  /**
   * Convierte una fila de Sheets en un objeto Caja tipado.
   * @param {Array} fila
   * @returns {Object}
   */
  _filaAObjeto: function(fila) {
    const C = CONFIG.COLS_CAJA_DIARIA;
    const fechaVal = fila[C.FECHA];
    const tsAp = fila[C.TIMESTAMP_APERTURA];
    const tsCi = fila[C.TIMESTAMP_CIERRE];
    return {
      id:               fila[C.ID],
      fecha:            fechaVal instanceof Date ? formatearFechaLocal(fechaVal) : String(fechaVal || ''),
      cajaInicial:      Number(fila[C.CAJA_INICIAL]) || 0,
      cajaFinal:        Number(fila[C.CAJA_FINAL])   || 0,
      estado:           fila[C.ESTADO]              || CONFIG.ESTADOS_CAJA.CERRADA,
      cajaSiguiente:    Number(fila[C.CAJA_SIGUIENTE]) || 0,
      razonReapertura:  String(fila[C.RAZON_REAPERTURA] || ''),
      razonDiferencia:  String(fila[C.RAZON_DIFERENCIA] || ''),
      usuario:          String(fila[C.USUARIO] || ''),
      timestampApertura: tsAp instanceof Date ? tsAp.toISOString() : '',
      timestampCierre:   tsCi instanceof Date ? tsCi.toISOString() : ''
    };
  },

  /**
   * Obtiene todas las cajas registradas.
   * @returns {Array<Object>}
   */
  obtenerTodas: function() {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    if (datos.length <= 1) return [];
    return datos.slice(1)
      .map(fila => this._filaAObjeto(fila))
      .filter(c => c.id);
  },

  /**
   * Devuelve la caja con estado ABIERTA, o null si no existe.
   * @returns {Object|null}
   */
  obtenerActiva: function() {
    return this.obtenerTodas().find(c => c.estado === CONFIG.ESTADOS_CAJA.ABIERTA) || null;
  },

  /**
   * Busca una caja por fecha exacta (YYYY-MM-DD).
   * @param {string} fecha
   * @returns {Object|null}
   */
  obtenerPorFecha: function(fecha) {
    return this.obtenerTodas().find(c => c.fecha === fecha) || null;
  },

  /**
   * Busca una caja por ID.
   * @param {number} id
   * @returns {Object|null}
   */
  obtenerPorId: function(id) {
    return this.obtenerTodas().find(c => c.id === id) || null;
  },

  /**
   * Crea una nueva caja en la hoja.
   * @param {{ fecha: string, cajaInicial: number }} datos
   * @returns {Object} Caja creada
   */
  crear: function(datos) {
    const hoja = this.getHoja();
    const C = CONFIG.COLS_CAJA_DIARIA;
    const id = this.generarId();
    const usuario = Session.getActiveUser().getEmail();
    const ahora = new Date();

    const fila = Array(11).fill('');
    fila[C.ID]                = id;
    fila[C.FECHA]             = parsearFechaLocal(datos.fecha);
    fila[C.CAJA_INICIAL]      = datos.cajaInicial || 0;
    fila[C.CAJA_FINAL]        = 0;
    fila[C.ESTADO]            = CONFIG.ESTADOS_CAJA.ABIERTA;
    fila[C.CAJA_SIGUIENTE]    = 0;
    fila[C.RAZON_REAPERTURA]  = '';
    fila[C.RAZON_DIFERENCIA]  = '';
    fila[C.USUARIO]           = usuario;
    fila[C.TIMESTAMP_APERTURA]= ahora;
    fila[C.TIMESTAMP_CIERRE]  = '';

    hoja.appendRow(fila);

    return {
      id,
      fecha: datos.fecha,
      cajaInicial: datos.cajaInicial || 0,
      cajaFinal: 0,
      estado: CONFIG.ESTADOS_CAJA.ABIERTA,
      cajaSiguiente: 0,
      razonReapertura: '',
      razonDiferencia: '',
      usuario,
      timestampApertura: ahora.toISOString(),
      timestampCierre: ''
    };
  },

  /**
   * Actualiza campos individuales de una fila identificada por ID.
   * @param {number} id
   * @param {Object} campos - Mapa { indiceColumna: valor }
   * @returns {boolean}
   */
  actualizarFila: function(id, campos) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    const C = CONFIG.COLS_CAJA_DIARIA;
    const numColumnas = datos[0] ? datos[0].length : 20; // columnas totales de la hoja

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][C.ID] === id) {
        const filaHoja = i + 1;
        // M-02: Copiar la fila actual como base
        const filaActualizada = datos[i].slice(); // shallow copy del array

        // Aplicar todos los cambios en memoria
        for (const [col, valor] of Object.entries(campos)) {
          filaActualizada[Number(col)] = valor;
        }

        // M-02: Una única escritura para todos los campos cambiados
        hoja.getRange(filaHoja, 1, 1, numColumnas).setValues([filaActualizada]);
        return true;
      }
    }
    return false;
  }
};


// ============================================================================
// 2. REPOSITORIO DE MOVIMIENTOS MANUALES
// ============================================================================

const CajaMovManualRepository = {

  /**
   * Obtiene (o crea) la hoja CAJA_MOV_MANUAL.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.CAJA_MOV_MANUAL);

    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.CAJA_MOV_MANUAL);
      hoja.appendRow(['ID', 'CAJA_ID', 'TIPO', 'DESCRIPCION', 'MONTO', 'USUARIO', 'TIMESTAMP']);
      hoja.getRange(1, 1, 1, 7)
        .setFontWeight('bold')
        .setBackground('#FF6F00')
        .setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }

    return hoja;
  },

  /**
   * Genera un ID autoincremental.
   * @returns {number}
   */
  generarId: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;
    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
    let maxId = 0;
    for (const [id] of ids) {
      if (typeof id === 'number' && id > maxId) maxId = id;
    }
    return maxId + 1;
  },

  /**
   * Devuelve todos los movimientos manuales de una caja.
   * @param {number} cajaId
   * @returns {Array<Object>}
   */
  obtenerPorCaja: function(cajaId) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    const C = CONFIG.COLS_CAJA_MOV;
    if (datos.length <= 1) return [];

    return datos.slice(1)
      .filter(fila => fila[C.CAJA_ID] === cajaId && fila[C.ID])
      .map(fila => ({
        id:          fila[C.ID],
        cajaId:      fila[C.CAJA_ID],
        tipo:        fila[C.TIPO],
        descripcion: String(fila[C.DESCRIPCION] || ''),
        monto:       Number(fila[C.MONTO]) || 0,
        usuario:     String(fila[C.USUARIO] || ''),
        timestamp:   fila[C.TIMESTAMP] instanceof Date ? fila[C.TIMESTAMP].toISOString() : ''
      }));
  },

  /**
   * Agrega un movimiento manual a una caja.
   * @param {number} cajaId
   * @param {{ tipo: string, descripcion: string, monto: number }} mov
   * @returns {Object} Movimiento creado
   */
  agregar: function(cajaId, mov) {
    const hoja = this.getHoja();
    const C = CONFIG.COLS_CAJA_MOV;
    const id = this.generarId();
    const usuario = Session.getActiveUser().getEmail();
    const ahora = new Date();

    const fila = Array(7).fill('');
    fila[C.ID]          = id;
    fila[C.CAJA_ID]     = cajaId;
    fila[C.TIPO]        = mov.tipo;
    fila[C.DESCRIPCION] = mov.descripcion || '';
    fila[C.MONTO]       = mov.monto;
    fila[C.USUARIO]     = usuario;
    fila[C.TIMESTAMP]   = ahora;

    hoja.appendRow(fila);
    return { id, cajaId, ...mov, usuario, timestamp: ahora.toISOString() };
  },

  /**
   * Elimina un movimiento manual por ID.
   * @param {number} id
   * @returns {boolean}
   */
  eliminar: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    const C = CONFIG.COLS_CAJA_MOV;
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][C.ID] === id) {
        hoja.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  }
};


// ============================================================================
// 3. CAPA DE SERVICIO (LÓGICA DE NEGOCIO PURA — SIN I/O DE HOJA)
// ============================================================================

const CajaDiariaService = {

  /**
   * Calcula los movimientos AUTOMÁTICOS de un día, siempre desde fuente.
   * Nunca usa datos almacenados en la caja.
   *
   * Automáticos:
   *   - Pagos de clientes (HABER en MovimientosRepository)
   *   - Fiados del día   (DEBE  en MovimientosRepository)
   *   - Transferencias   (todas de la fecha, incluye A y CF)
   *
   * @param {string} fecha - Formato YYYY-MM-DD
   * @returns {Object}
   */
  calcularAutomaticos: function(fecha) {
    // Movimientos de cuenta corriente del día
    const movsDia = MovimientosRepository.obtenerPorRango(fecha, fecha);
    const detallePagos  = movsDia.filter(m => m.tipo === 'HABER');
    const detalleFiados = movsDia.filter(m => m.tipo === 'DEBE');
    const totalPagos  = detallePagos .reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totalFiados = detalleFiados.reduce((s, m) => s + (Number(m.monto) || 0), 0);

    // Transferencias del día (incluye Factura A y Consumidor Final)
    const transfersDia = TransferenciasRepository.obtenerPorFecha(fecha);
    const totalTransferencias = transfersDia.reduce((s, t) => s + (Number(t.monto) || 0), 0);

    return {
      totalPagos,
      totalFiados,
      totalTransferencias,
      detallePagos:   detallePagos .map(m => ({ cliente: m.cliente,  monto: m.monto, obs: m.obs || '' })),
      detalleFiados:  detalleFiados.map(m => ({ cliente: m.cliente,  monto: m.monto, obs: m.obs || '' })),
      detalleTransferencias: transfersDia.map(t => ({ cliente: t.cliente, monto: t.monto, banco: t.banco || '' }))
    };
  },

  /**
   * Calcula el resumen financiero completo de una caja.
   *
   * Fórmula central:
   *   cajaCalculada = cajaInicial + totalIngresos − totalEgresos − cajaSiguiente
   *   diferencia    = cajaFinal − cajaCalculada
   *
   * Ingresos: pagos + movimientosManuales HABER
   * Egresos : transferencias (van al banco) + fiados + movimientosManuales DEBE + cajaSiguiente
   *
   * @param {Object} caja         - Objeto caja (con cajaInicial, cajaFinal y cajaSiguiente)
   * @param {Array}  movManuales  - Array de movimientos manuales
   * @param {Object} automaticos  - Resultado de calcularAutomaticos()
   * @returns {Object}
   */
  calcularResumen: function(caja, movManuales, automaticos) {
    const manualHaber = movManuales
      .filter(m => m.tipo === 'HABER')
      .reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const manualDebe = movManuales
      .filter(m => m.tipo === 'DEBE')
      .reduce((s, m) => s + (Number(m.monto) || 0), 0);

    // Transferencias son EGRESO: el dinero va al banco, no queda físicamente en caja
    const totalIngresos   = automaticos.totalPagos + manualHaber;
    const totalEgresos    = automaticos.totalFiados + manualDebe + automaticos.totalTransferencias;
    // Caja del día siguiente: sale físicamente de la caja para la próxima apertura
    const cajaSiguiente   = Number(caja.cajaSiguiente) || 0;
    const cajaCalculada   = restaFinanciera(
      restaFinanciera(sumaFinanciera(caja.cajaInicial, totalIngresos), totalEgresos),
      cajaSiguiente
    );
    const cajaFinal       = Number(caja.cajaFinal) || 0;
    const diferencia      = restaFinanciera(cajaFinal, cajaCalculada);
    const hayDiferencia   = Math.abs(diferencia) >= 0.01; // umbral de 1 centavo, no 0.009

    return {
      cajaInicial:          caja.cajaInicial,
      totalPagos:           automaticos.totalPagos,
      totalFiados:          automaticos.totalFiados,
      totalTransferencias:  automaticos.totalTransferencias,
      cajaSiguiente,
      manualHaber,
      manualDebe,
      totalIngresos,
      totalEgresos,
      cajaCalculada,
      cajaFinal,
      diferencia,
      hayDiferencia
    };
  },

  /**
   * La cajaInicial siempre es editable. El valor del cajaSiguiente anterior
   * se usa como sugerencia en el frontend pero el usuario puede modificarlo.
   * @returns {boolean} Siempre true
   */
  cajaInicialEditable: function() {
    return true;
  }

};


// ============================================================================
// 4. FUNCIONES PÚBLICAS — EXPUESTAS AL FRONTEND via google.script.run
// ============================================================================

/**
 * Abre una nueva Caja Diaria.
 *
 * Reglas:
 *  - Solo puede existir UNA caja con estado ABIERTA en todo el sistema.
 *  - No puede existir otra caja para la misma fecha.
 *  - Si el cierre anterior seteó cajaSiguiente, ese valor se aplica como
 *    cajaInicial y no puede ser modificado por el usuario.
 *
 * @param {{ fecha: string, cajaInicial: number }} datos
 * @returns {{ success: boolean, caja?: Object, cajaInicialBloqueada?: boolean, error?: string }}
 */
function abrirCajaDiaria(datos) {
  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    // Verificar que no existe caja abierta
    const cajaActiva = CajaDiariaRepository.obtenerActiva();
    if (cajaActiva) {
      lock.releaseLock();
      return {
        success: false,
        error: 'Ya hay una caja abierta para el ' +
               formatearFecha(parsearFechaLocal(cajaActiva.fecha)) +
               '. Ciérrela antes de abrir una nueva.'
      };
    }

    // Verificar que no existe caja para esa fecha
    if (CajaDiariaRepository.obtenerPorFecha(datos.fecha)) {
      lock.releaseLock();
      return {
        success: false,
        error: 'Ya existe una caja registrada para esa fecha. Puede reabrirla si lo necesita.'
      };
    }

    // Evaluar cajaSiguiente del último cierre para sugerencia
    const todas = CajaDiariaRepository.obtenerTodas();
    const cerradas = todas
      .filter(c => c.estado === CONFIG.ESTADOS_CAJA.CERRADA)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const cajaSiguientePrevio = cerradas.length > 0 ? cerradas[0].cajaSiguiente : 0;
    // Usar el valor ingresado por el usuario; si no ingresó nada, usar el sugerido
    const cajaInicialEfectiva = (datos.cajaInicial > 0) ? datos.cajaInicial : (cajaSiguientePrevio || 0);
    const cajaInicialBloqueada = false; // Siempre editable

    const nueva = CajaDiariaRepository.crear({
      fecha: datos.fecha,
      cajaInicial: cajaInicialEfectiva
    });

    lock.releaseLock();

    return {
      success: true,
      caja: nueva,
      cajaInicialBloqueada,
      mensaje: 'Caja abierta correctamente'
    };

  } catch (error) {
    Logger.log('Error en abrirCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Cierra una Caja Diaria.
 *
 * Recalcula todos los movimientos automáticos desde las fuentes originales
 * (ignora cualquier caché) antes de registrar el cierre.
 *
 * @param {number} id
 * @param {{ cajaFinal: number, cajaSiguiente?: number, razonDiferencia?: string }} datos
 * @returns {{ success: boolean, resumen?: Object, requiereRazon?: boolean, error?: string }}
 */
function cerrarCajaDiaria(id, datos) {
  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const caja = CajaDiariaRepository.obtenerPorId(id);
    if (!caja) {
      lock.releaseLock();
      return { success: false, error: 'Caja no encontrada.' };
    }
    if (caja.estado !== CONFIG.ESTADOS_CAJA.ABIERTA) {
      lock.releaseLock();
      return { success: false, error: 'La caja ya está cerrada.' };
    }

    // Siempre recalcular desde fuente; incluir cajaSiguiente como egreso
    const automaticos = CajaDiariaService.calcularAutomaticos(caja.fecha);
    const movManuales  = CajaMovManualRepository.obtenerPorCaja(id);
    const resumen      = CajaDiariaService.calcularResumen(
      { ...caja, cajaFinal: datos.cajaFinal || 0, cajaSiguiente: datos.cajaSiguiente || 0 },
      movManuales,
      automaticos
    );

    // Exigir razonDiferencia si hay desfasaje
    if (resumen.hayDiferencia && !datos.razonDiferencia) {
      lock.releaseLock();
      return {
        success: false,
        requiereRazon: true,
        diferencia: resumen.diferencia,
        cajaCalculada: resumen.cajaCalculada,
        error: 'Existe una diferencia de ' + formatearMonto(resumen.diferencia) +
               '. Debe ingresar el motivo.'
      };
    }

    const C = CONFIG.COLS_CAJA_DIARIA;
    CajaDiariaRepository.actualizarFila(id, {
      [C.CAJA_FINAL]:        datos.cajaFinal || 0,
      [C.ESTADO]:            CONFIG.ESTADOS_CAJA.CERRADA,
      [C.CAJA_SIGUIENTE]:    datos.cajaSiguiente || 0,
      [C.RAZON_DIFERENCIA]:  datos.razonDiferencia || '',
      [C.TIMESTAMP_CIERRE]:  new Date()
    });

    // M-06: Auditoría de cierre de caja
    AuditLogger.registrar({
      modulo:      'CONTABILIDAD',
      operacion:   'CERRAR_CAJA',
      entidadId:   id,
      entidadDesc: 'Caja fecha: ' + caja.fecha,
      antes:       { estado: 'ABIERTA' },
      despues:     { estado: 'CERRADA', cajaFinal: datos.cajaFinal || 0, diferencia: resumen.diferencia },
      montoImpacto: datos.cajaFinal || 0
    });

    lock.releaseLock();
    return { success: true, resumen, mensaje: 'Caja cerrada correctamente.' };

  } catch (error) {
    Logger.log('Error en cerrarCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Reabre una Caja Diaria cerrada.
 *
 * Reglas:
 *  - La razón de reapertura es OBLIGATORIA (mínimo 3 caracteres).
 *  - No puede existir otra caja ABIERTA en el sistema.
 *
 * @param {number} id
 * @param {string} razon
 * @returns {{ success: boolean, error?: string }}
 */
function reabrirCajaDiaria(id, razon) {
  if (!razon || razon.trim().length < 3) {
    return { success: false, error: 'Debe ingresar una razón para reabrir la caja (mínimo 3 caracteres).' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const caja = CajaDiariaRepository.obtenerPorId(id);
    if (!caja) {
      lock.releaseLock();
      return { success: false, error: 'Caja no encontrada.' };
    }
    if (caja.estado !== CONFIG.ESTADOS_CAJA.CERRADA) {
      lock.releaseLock();
      return { success: false, error: 'La caja ya está abierta.' };
    }

    // Verificación de caja activa DENTRO del lock para evitar race condition
    const cajaActiva = CajaDiariaRepository.obtenerActiva();
    if (cajaActiva && cajaActiva.id !== id) {
      lock.releaseLock();
      return {
        success: false,
        error: 'Existe otra caja abierta (fecha: ' + cajaActiva.fecha + '). Ciérrela primero.'
      };
    }

    const C = CONFIG.COLS_CAJA_DIARIA;
    CajaDiariaRepository.actualizarFila(id, {
      [C.ESTADO]:           CONFIG.ESTADOS_CAJA.ABIERTA,
      [C.RAZON_REAPERTURA]: razon.trim(),
      [C.CAJA_FINAL]:       0,
      [C.TIMESTAMP_CIERRE]: ''
    });

    lock.releaseLock();
    Logger.log('[CONTABILIDAD] Caja #' + id + ' reabierta. Razón: ' + razon.trim());
    return { success: true, mensaje: 'Caja reabierta correctamente.' };

  } catch (error) {
    lock.releaseLock();
    Logger.log('Error en reabrirCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Agrega un movimiento MANUAL a una caja abierta.
 *
 * Reglas estrictas:
 *  - La caja debe estar ABIERTA.
 *  - El monto debe ser estrictamente mayor a 0 (montos negativos prohibidos).
 *  - El tipo debe ser 'HABER' (ingreso) o 'DEBE' (egreso).
 *
 * @param {number} cajaId
 * @param {{ tipo: string, descripcion: string, monto: number }} mov
 * @returns {{ success: boolean, movimiento?: Object, error?: string }}
 */
function agregarMovimientoCajaDiaria(cajaId, mov) {
  try {
    const caja = CajaDiariaRepository.obtenerPorId(cajaId);
    if (!caja) return { success: false, error: 'Caja no encontrada.' };
    if (caja.estado !== CONFIG.ESTADOS_CAJA.ABIERTA) {
      return { success: false, error: 'No se pueden agregar movimientos a una caja cerrada.' };
    }

    const monto = Number(mov.monto);
    if (isNaN(monto) || monto <= 0) {
      return {
        success: false,
        error: 'El monto debe ser mayor a cero. Los importes negativos o cero están prohibidos.'
      };
    }
    if (mov.tipo !== 'HABER' && mov.tipo !== 'DEBE') {
      return { success: false, error: 'Tipo inválido. Use HABER (ingreso) o DEBE (egreso).' };
    }
    if (!mov.descripcion || !mov.descripcion.trim()) {
      return { success: false, error: 'La descripción del movimiento es obligatoria.' };
    }

    const resultado = CajaMovManualRepository.agregar(cajaId, { ...mov, monto });
    return { success: true, movimiento: resultado };

  } catch (error) {
    Logger.log('Error en agregarMovimientoCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina un movimiento manual de una caja ABIERTA.
 *
 * @param {number} movId
 * @param {number} cajaId
 * @returns {{ success: boolean, error?: string }}
 */
function eliminarMovimientoCajaDiaria(movId, cajaId) {
  try {
    const caja = CajaDiariaRepository.obtenerPorId(cajaId);
    if (!caja) return { success: false, error: 'Caja no encontrada.' };
    if (caja.estado !== CONFIG.ESTADOS_CAJA.ABIERTA) {
      return { success: false, error: 'No se pueden eliminar movimientos de una caja cerrada.' };
    }

    const ok = CajaMovManualRepository.eliminar(movId);
    return ok
      ? { success: true }
      : { success: false, error: 'Movimiento no encontrado.' };

  } catch (error) {
    Logger.log('Error en eliminarMovimientoCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene la caja activa con todos sus datos hidratados.
 * Siempre recalcula los movimientos automáticos desde fuente.
 *
 * @returns {{ success: boolean, caja: Object|null, error?: string }}
 */
function obtenerCajaDiariaActiva() {
  try {
    const caja = CajaDiariaRepository.obtenerActiva();
    if (!caja) return { success: true, caja: null };

    const automaticos       = CajaDiariaService.calcularAutomaticos(caja.fecha);
    const movManuales       = CajaMovManualRepository.obtenerPorCaja(caja.id);
    const resumen           = CajaDiariaService.calcularResumen(caja, movManuales, automaticos);
    const cajaInicialEditable = CajaDiariaService.cajaInicialEditable();

    return {
      success: true,
      caja: { ...caja, movManuales, automaticos, resumen, cajaInicialEditable }
    };

  } catch (error) {
    Logger.log('Error en obtenerCajaDiariaActiva: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el detalle completo de una caja por ID.
 * Siempre recalcula los automáticos desde fuente (cubre el caso de
 * transferencias editadas o eliminadas DESPUÉS del cierre).
 *
 * @param {number} id
 * @returns {{ success: boolean, caja?: Object, error?: string }}
 */
function obtenerDetalleCajaDiaria(id) {
  try {
    const caja = CajaDiariaRepository.obtenerPorId(id);
    if (!caja) return { success: false, error: 'Caja no encontrada.' };

    const automaticos = CajaDiariaService.calcularAutomaticos(caja.fecha);
    const movManuales  = CajaMovManualRepository.obtenerPorCaja(id);
    const resumen      = CajaDiariaService.calcularResumen(caja, movManuales, automaticos);

    return {
      success: true,
      caja: { ...caja, movManuales, automaticos, resumen }
    };

  } catch (error) {
    Logger.log('Error en obtenerDetalleCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el historial de cajas ordenado del más reciente al más antiguo.
 * No incluye movimientos detallados (optimizado para listado).
 *
 * @param {number} [limite] - 0 = sin límite
 * @returns {{ success: boolean, cajas: Array, total: number, error?: string }}
 */
function obtenerHistorialCajaDiaria(limite) {
  try {
    const todas = CajaDiariaRepository.obtenerTodas();
    const ordenadas = todas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const resultado  = (limite && limite > 0) ? ordenadas.slice(0, limite) : ordenadas;

    return { success: true, cajas: resultado, total: todas.length };

  } catch (error) {
    Logger.log('Error en obtenerHistorialCajaDiaria: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza la cajaInicial de una caja ABIERTA.
 * Sólo permitido si el día anterior NO seteó cajaSiguiente.
 *
 * @param {number} cajaId
 * @param {number} cajaInicial
 * @returns {{ success: boolean, error?: string }}
 */
function actualizarCajaInicial(cajaId, cajaInicial) {
  try {
    const caja = CajaDiariaRepository.obtenerPorId(cajaId);
    if (!caja) return { success: false, error: 'Caja no encontrada.' };
    if (caja.estado !== CONFIG.ESTADOS_CAJA.ABIERTA) {
      return { success: false, error: 'No se puede editar una caja cerrada.' };
    }

    const C = CONFIG.COLS_CAJA_DIARIA;
    CajaDiariaRepository.actualizarFila(cajaId, { [C.CAJA_INICIAL]: Number(cajaInicial) || 0 });
    return { success: true };

  } catch (error) {
    Logger.log('Error en actualizarCajaInicial: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Devuelve las descripciones únicas de los movimientos manuales previos.
 * Usado para autocompletar en el modal de nuevo movimiento.
 *
 * @returns {{ success: boolean, descripciones: Array<string>, error?: string }}
 */
function obtenerDescripcionesMovManual() {
  try {
    const hoja = CajaMovManualRepository.getHoja();
    const datos = hoja.getDataRange().getValues();
    const C = CONFIG.COLS_CAJA_MOV;

    if (datos.length <= 1) return { success: true, descripciones: [] };

    const set = new Set();
    for (let i = 1; i < datos.length; i++) {
      const desc = String(datos[i][C.DESCRIPCION] || '').trim();
      if (desc) set.add(desc);
    }

    const descripciones = Array.from(set).sort();
    return { success: true, descripciones };

  } catch (error) {
    Logger.log('Error en obtenerDescripcionesMovManual: ' + error.message);
    return { success: false, descripciones: [], error: error.message };
  }
}
