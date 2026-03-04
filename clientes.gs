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
      hoja.appendRow(['NOMBRE', 'TEL', 'EMAIL', 'LIMITE', 'SALDO', 'TOTAL_MOVS', 'ALTA', 'ULTIMO_MOV', 'OBS', 'CUIT', 'CONDICION_FISCAL', 'RAZON_SOCIAL', 'DOMICILIO_FISCAL']);
      hoja.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#4A90E2').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
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
    const CACHE_KEY = 'clientes_todos_v2';

    // M-01 + M-04: Solo cachear si es la consulta completa sin paginación
    if (offset === 0 && limit === 0) {
      // 1. Intentar RequestCache primero (mismo request)
      const reqCacheado = RequestCache.get(CACHE_KEY);
      if (reqCacheado !== undefined) return reqCacheado;

      // 2. Intentar SheetsCache (cross-request, TTL 60s)
      const sheetsCacheado = SheetsCache.get(CACHE_KEY);
      if (sheetsCacheado !== null) {
        RequestCache.set(CACHE_KEY, sheetsCacheado); // promover a RequestCache
        return sheetsCacheado;
      }
    }

    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    const startRow = 2 + offset;
    const numRows = limit > 0 ? Math.min(limit, lastRow - startRow + 1) : lastRow - 1 - offset;

    if (numRows <= 0) return [];

    const datos = hoja.getRange(startRow, 1, numRows, 13).getValues();
    const clientes = [];

    for (const fila of datos) {
      if (!fila[CONFIG.COLS_CLIENTES.NOMBRE]) continue;

      clientes.push({
        nombre: fila[CONFIG.COLS_CLIENTES.NOMBRE],
        tel: fila[CONFIG.COLS_CLIENTES.TEL] || '',
        email: fila[CONFIG.COLS_CLIENTES.EMAIL] || '',
        limite: fila[CONFIG.COLS_CLIENTES.LIMITE] || CONFIG.getLimiteCredito(),
        saldo: fila[CONFIG.COLS_CLIENTES.SALDO] || 0,
        totalMovs: fila[CONFIG.COLS_CLIENTES.TOTAL_MOVS] || 0,
        alta: fila[CONFIG.COLS_CLIENTES.ALTA] instanceof Date ? formatearFechaLocal(fila[CONFIG.COLS_CLIENTES.ALTA]) : '',
        ultimoMov: fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV] instanceof Date ? formatearFechaLocal(fila[CONFIG.COLS_CLIENTES.ULTIMO_MOV]) : '',
        obs: fila[CONFIG.COLS_CLIENTES.OBS] || '',
        cuit: fila[CONFIG.COLS_CLIENTES.CUIT] || '',
        condicionFiscal: fila[CONFIG.COLS_CLIENTES.CONDICION_FISCAL] || (fila[CONFIG.COLS_CLIENTES.CUIT] ? 'Responsable Inscripto' : 'Consumidor Final'),
        razonSocial: fila[CONFIG.COLS_CLIENTES.RAZON_SOCIAL] || '',
        domicilioFiscal: fila[CONFIG.COLS_CLIENTES.DOMICILIO_FISCAL] || ''
      });
    }

    // M-01 + M-04: Cachear resultado si es consulta completa
    if (offset === 0 && limit === 0) {
      SheetsCache.set(CACHE_KEY, clientes, 60); // TTL 60 segundos
      RequestCache.set(CACHE_KEY, clientes);
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

    // M-01: Obtener (o construir) el índice Map nombre→objeto cliente
    const INDEX_KEY = 'clientes_index_nombre';
    let indice = RequestCache.get(INDEX_KEY);

    if (indice === undefined) {
      // Primera llamada en este request: construir el índice
      const hoja = this.getHoja();
      const datos = hoja.getDataRange().getValues();
      indice = new Map();
      const C = CONFIG.COLS_CLIENTES;

      for (let i = 1; i < datos.length; i++) {
        const fila = datos[i];
        const nomNorm = normalizarString(fila[C.NOMBRE]);
        if (!nomNorm) continue;
        indice.set(nomNorm, {
          nombre:         fila[C.NOMBRE],
          tel:            fila[C.TEL] || '',
          email:          fila[C.EMAIL] || '',
          limite:         fila[C.LIMITE] || CONFIG.getLimiteCredito(),
          saldo:          fila[C.SALDO] || 0,
          totalMovs:      fila[C.TOTAL_MOVS] || 0,
          alta:           fila[C.ALTA] instanceof Date ? formatearFechaLocal(fila[C.ALTA]) : '',
          ultimoMov:      fila[C.ULTIMO_MOV] instanceof Date ? formatearFechaLocal(fila[C.ULTIMO_MOV]) : '',
          obs:            fila[C.OBS] || '',
          cuit:           fila[C.CUIT] || '',
          condicionFiscal: fila[C.CONDICION_FISCAL] || (fila[C.CUIT] ? 'Responsable Inscripto' : 'Consumidor Final'),
          razonSocial:    fila[C.RAZON_SOCIAL] || '',
          domicilioFiscal: fila[C.DOMICILIO_FISCAL] || '',
          fila:           i + 1
        });
      }
      RequestCache.set(INDEX_KEY, indice);
    }

    return indice.get(nombreNorm) || null;
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
      clienteData.limite || CONFIG.getLimiteCredito(),
      CONFIG.DEFAULTS.SALDO_INICIAL,
      0,
      fechaAlta,
      '',
      clienteData.obs || '',
      cuit,
      condicionFiscal,
      clienteData.razonSocial || '',
      clienteData.domicilioFiscal || ''
    ];

    hoja.appendRow(nuevaFila);

    // M-01 + M-04: Invalidar ambas capas de caché
    RequestCache.invalidar('clientes_todos', 'clientes_todos_v2', 'clientes_index_nombre');
    SheetsCache.invalidar('clientes_todos_v2');

    return {
      nombre: nombreNorm,
      tel: clienteData.tel || '',
      email: clienteData.email || '',
      limite: clienteData.limite || CONFIG.getLimiteCredito(),
      saldo: CONFIG.DEFAULTS.SALDO_INICIAL,
      totalMovs: 0,
      alta: formatearFechaLocal(fechaAlta),
      ultimoMov: '',
      obs: clienteData.obs || '',
      cuit: cuit,
      condicionFiscal: condicionFiscal,
      razonSocial: clienteData.razonSocial || '',
      domicilioFiscal: clienteData.domicilioFiscal || ''
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
    let nombreFinal = nombre;

    // Cambiar nombre si es diferente
    if (datos.nombre !== undefined) {
      const nuevoNombreNorm = normalizarString(datos.nombre);
      const nombreActualNorm = normalizarString(nombre);

      if (nuevoNombreNorm !== nombreActualNorm) {
        // Verificar que el nuevo nombre no exista
        const clienteExistente = this.buscarPorNombre(nuevoNombreNorm);
        if (clienteExistente) {
          throw new Error('Ya existe un cliente con el nombre: ' + nuevoNombreNorm);
        }

        // Actualizar nombre en la hoja de clientes
        hoja.getRange(fila, CONFIG.COLS_CLIENTES.NOMBRE + 1).setValue(nuevoNombreNorm);

        // Actualizar nombre en todos los movimientos
        MovimientosRepository.actualizarNombreCliente(nombre, nuevoNombreNorm);

        nombreFinal = nuevoNombreNorm;
      }
    }

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
    if (datos.razonSocial !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.RAZON_SOCIAL + 1).setValue(datos.razonSocial);
    }
    if (datos.domicilioFiscal !== undefined) {
      hoja.getRange(fila, CONFIG.COLS_CLIENTES.DOMICILIO_FISCAL + 1).setValue(datos.domicilioFiscal);
    }

    // M-01 + M-04: Invalidar ambas capas de caché
    RequestCache.invalidar('clientes_todos', 'clientes_todos_v2', 'clientes_index_nombre');
    SheetsCache.invalidar('clientes_todos_v2');

    return this.buscarPorNombre(nombreFinal);
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

    // M-01 + M-04: Invalidar ambas capas de caché
    RequestCache.invalidar('clientes_todos', 'clientes_todos_v2', 'clientes_index_nombre');
    SheetsCache.invalidar('clientes_todos_v2');
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
    const C = CONFIG.COLS_CLIENTES;

    // M-02: Leer fila completa actual para no sobrescribir columnas intermedias
    const filaActual = hoja.getRange(fila, 1, 1, 13).getValues()[0];

    // Actualizar solo las columnas que cambian
    filaActual[C.SALDO]      = nuevoSaldo;
    filaActual[C.TOTAL_MOVS] = (cliente.totalMovs || 0) + 1;
    filaActual[C.ULTIMO_MOV] = fechaMovimiento;

    // M-02: Una sola escritura para toda la fila actualizada
    hoja.getRange(fila, 1, 1, 13).setValues([filaActual]);

    // M-01 + M-04: Invalidar cache porque el cliente fue modificado
    RequestCache.invalidar('clientes_todos', 'clientes_todos_v2', 'clientes_index_nombre');
    SheetsCache.invalidar('clientes_todos_v2');
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
