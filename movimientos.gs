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
   * Genera un nuevo ID autoincremental.
   *
   * NO toma el candado: debe invocarse DENTRO de la seccion critica del
   * llamador, que es quien lo tiene.
   *
   * Antes lo tomaba y lo liberaba por su cuenta. Como LockService.getScriptLock()
   * devuelve SIEMPRE el mismo candado de script, ese releaseLock() liberaba el
   * candado que ya tenia registrar(): desde ahi la escritura de la fila y la
   * actualizacion del saldo corrian sin proteccion, y dos movimientos
   * simultaneos podian tomar el mismo ID y pisarse el saldo mutuamente.
   *
   * Lee solo la columna de ID en lugar de la hoja entera (8 columnas).
   *
   * @returns {number} Nuevo ID
   */
  generarNuevoID: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;

    const ids = hoja.getRange(2, CONFIG.COLS_MOVS.ID + 1, lastRow - 1, 1).getValues();
    let maxId = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i][0];
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
    let lockAdquirido = false;

    try {
      lock.waitLock(30000);
      lockAdquirido = true;

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
        nuevoSaldo = sumaFinanciera(saldoAnterior, movimientoData.monto);
      } else {
        nuevoSaldo = restaFinanciera(saldoAnterior, movimientoData.monto);
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

      // M-05: reintento seguro ante fallos transitorios de Sheets.
      //
      // Se escribe en una fila calculada con setValues en lugar de appendRow.
      // Motivo: conRetry sobre appendRow podia DUPLICAR el movimiento — si la
      // fila se escribia pero la respuesta expiraba con un error considerado
      // reintentable ('timeout', 'service spreadsheets failed'), el reintento
      // insertaba una segunda fila y el fiado quedaba contado dos veces.
      // Escribir en una fila fija es idempotente: reintentar solo reescribe
      // los mismos valores en el mismo lugar. La fila se calcula una sola vez,
      // fuera del reintento, y es estable porque tenemos el candado tomado.
      const filaDestino = hoja.getLastRow() + 1;
      conRetry(() => hoja.getRange(filaDestino, 1, 1, nuevaFila.length).setValues([nuevaFila]),
        { contexto: 'MOV.registrar.escribirFila', maxIntentos: 3 });

      // Igual criterio: se pasa el total ABSOLUTO en lugar de dejar que el
      // repositorio incremente. Con un incremento, un reintento sumaba 2.
      const totalMovsNuevo = (Number(cliente.totalMovs) || 0) + 1;
      conRetry(() => ClientesRepository.actualizarSaldoYContadores(clienteNorm, nuevoSaldo, fecha, totalMovsNuevo),
        { contexto: 'MOV.registrar.actualizarCliente', maxIntentos: 3 });

      // El historial cacheado de este cliente quedo obsoleto
      RequestCache.invalidar('movimientos_cliente_' + clienteNorm);

      // M-06: Auditoría — fire and forget (no bloquea)
      AuditLogger.registrar({
        modulo:      'MOVIMIENTOS',
        operacion:   'CREAR',
        entidadId:   nuevoID,
        entidadDesc: 'Cliente: ' + clienteNorm + ' | Tipo: ' + movimientoData.tipo,
        antes:       { saldo: saldoAnterior },
        despues:     { saldo: nuevoSaldo, monto: movimientoData.monto, tipo: movimientoData.tipo },
        montoImpacto: movimientoData.monto
      });

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

    } finally {
      // Solo se libera si de verdad se tomo. Antes se llamaba a releaseLock()
      // dentro del catch: si waitLock habia expirado, el candado nunca se
      // habia tomado y releaseLock() lanzaba SU PROPIA excepcion, que
      // reemplazaba el error real ("no se pudo tomar el candado") por uno
      // generico e incomprensible.
      if (lockAdquirido) lock.releaseLock();
    }
  },

  /**
   * Registra multiples movimientos (para Visual Reasoning)
   * @param {Array<Object>} movimientos - Array de movimientos
   * @returns {Object} {exitosos: Array, errores: Array}
   */
  registrarLote: function(movimientos) {
    Logger.log('[MOVIMIENTOS] Iniciando registrarLote: ' + movimientos.length + ' movimientos');
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
        Logger.log('[MOVIMIENTOS] Error en lote índice ' + i + ': ' + error.message);
        resultados.errores.push({
          movimiento: mov,
          error: error.message,
          indice: i
        });
      }
    }

    Logger.log('[MOVIMIENTOS] registrarLote completado: ' + resultados.exitosos.length + ' exitosos, ' + resultados.errores.length + ' errores');
    return resultados;
  },

  /**
   * Obtiene movimientos. limite=0 → carga TODOS sin restricción.
   * @param {number} limite - 0 = todos, >0 = últimos N
   */
  obtenerRecientes: function(limite) {
    // Normalizar: undefined/null → 0 (cargar todos)
    if (limite === undefined || limite === null) limite = 0;
    limite = parseInt(limite) || 0;

    var hoja    = this.getHoja();
    var lastRow = hoja.getLastRow();
    if (lastRow <= 1) return [];

    var numRows = lastRow - 1;
    var cargarTodos = limite <= 0;

    // Parcial: leer solo las últimas N filas de datos (constante en tiempo vs tamaño total).
    var rowsToRead = cargarTodos ? numRows : Math.min(limite, numRows);
    var startRow = cargarTodos ? 2 : Math.max(2, lastRow - rowsToRead + 1);

    var datos = hoja.getRange(startRow, 1, rowsToRead, 8).getValues();
    var movimientos = [];

    // Recorrer desde el final (más recientes primero)
    for (var i = datos.length - 1; i >= 0; i--) {
      // Si tiene límite y ya alcanzamos el máximo, cortar
      if (!cargarTodos && movimientos.length >= limite) break;

      var fila = datos[i];
      if (!fila[CONFIG.COLS_MOVS.ID]) continue;

      var fecha = fila[CONFIG.COLS_MOVS.FECHA];
      movimientos.push({
        id:       fila[CONFIG.COLS_MOVS.ID],
        fecha:    fecha instanceof Date ? formatearFechaLocal(fecha) : fecha,
        cliente:  fila[CONFIG.COLS_MOVS.CLIENTE],
        tipo:     fila[CONFIG.COLS_MOVS.TIPO],
        monto:    fila[CONFIG.COLS_MOVS.MONTO],
        saldoPost: fila[CONFIG.COLS_MOVS.SALDO_POST],
        obs:      fila[CONFIG.COLS_MOVS.OBS]    || '',
        usuario:  fila[CONFIG.COLS_MOVS.USUARIO] || ''
      });
    }

    return movimientos;
  },

  /**
   * Obtiene todos los movimientos de un cliente
   * OPTIMIZADO: Usa caché RequestCache para máxima velocidad
   * @param {string} nombreCliente - Nombre del cliente
   * @returns {Array<Object>} Array de movimientos
   */
  obtenerPorCliente: function(nombreCliente) {
    const nombreNorm = normalizarString(nombreCliente);
    
    // OPTIMIZACIÓN: Intentar primero con caché RequestCache
    const cacheKey = 'movimientos_cliente_' + nombreNorm;
    const cached = RequestCache.get(cacheKey);
    
    if (cached !== undefined && Array.isArray(cached)) {
      // Retornar desde caché (más rápido)
      return cached;
    }
    
    // Fallback: búsqueda directa en la hoja (más lento pero seguro)
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    // Leer todas las filas explícitamente
    const numColumnas = 8;
    const datos = hoja.getRange(2, 1, lastRow - 1, numColumnas).getValues();

    const movimientos = [];

    for (let i = 0; i < datos.length; i++) {
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
    
    // Guardar en caché para próximas consultas
    RequestCache.set(cacheKey, movimientos);

    return movimientos;
  },

  /**
   * Obtiene un tramo de los movimientos de un cliente, sin transferir el resto.
   * Reutiliza obtenerPorCliente (que ya cachea en RequestCache y ordena por ID
   * descendente), de modo que pedir varios tramos en la misma ejecucion no
   * vuelve a leer la hoja.
   *
   * El resumen (ultimoPago / ultimoFiado) se calcula sobre la lista COMPLETA,
   * no sobre el tramo devuelto: de lo contrario, un cliente cuyo ultimo pago
   * sea mas viejo que el tramo visible mostraria "-" de forma incorrecta.
   *
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} limite - Cantidad a devolver. 0 = todos
   * @param {number} offset - Desde que posicion (0 = el mas reciente)
   * @returns {Object} {movimientos, total, offset, limite, hayMas, ultimoPago, ultimoFiado}
   */
  obtenerPorClientePaginado: function(nombreCliente, limite, offset) {
    const todos = this.obtenerPorCliente(nombreCliente);
    const total = todos.length;

    let desde = parseInt(offset, 10);
    if (isNaN(desde) || desde < 0) desde = 0;

    let cantidad = parseInt(limite, 10);
    if (isNaN(cantidad) || cantidad < 0) cantidad = 0; // 0 = todos

    const pagina = (cantidad === 0)
      ? todos.slice(desde)
      : todos.slice(desde, desde + cantidad);

    // Resumen sobre la lista completa (viene ordenada del mas reciente al mas viejo)
    let ultimoPago = null;
    let ultimoFiado = null;
    for (let i = 0; i < total; i++) {
      const tipo = todos[i].tipo;
      if (!ultimoPago && tipo === CONFIG.TIPOS_MOVIMIENTO.HABER) ultimoPago = todos[i].fecha;
      if (!ultimoFiado && tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) ultimoFiado = todos[i].fecha;
      if (ultimoPago && ultimoFiado) break;
    }

    return {
      movimientos: pagina,
      total: total,
      offset: desde,
      limite: cantidad,
      hayMas: (desde + pagina.length) < total,
      ultimoPago: ultimoPago,
      ultimoFiado: ultimoFiado
    };
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
   * True si la fecha del movimiento es de un mes anterior al actual (no editable).
   * @param {Date|string} fechaMov
   * @returns {boolean}
   */
  _fechaEnMesCerrado: function(fechaMov) {
    if (!fechaMov) return false;
    const d = fechaMov instanceof Date ? new Date(fechaMov) : parsearFechaLocal(String(fechaMov));
    if (isNaN(d.getTime())) return false;
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    d.setHours(0, 0, 0, 0);
    inicioMesActual.setHours(0, 0, 0, 0);
    return d < inicioMesActual;
  },

  /**
   * Edita un movimiento existente
   * @param {number} id - ID del movimiento
   * @param {Object} datos - Datos a actualizar (monto, obs)
   * @returns {Object} Movimiento actualizado
   */
  editar: function(id, datos) {
    const lock = LockService.getScriptLock();
    let lockAdquirido = false;
    try {
      lock.waitLock(30000);
      lockAdquirido = true;

      const mov = this.buscarPorId(id);
      if (!mov) {
        throw new Error('Movimiento no encontrado: ' + id);
      }

      if (this._fechaEnMesCerrado(mov.fecha)) {
        throw new Error('El mes de este movimiento ya está cerrado para edición. No se puede alterar.');
      }

      const hoja = this.getHoja();
      const fila = mov.fila;

      // Solo permitir editar monto y observaciones
      if (datos.monto !== undefined && esMontoValido(datos.monto)) {
        const diferencia = restaFinanciera(datos.monto, mov.monto);

        // Recalcular saldo del cliente
        const cliente = ClientesRepository.buscarPorNombre(mov.cliente);
        if (cliente) {
          let nuevoSaldoCliente;
          if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
            nuevoSaldoCliente = sumaFinanciera(cliente.saldo, diferencia);
          } else {
            nuevoSaldoCliente = restaFinanciera(cliente.saldo, diferencia);
          }

          hoja.getRange(fila, CONFIG.COLS_MOVS.MONTO + 1).setValue(datos.monto);

          // Actualizar saldo en cliente
          const hojaClientes = ClientesRepository.getHoja();
          hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldoCliente);
          Logger.log('[MOVIMIENTOS] Editar #' + id + ': saldo ' + cliente.saldo + ' → ' + nuevoSaldoCliente);
        }
      }

      if (datos.obs !== undefined) {
        hoja.getRange(fila, CONFIG.COLS_MOVS.OBS + 1).setValue(datos.obs);
      }

      // El historial cacheado de este cliente ya no refleja la hoja.
      // Sin esto, buscarPorId y obtenerPorCliente podian devolver el monto
      // viejo dentro de la misma ejecucion.
      RequestCache.invalidar('movimientos_cliente_' + normalizarString(mov.cliente));

      return this.buscarPorId(id);

    } catch (error) {
      Logger.log('[MOVIMIENTOS] Error en editar #' + id + ': ' + error.message);
      throw error;
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  },

  /**
   * Elimina un movimiento y recalcula el saldo del cliente
   * @param {number} id - ID del movimiento
   */
  eliminar: function(id) {
    const lock = LockService.getScriptLock();
    let lockAdquirido = false;
    try {
      lock.waitLock(30000);
      lockAdquirido = true;

      const mov = this.buscarPorId(id);
      if (!mov) {
        throw new Error('Movimiento no encontrado: ' + id);
      }

      if (this._fechaEnMesCerrado(mov.fecha)) {
        throw new Error('El mes de este movimiento ya está cerrado para edición. No se puede eliminar.');
      }

      // Recalcular saldo del cliente
      const cliente = ClientesRepository.buscarPorNombre(mov.cliente);
      if (cliente) {
        let nuevoSaldoCliente;
        if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
          nuevoSaldoCliente = restaFinanciera(cliente.saldo, mov.monto);
        } else {
          nuevoSaldoCliente = sumaFinanciera(cliente.saldo, mov.monto);
        }

        // Actualizar saldo en cliente
        const hojaClientes = ClientesRepository.getHoja();
        // Actualizar saldo
        hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldoCliente);
        // C-08: Decrementar contador de movimientos
        const nuevoTotal = Math.max(0, (cliente.totalMovs || 1) - 1);
        hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.TOTAL_MOVS + 1).setValue(nuevoTotal);
        // C-08: Actualizar ultimoMov con el movimiento más reciente restante
        const movRestantes = this.obtenerPorCliente(mov.cliente);
        const filtrados = movRestantes.filter(m => m.id !== id);
        if (filtrados.length > 0) {
          // obtenerPorCliente ordena por ID DESCENDENTE (del mas reciente al
          // mas viejo), asi que el mas reciente es el primero.
          // Antes se tomaba filtrados[length-1] creyendo el orden cronologico
          // inverso: tras borrar un movimiento, ULTIMO_MOV del cliente quedaba
          // con la fecha MAS VIEJA de su historial.
          const ultimoMov = filtrados[0];
          hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue(
            ultimoMov.fecha ? parsearFechaLocal(ultimoMov.fecha) : ''
          );
        } else {
          hojaClientes.getRange(cliente.fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue('');
        }

        Logger.log('[MOVIMIENTOS] Eliminar #' + id + ': saldo ' + cliente.saldo + ' → ' + nuevoSaldoCliente);
      }

      // M-06: Auditoría antes de eliminar
      AuditLogger.registrar({
        modulo:      'MOVIMIENTOS',
        operacion:   'ELIMINAR',
        entidadId:   id,
        entidadDesc: 'Cliente: ' + mov.cliente + ' | Monto: $' + mov.monto,
        antes:       { cliente: mov.cliente, monto: mov.monto, tipo: mov.tipo, saldo: mov.saldoPost },
        despues:     null,
        montoImpacto: mov.monto
      });

      // Eliminar fila
      const hoja = this.getHoja();
      hoja.deleteRow(mov.fila);

      // El historial cacheado de este cliente ya no refleja la hoja
      RequestCache.invalidar('movimientos_cliente_' + normalizarString(mov.cliente));

    } catch (error) {
      Logger.log('[MOVIMIENTOS] Error en eliminar #' + id + ': ' + error.message);
      throw error;
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
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
