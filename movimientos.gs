/**
 * ============================================================================
 * REPOSITORIO DE MOVIMIENTOS - SISTEMA SOL & VERDE
 * ============================================================================
 * Gestion de movimientos: FIADO (DEBE) y PAGO (HABER)
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
      hoja.appendRow(['ID', 'FECHA', 'CLIENTE', 'TIPO', 'MONTO', 'SALDO_POST', 'OBS', 'USUARIO']);
      hoja.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#27AE60').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
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

    if (datos.length <= 1) return 1;

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
   * Registra un movimiento
   * DEBE (FIADO) = aumenta saldo del cliente
   * HABER (PAGO) = disminuye saldo del cliente
   * @param {Object} movimientoData - Datos del movimiento
   * @returns {Object} Movimiento registrado
   */
  registrar: function(movimientoData) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(30000);

      // Validar datos
      const validacion = validarMovimiento(movimientoData);
      if (!validacion.valid) {
        throw new Error('Movimiento invalido: ' + validacion.errors.join(', '));
      }

      const clienteNorm = normalizarString(movimientoData.cliente);

      // Verificar que el cliente exista
      const cliente = ClientesRepository.buscarPorNombre(clienteNorm);
      if (!cliente) {
        throw new Error('Cliente no encontrado: ' + clienteNorm);
      }

      // Calcular nuevo saldo
      // DEBE (FIADO) = cliente nos debe mas = aumenta saldo
      // HABER (PAGO) = cliente pago = disminuye saldo
      const saldoAnterior = cliente.saldo;
      let nuevoSaldo;

      if (movimientoData.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        nuevoSaldo = saldoAnterior + movimientoData.monto;
      } else {
        nuevoSaldo = saldoAnterior - movimientoData.monto;
      }

      // Registrar movimiento
      const hoja = this.getHoja();
      const nuevoID = this.generarNuevoID();
      const fecha = movimientoData.fecha ? parsearFechaLocal(movimientoData.fecha) : new Date();
      const usuario = Session.getActiveUser().getEmail();

      const nuevaFila = [
        nuevoID,
        fecha,
        clienteNorm,
        movimientoData.tipo,
        movimientoData.monto,
        nuevoSaldo,
        movimientoData.obs || '',
        usuario
      ];

      hoja.appendRow(nuevaFila);

      // Actualizar saldo del cliente
      ClientesRepository.actualizarSaldoYContadores(clienteNorm, nuevoSaldo, fecha);

      lock.releaseLock();

      return {
        id: nuevoID,
        fecha: formatearFechaLocal(fecha),
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
   * Registra multiples movimientos (para Visual Reasoning)
   * @param {Array<Object>} movimientos - Array de movimientos
   * @returns {Object} {exitosos: Array, errores: Array}
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
   * Obtiene los movimientos mas recientes
   * @param {number} limite - Cantidad maxima
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerRecientes: function(limite = 50) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    // Leer solo las ultimas filas necesarias
    const rowsToRead = Math.min(limite + 10, lastRow - 1);
    const startRow = Math.max(2, lastRow - rowsToRead + 1);
    const datos = hoja.getRange(startRow, 1, rowsToRead, 8).getValues();

    const movimientos = [];

    // Recorrer desde el final (mas recientes primero)
    for (let i = datos.length - 1; i >= 0 && movimientos.length < limite; i--) {
      const fila = datos[i];
      if (!fila[CONFIG.COLS_MOVS.ID]) continue;

      const fecha = fila[CONFIG.COLS_MOVS.FECHA];

      movimientos.push({
        id: fila[CONFIG.COLS_MOVS.ID],
        fecha: fecha instanceof Date ? formatearFechaLocal(fecha) : fecha,
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
          fecha: fecha instanceof Date ? formatearFechaLocal(fecha) : fecha,
          cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
          tipo: fila[CONFIG.COLS_MOVS.TIPO],
          monto: fila[CONFIG.COLS_MOVS.MONTO],
          saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
          obs: fila[CONFIG.COLS_MOVS.OBS] || '',
          usuario: fila[CONFIG.COLS_MOVS.USUARIO] || ''
        });
      }
    }

    // Ordenar por ID descendente
    movimientos.sort((a, b) => b.id - a.id);

    return movimientos;
  },

  /**
   * Obtiene movimientos por rango de fechas
   * @param {Date|string} desde - Fecha inicio
   * @param {Date|string} hasta - Fecha fin
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerPorRango: function(desde, hasta) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return [];

    const fechaDesde = parsearFechaLocal(desde);
    const fechaHasta = parsearFechaLocal(hasta);
    fechaDesde.setHours(0, 0, 0, 0);
    fechaHasta.setHours(23, 59, 59, 999);

    const movimientos = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const fechaMov = parsearFechaLocal(fila[CONFIG.COLS_MOVS.FECHA]);

      if (fechaMov >= fechaDesde && fechaMov <= fechaHasta) {
        movimientos.push({
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fila[CONFIG.COLS_MOVS.FECHA] instanceof Date ? formatearFechaLocal(fila[CONFIG.COLS_MOVS.FECHA]) : fila[CONFIG.COLS_MOVS.FECHA],
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
  },

  /**
   * Busca un movimiento por ID
   * @param {number} id - ID del movimiento
   * @returns {Object|null} Movimiento encontrado o null
   */
  buscarPorId: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG.COLS_MOVS.ID] === id) {
        const fila = datos[i];
        const fecha = fila[CONFIG.COLS_MOVS.FECHA];
        return {
          id: fila[CONFIG.COLS_MOVS.ID],
          fecha: fecha instanceof Date ? formatearFechaLocal(fecha) : fecha,
          cliente: fila[CONFIG.COLS_MOVS.CLIENTE],
          tipo: fila[CONFIG.COLS_MOVS.TIPO],
          monto: fila[CONFIG.COLS_MOVS.MONTO],
          saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
          obs: fila[CONFIG.COLS_MOVS.OBS] || '',
          usuario: fila[CONFIG.COLS_MOVS.USUARIO] || '',
          fila: i + 1
        };
      }
    }

    return null;
  },

  /**
   * Edita un movimiento existente
   * @param {number} id - ID del movimiento
   * @param {Object} datos - Datos a actualizar (monto, obs)
   * @returns {Object} Movimiento actualizado
   */
  editar: function(id, datos) {
    const mov = this.buscarPorId(id);
    if (!mov) {
      throw new Error('Movimiento no encontrado: ' + id);
    }

    const hoja = this.getHoja();
    const fila = mov.fila;

    // Solo permitir editar monto y observaciones
    if (datos.monto !== undefined && esMontoValido(datos.monto)) {
      const diferencia = datos.monto - mov.monto;

      // Recalcular saldo del cliente
      const cliente = ClientesRepository.buscarPorNombre(mov.cliente);
      if (cliente) {
        let nuevoSaldoCliente;
        if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
          nuevoSaldoCliente = cliente.saldo + diferencia;
        } else {
          nuevoSaldoCliente = cliente.saldo - diferencia;
        }

        hoja.getRange(fila, CONFIG.COLS_MOVS.MONTO + 1).setValue(datos.monto);

        // Actualizar saldo en cliente
        const hojaClientes = ClientesRepository.getHoja();
        hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldoCliente);
      }
    }

    if (datos.obs !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_MOVS.OBS + 1).setValue(datos.obs);
    }

    return this.buscarPorId(id);
  },

  /**
   * Elimina un movimiento y recalcula el saldo del cliente
   * @param {number} id - ID del movimiento
   */
  eliminar: function(id) {
    const mov = this.buscarPorId(id);
    if (!mov) {
      throw new Error('Movimiento no encontrado: ' + id);
    }

    // Recalcular saldo del cliente
    const cliente = ClientesRepository.buscarPorNombre(mov.cliente);
    if (cliente) {
      let nuevoSaldoCliente;
      if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        nuevoSaldoCliente = cliente.saldo - mov.monto;
      } else {
        nuevoSaldoCliente = cliente.saldo + mov.monto;
      }

      // Actualizar saldo en cliente
      const hojaClientes = ClientesRepository.getHoja();
      hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldoCliente);
    }

    // Eliminar fila
    const hoja = this.getHoja();
    hoja.deleteRow(mov.fila);
  },

  /**
   * Elimina todos los movimientos de un cliente
   * @param {string} nombreCliente - Nombre del cliente
   */
  eliminarPorCliente: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    // Recorrer de abajo hacia arriba
    for (let i = datos.length - 1; i >= 1; i--) {
      const clienteFila = normalizarString(datos[i][CONFIG.COLS_MOVS.CLIENTE]);
      if (clienteFila === nombreNorm) {
        hoja.deleteRow(i + 1);
      }
    }
  },

  /**
   * Recalcula todos los saldos de clientes basandose en movimientos
   * @returns {Object} {clientesActualizados: number}
   */
  recalcularTodosSaldos: function() {
    const clientes = ClientesRepository.obtenerTodos();
    let actualizados = 0;
    let omitidos = 0;

    for (const cliente of clientes) {
      const movimientos = this.obtenerPorCliente(cliente.nombre);

      // PROTECCION: si el cliente no tiene movimientos registrados en el sistema,
      // NO tocar su saldo. El saldo actual en la base de datos es el correcto
      // y solo puede ser modificado por movimientos o ediciones del usuario.
      if (movimientos.length === 0) {
        omitidos++;
        continue;
      }

      let saldoCalculado = 0;
      for (const mov of movimientos) {
        if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
          saldoCalculado += mov.monto;
        } else {
          saldoCalculado -= mov.monto;
        }
      }

      if (saldoCalculado !== cliente.saldo) {
        const clienteData = ClientesRepository.buscarPorNombre(cliente.nombre);
        if (clienteData) {
          const hoja = ClientesRepository.getHoja();
          hoja.getRange(clienteData.fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(saldoCalculado);
          actualizados++;
        }
      }
    }

    return { clientesActualizados: actualizados, omitidosSinMovimientos: omitidos };
  },

  /**
   * Calcula el saldo de un cliente al final de una fecha específica (histórico)
   * Suma todos los movimientos hasta e incluyendo esa fecha
   * @param {string} nombreCliente - Nombre del cliente
   * @param {Date|string} fecha - Fecha hasta la cual calcular
   * @returns {number} Saldo calculado
   */
  calcularSaldoAlFecha: function(nombreCliente, fecha) {
    const nombreNorm = normalizarString(nombreCliente);
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return 0;

    const fechaLimite = parsearFechaLocal(fecha);
    fechaLimite.setHours(23, 59, 59, 999);

    let saldo = 0;

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const clienteFila = normalizarString(fila[CONFIG.COLS_MOVS.CLIENTE]);

      if (clienteFila !== nombreNorm) continue;

      const fechaMov = parsearFechaLocal(fila[CONFIG.COLS_MOVS.FECHA]);
      if (fechaMov > fechaLimite) continue;

      const monto = fila[CONFIG.COLS_MOVS.MONTO] || 0;
      const tipo = fila[CONFIG.COLS_MOVS.TIPO];

      if (tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        saldo += monto;
      } else {
        saldo -= monto;
      }
    }

    return saldo;
  },

  /**
   * Calcula los saldos históricos de todos los clientes al final de una fecha
   * @param {Date|string} fecha - Fecha hasta la cual calcular
   * @returns {Object} {nombreCliente: saldo}
   */
  calcularSaldosHistoricos: function(fecha) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    if (datos.length <= 1) return {};

    const fechaLimite = parsearFechaLocal(fecha);
    fechaLimite.setHours(23, 59, 59, 999);

    const saldos = {};

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const cliente = fila[CONFIG.COLS_MOVS.CLIENTE];
      if (!cliente) continue;

      const fechaMov = parsearFechaLocal(fila[CONFIG.COLS_MOVS.FECHA]);
      if (fechaMov > fechaLimite) continue;

      if (!saldos[cliente]) saldos[cliente] = 0;

      const monto = fila[CONFIG.COLS_MOVS.MONTO] || 0;
      const tipo = fila[CONFIG.COLS_MOVS.TIPO];

      if (tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        saldos[cliente] += monto;
      } else {
        saldos[cliente] -= monto;
      }
    }

    return saldos;
  },

  /**
   * Actualiza el nombre del cliente en todos sus movimientos
   * @param {string} nombreAnterior - Nombre actual del cliente
   * @param {string} nombreNuevo - Nuevo nombre del cliente
   * @returns {number} Cantidad de movimientos actualizados
   */
  actualizarNombreCliente: function(nombreAnterior, nombreNuevo) {
    const nombreAntNorm = normalizarString(nombreAnterior);
    const nombreNuevoNorm = normalizarString(nombreNuevo);

    if (nombreAntNorm === nombreNuevoNorm) return 0;

    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    let actualizados = 0;

    for (let i = 1; i < datos.length; i++) {
      const clienteFila = normalizarString(datos[i][CONFIG.COLS_MOVS.CLIENTE]);
      if (clienteFila === nombreAntNorm) {
        hoja.getRange(i + 1, CONFIG.COLS_MOVS.CLIENTE + 1).setValue(nombreNuevoNorm);
        actualizados++;
      }
    }

    return actualizados;
  },

  /**
   * Obtiene estadisticas de movimientos
   * @returns {Object} Estadisticas
   */
  obtenerEstadisticas: function() {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    let totalMovimientos = 0;
    let totalFiados = 0;
    let totalPagos = 0;
    let montoFiados = 0;
    let montoPagos = 0;

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      if (!fila[CONFIG.COLS_MOVS.ID]) continue;

      totalMovimientos++;
      const monto = fila[CONFIG.COLS_MOVS.MONTO] || 0;

      if (fila[CONFIG.COLS_MOVS.TIPO] === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
        totalFiados++;
        montoFiados += monto;
      } else {
        totalPagos++;
        montoPagos += monto;
      }
    }

    return {
      totalMovimientos,
      totalFiados,
      totalPagos,
      montoFiados,
      montoPagos,
      saldoNeto: montoFiados - montoPagos
    };
  }
};
