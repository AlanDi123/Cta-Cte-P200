/**
 * ============================================================================
 * MOVIMIENTOS REPOSITORY - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: movimientos.js
 * Descripción: Lógica de acceso a datos para movimientos
 *
 * ============================================================================
 */

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
   * @param {number} limite - Cantidad máxima de movimientos (0 = todos sin límite)
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerRecientes: function(limite) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return []; // Solo encabezados o vacío

    // FIX: Soporte para limite = 0 (sin límite, cargar todos)
    const sinLimite = (limite === 0 || limite === undefined);
    
    if (sinLimite) {
      // Cargar TODOS los movimientos (para export, backup, etc.)
      const datos = hoja.getRange(2, 1, lastRow - 1, 8).getValues();
      const movimientos = [];
      
      for (let i = datos.length - 1; i >= 0; i--) {
        const fila = datos[i];
        const fecha = fila[CONFIG.COLS_MOVS.FECHA];
        if (!fila[CONFIG.COLS_MOVS.ID]) continue;
        
        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fecha instanceof Date ? fecha.toISOString() : fecha,
          cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
          tipo: fila[CONFIG.COLS_MOVS.TIPO],
          monto: fila[CONFIG.COLS_MOVS.MONTO],
          saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
          obs: fila[CONFIG.COLS_MOVS.OBS] || '',
          usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
        });
      }
      
      return movimientos;
    }

    // PERFORMANCE FIX: For limited queries, read only last N+buffer rows
    // Buffer of 50% extra to ensure we get all we need
    const buffer = Math.ceil(limite * 1.5);
    const rowsToRead = Math.min(buffer, lastRow - 1);
    const startRow = Math.max(2, lastRow - rowsToRead + 1);

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
        fecha: fecha instanceof Date ? fecha.toISOString() : fecha,
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