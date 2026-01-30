/**
 * ============================================================================
 * CLIENTES REPOSITORY - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: clientes.js
 * Descripción: Lógica de acceso a datos para clientes
 *
 * ============================================================================
 */

const ClientesRepository = {
  /**
   * Obtiene la hoja de CLIENTES
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getHoja: function() {
    const ss = getSpreadsheet();
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
  obtenerTodos: function(offset = 0, limit = 0) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return []; // Solo encabezados o vacío (backward compatible)

    // Calculate actual range to read
    const totalClientes = lastRow - 1; // Exclude header
    const actualLimit = limit === 0 ? totalClientes : Math.min(limit, totalClientes);
    const startRow = Math.min(offset + 2, lastRow + 1); // +2: skip header row 1, +offset from row 2
    const rowCount = Math.max(0, Math.min(actualLimit, lastRow - offset - 1));

    // Read only the specific range instead of entire sheet (PERFORMANCE FIX)
    let datos = [];
    if (rowCount > 0) {
      datos = hoja.getRange(startRow, 1, rowCount, 9).getValues();
    }

    const clientes = [];
    for (let i = 0; i < datos.length; i++) {
      const fila = datos[i];

      // Convertir fechas a ISO strings para serialización Web
      const alta = fila[CONFIG.COLS_CLIENTES.ALTA];
      const ultimoMov = fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV];

      clientes.push({
        nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE] || '',
        tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
        email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
        limite: Number(fila[CONFIG.COLS_CLIENTES.LIMITE]) || 100000,
        saldo: Number(fila[CONFIG.COLS_CLIENTES.SALDO]) || 0,
        totalMovs: Number(fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS]) || 0,
        alta: alta instanceof Date ? alta.toISOString() : (alta || ''),
        ultimoMov: ultimoMov instanceof Date ? ultimoMov.toISOString() : (ultimoMov || ''),
        obs: fila[CONFIG.COLS_CLIENTES.OBS] || ''
      });
    }

    return clientes;
  },

  /**
   * Cuenta el total de clientes sin cargar todos los datos
   * @returns {number} Total de clientes
   */
  contarTodos: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    return Math.max(0, lastRow - 1); // Exclude header
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

        // Convertir fechas a ISO strings para serialización Web (FIX visor de clientes)
        const alta = fila[CONFIG.COLS_CLIENTES.ALTA];
        const ultimoMov = fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV];

        return {
          cliente: {
            nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
            tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
            email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
            limite: Number(fila[CONFIG.COLS_CLIENTES.LIMITE]) || 100000,
            saldo: Number(fila[CONFIG.COLS_CLIENTES.SALDO]) || 0,
            totalMovs: Number(fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS]) || 0,
            alta: alta instanceof Date ? alta.toISOString() : (alta || ''),
            ultimoMov: ultimoMov instanceof Date ? ultimoMov.toISOString() : (ultimoMov || ''),
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
      alta: ahora.toISOString(),  // Convertir Date a ISO string
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
   * PERFORMANCE: Actualiza SOLO saldo, contadores y fecha sin recargar todo
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   * @param {Date} fechaMov - Fecha del movimiento
   * @returns {Object} Cliente actualizado
   */
  actualizarSaldoRapido: function(nombreCliente, nuevoSaldo, fechaMov) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    // Actualizar solo 3 celdas (muy rápido, no recarga datos)
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.TOTAL_MOVS + 1).setValue((resultado.cliente.totalMovs || 0) + 1);
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue(fechaMov);

    // Retornar cliente actualizado sin recargar del sheet
    return {
      nombre: resultado.cliente.nombre,
      saldo: nuevoSaldo,
      totalMovs: (resultado.cliente.totalMovs || 0) + 1,
      ultimoMov: fechaMov instanceof Date ? fechaMov.toISOString() : fechaMov
    };
  },

  /**
   * Actualiza SOLO el saldo (para operaciones de edit/delete de movimientos)
   * @param {string} nombreCliente - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   */
  actualizarSaldoDirecto: function(nombreCliente, nuevoSaldo) {
    const resultado = this.buscarPorNombre(nombreCliente);

    if (!resultado) {
      throw new Error(`Cliente "${nombreCliente}" no encontrado`);
    }

    const hoja = this.getHoja();
    const fila = resultado.fila;

    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);
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