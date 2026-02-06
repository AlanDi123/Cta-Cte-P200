/**
 * ============================================================================
 * REPOSITORIO DE CLIENTES - SISTEMA SOL & VERDE
 * ============================================================================
 * CRUD completo para gestion de clientes
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
      hoja.appendRow(['NOMBRE', 'TEL', 'EMAIL', 'LIMITE', 'SALDO', 'TOTAL_MOVS', 'ALTA', 'ULTIMO_MOV', 'OBS', 'CUIT', 'CONDICION_FISCAL']);
      hoja.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    } else {
      // Migrar hojas existentes que no tengan las columnas CUIT y CONDICION_FISCAL
      var lastCol = hoja.getLastColumn();
      if (lastCol < 11) {
        var headers = ['NOMBRE', 'TEL', 'EMAIL', 'LIMITE', 'SALDO', 'TOTAL_MOVS', 'ALTA', 'ULTIMO_MOV', 'OBS', 'CUIT', 'CONDICION_FISCAL'];
        for (var col = lastCol + 1; col <= 11; col++) {
          hoja.getRange(1, col).setValue(headers[col - 1]).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
        }
        Logger.log('CLIENTES: migradas columnas faltantes (de ' + lastCol + ' a 11)');
      }
    }

    return hoja;
  },

  /**
   * Obtiene todos los clientes
   * @param {number} offset - Inicio (opcional)
   * @param {number} limit - Limite (opcional)
   * @returns {Array<Object>} Array de clientes
   */
  obtenerTodos: function(offset = 0, limit = 0) {
    const hoja = this.getHoja(); // getHoja() triggers column migration if needed
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    const startRow = 2 + offset;
    const numRows = limit > 0 ? Math.min(limit, lastRow - startRow + 1) : lastRow - 1 - offset;

    if (numRows <= 0) return [];

    // Use actual column count, minimum 11 (getHoja already ensures migration)
    const numCols = Math.max(hoja.getLastColumn(), 11);
    const datos = hoja.getRange(startRow, 1, numRows, numCols).getValues();
    const clientes = [];

    for (const fila of datos) {
      if (!fila[CONFIG.COLS_CLIENTES.NOMBRE]) continue;

      clientes.push({
        nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
        tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
        email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
        limite: fila[CONFIG.COLS_CLIENTES.LIMITE] || CONFIG.DEFAULTS.LIMITE_CREDITO,
        saldo: fila[CONFIG.COLS_CLIENTES.SALDO] || 0,
        totalMovs: fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS] || 0,
        alta: fila[CONFIG.COLS_CLIENTES.ALTA] instanceof Date ? fila[CONFIG.COLS_CLIENTES.ALTA].toISOString() : '',
        ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV] instanceof Date ? fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV].toISOString() : '',
        obs: fila[CONFIG.COLS_CLIENTES.OBS] || '',
        cuit: fila[CONFIG.COLS_CLIENTES.CUIT] || '',
        condicionFiscal: fila[CONFIG.COLS_CLIENTES.CONDICION_FISCAL] || (fila[CONFIG.COLS_CLIENTES.CUIT] ? 'Responsable Inscripto' : 'Consumidor Final')
      });
    }

    return clientes;
  },

  /**
   * Busca un cliente por nombre exacto
   * @param {string} nombre - Nombre del cliente
   * @returns {Object|null} Cliente encontrado o null
   */
  buscarPorNombre: function(nombre) {
    const nombreNorm = normalizarString(nombre);
    if (!nombreNorm) return null;

    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (normalizarString(datos[i][CONFIG.COLS_CLIENTES.NOMBRE]) === nombreNorm) {
        const fila = datos[i];
        return {
          nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
          tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
          email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
          limite: fila[CONFIG.COLS_CLIENTES.LIMITE] || CONFIG.DEFAULTS.LIMITE_CREDITO,
          saldo: fila[CONFIG.COLS_CLIENTES.SALDO] || 0,
          totalMovs: fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS] || 0,
          alta: fila[CONFIG.COLS_CLIENTES.ALTA] instanceof Date ? fila[CONFIG.COLS_CLIENTES.ALTA].toISOString() : '',
          ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV] instanceof Date ? fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV].toISOString() : '',
          obs: fila[CONFIG.COLS_CLIENTES.OBS] || '',
          cuit: fila[CONFIG.COLS_CLIENTES.CUIT] || '',
          condicionFiscal: fila[CONFIG.COLS_CLIENTES.CONDICION_FISCAL] || (fila[CONFIG.COLS_CLIENTES.CUIT] ? 'Responsable Inscripto' : 'Consumidor Final'),
          fila: i + 1
        };
      }
    }

    return null;
  },

  /**
   * Busca clientes con fuzzy matching
   * @param {string} termino - Termino de busqueda
   * @returns {Object} {exacto: Object|null, sugerencias: Array}
   */
  buscarConSugerencias: function(termino) {
    const clientes = this.obtenerTodos();
    const terminoNorm = normalizarString(termino);

    // Buscar exacto primero
    const exacto = clientes.find(c => normalizarString(c.nombre) === terminoNorm) || null;

    // Si hay exacto, retornarlo
    if (exacto) {
      return { exacto: exacto, sugerencias: [] };
    }

    // Buscar sugerencias fuzzy
    const sugerencias = buscarClientesFuzzy(termino, clientes);

    return {
      exacto: null,
      sugerencias: sugerencias.map(s => s.cliente)
    };
  },

  /**
   * Crea un nuevo cliente
   * @param {Object} clienteData - Datos del cliente
   * @returns {Object} Cliente creado
   */
  crear: function(clienteData) {
    const validacion = validarCliente(clienteData);
    if (!validacion.valid) {
      throw new Error('Datos de cliente invalidos: ' + validacion.errors.join(', '));
    }

    const nombreNorm = normalizarString(clienteData.nombre);

    // Verificar que no exista
    if (this.buscarPorNombre(nombreNorm)) {
      throw new Error('Ya existe un cliente con el nombre: ' + nombreNorm);
    }

    const hoja = this.getHoja();
    const fechaAlta = new Date();

    const cuit = clienteData.cuit || '';
    const condicionFiscal = clienteData.condicionFiscal || (cuit ? 'Responsable Inscripto' : 'Consumidor Final');

    const nuevaFila = [
      nombreNorm,
      clienteData.tel || '',
      clienteData.email || '',
      clienteData.limite || CONFIG.DEFAULTS.LIMITE_CREDITO,
      CONFIG.DEFAULTS.SALDO_INICIAL,
      0,
      fechaAlta,
      '',
      clienteData.obs || '',
      cuit,
      condicionFiscal
    ];

    hoja.appendRow(nuevaFila);

    return {
      nombre: nombreNorm,
      tel: clienteData.tel || '',
      email: clienteData.email || '',
      limite: clienteData.limite || CONFIG.DEFAULTS.LIMITE_CREDITO,
      saldo: CONFIG.DEFAULTS.SALDO_INICIAL,
      totalMovs: 0,
      alta: fechaAlta.toISOString(),
      ultimoMov: '',
      obs: clienteData.obs || '',
      cuit: cuit,
      condicionFiscal: condicionFiscal
    };
  },

  /**
   * Actualiza los datos de un cliente
   * @param {string} nombre - Nombre del cliente
   * @param {Object} datos - Datos a actualizar
   * @returns {Object} Cliente actualizado
   */
  actualizar: function(nombre, datos) {
    const cliente = this.buscarPorNombre(nombre);
    if (!cliente) {
      throw new Error('Cliente no encontrado: ' + nombre);
    }

    const hoja = this.getHoja();
    const fila = cliente.fila;

    // Actualizar campos permitidos
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
    if (datos.cuit !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.CUIT + 1).setValue(datos.cuit);
      // Actualizar condición fiscal según CUIT
      const condicion = datos.condicionFiscal || (datos.cuit ? 'Responsable Inscripto' : 'Consumidor Final');
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.CONDICION_FISCAL + 1).setValue(condicion);
    }
    if (datos.condicionFiscal !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.CONDICION_FISCAL + 1).setValue(datos.condicionFiscal);
    }

    return this.buscarPorNombre(nombre);
  },

  /**
   * Elimina un cliente
   * @param {string} nombre - Nombre del cliente
   */
  eliminar: function(nombre) {
    const cliente = this.buscarPorNombre(nombre);
    if (!cliente) {
      throw new Error('Cliente no encontrado: ' + nombre);
    }

    const hoja = this.getHoja();
    hoja.deleteRow(cliente.fila);
  },

  /**
   * Obtiene el saldo de un cliente
   * @param {string} nombre - Nombre del cliente
   * @returns {number} Saldo actual
   */
  obtenerSaldo: function(nombre) {
    const cliente = this.buscarPorNombre(nombre);
    return cliente ? cliente.saldo : 0;
  },

  /**
   * Actualiza el saldo y contadores de un cliente
   * @param {string} nombre - Nombre del cliente
   * @param {number} nuevoSaldo - Nuevo saldo
   * @param {Date} fechaMovimiento - Fecha del movimiento
   */
  actualizarSaldoYContadores: function(nombre, nuevoSaldo, fechaMovimiento) {
    const cliente = this.buscarPorNombre(nombre);
    if (!cliente) {
      throw new Error('Cliente no encontrado: ' + nombre);
    }

    const hoja = this.getHoja();
    const fila = cliente.fila;

    // Actualizar saldo
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.SALDO + 1).setValue(nuevoSaldo);

    // Incrementar contador de movimientos
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.TOTAL_MOVS + 1).setValue(cliente.totalMovs + 1);

    // Actualizar fecha ultimo movimiento
    hoja.getRange(fila, CONFIG.COLS_CLIENTES.ULTIMO_MOV + 1).setValue(fechaMovimiento);
  },

  /**
   * Obtiene el total de clientes
   * @returns {number} Total de clientes
   */
  contarTotal: function() {
    const hoja = this.getHoja();
    return Math.max(0, hoja.getLastRow() - 1);
  },

  /**
   * Obtiene clientes con saldo pendiente (deudores)
   * @returns {Array<Object>} Clientes con saldo > 0
   */
  obtenerDeudores: function() {
    const clientes = this.obtenerTodos();
    return clientes.filter(c => c.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  },

  /**
   * Obtiene clientes con saldo a favor (nos deben a nosotros)
   * @returns {Array<Object>} Clientes con saldo < 0
   */
  obtenerConSaldoAFavor: function() {
    const clientes = this.obtenerTodos();
    return clientes.filter(c => c.saldo < 0).sort((a, b) => a.saldo - b.saldo);
  }
};
