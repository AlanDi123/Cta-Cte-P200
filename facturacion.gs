/**
 * ============================================================================
 * MODULO DE FACTURACION - SISTEMA SOL & VERDE
 * ============================================================================
 * Sistema independiente para gestión de transferencias y facturación
 * Comparte clientes con el módulo de Cuenta Corriente
 * ============================================================================
 */

// Configuración del módulo de facturación
var CONFIG_FACTURACION = {
  HOJAS: {
    TRANSFERENCIAS: 'Transferencias',
    PRODUCTOS: 'Productos'
  },
  COLS_TRANSFERENCIAS: {
    ID: 0,
    FECHA: 1,
    CLIENTE: 2,
    MONTO: 3,
    BANCO: 4,
    CONDICION: 5,
    TIPO_FACTURA: 6,
    FACTURADA: 7,
    FECHA_FACTURA: 8,
    OBS: 9
  },
  COLS_PRODUCTOS: {
    ID: 0,
    NOMBRE: 1,
    PRECIO: 2,
    STOCK: 3,
    ACTIVO: 4
  },
  /**
   * Obtiene el multiplicador de IVA desde la configuración global
   */
  getIVA: function() {
    return CONFIG.getIVA().MULTIPLICADOR;
  },
  CLAUDE: {
    API_URL: 'https://api.anthropic.com/v1/messages',
    MODEL: 'claude-sonnet-4-5',
    MAX_TOKENS: 4000,
    TEMPERATURE: 0.0
  }
};


// ============================================================================
// REPOSITORIO DE TRANSFERENCIAS
// ============================================================================

const TransferenciasRepository = {
  /**
   * Obtiene o crea la hoja de transferencias
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG_FACTURACION.HOJAS.TRANSFERENCIAS);

    if (!hoja) {
      hoja = ss.insertSheet(CONFIG_FACTURACION.HOJAS.TRANSFERENCIAS);
      hoja.appendRow(['ID', 'FECHA', 'CLIENTE', 'MONTO', 'BANCO', 'CONDICION', 'TIPO_FACTURA', 'FACTURADA', 'FECHA_FACTURA', 'OBS']);
      hoja.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#FF6F00').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }

    return hoja;
  },

  /**
   * Obtiene el siguiente ID disponible
   */
  getSiguienteId: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;
    const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(id => id);
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  },

  /**
   * Obtiene todas las transferencias
   * @param {number} limite - Máximo de registros (0 = todos)
   */
  obtenerTodas: function(limite = 0) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    // 0 = sin límite (todos los registros)
    const numRows = (limite > 0) ? Math.min(limite, lastRow - 1) : (lastRow - 1);
    const datos = hoja.getRange(2, 1, numRows, 10).getValues();

    return datos.map(fila => ({
      id: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID],
      fecha: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA] instanceof Date ?
        formatearFechaLocal(fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA]) : fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA],
      cliente: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.CLIENTE],
      monto: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.MONTO] || 0,
      banco: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.BANCO] || '',
      condicion: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.CONDICION] || 'Consumidor Final',
      tipoFactura: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.TIPO_FACTURA] || '',
      facturada: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FACTURADA] === true || fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FACTURADA] === 'SI',
      fechaFactura: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA_FACTURA] || '',
      obs: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.OBS] || ''
    })).filter(t => t.id).sort((a, b) => {
      const fa = a.fecha || '';
      const fb = b.fecha || '';
      return fb.localeCompare(fa); // fecha descendente: más reciente primero
    });
  },

  /**
   * Obtiene transferencias pendientes de facturar
   */
  obtenerPendientes: function() {
    return this.obtenerTodas().filter(t => !t.facturada);
  },

  /**
   * Obtiene transferencias por mes
   */
  obtenerPorMes: function(mes, anio) {
    return this.obtenerTodas(500).filter(t => {
      if (!t.fecha) return false;
      const fecha = parsearFechaLocal(t.fecha);
      return fecha.getMonth() + 1 === mes && fecha.getFullYear() === anio;
    });
  },

  /**
   * Obtiene todas las transferencias de una fecha exacta (YYYY-MM-DD).
   * Usado por CajaDiariaService para calcular automáticos.
   * @param {string} fecha - Formato YYYY-MM-DD
   * @returns {Array<Object>}
   */
  obtenerPorFecha: function(fecha) {
    return this.obtenerTodas(0).filter(t => t.fecha === fecha);
  },

  /**
   * Parsea metadata de cliente no registrado desde observaciones
   * @param {string} obs - Campo obs de la transferencia
   * @returns {{esNoRegistrado: boolean, nombreOriginal: string, cuitProporcionado: string|null, fechaIngreso: string}|null}
   */
  parsearMetadataNoRegistrado: function(obs) {
    if (!obs || obs.indexOf('[NO_REGISTRADO] ') !== 0) {
      return null;
    }
    
    try {
      // Extraer JSON entre el prefix y el primer '|' o fin del string
      const prefix = '[NO_REGISTRADO] ';
      const jsonEnd = obs.indexOf(' | ');
      const jsonStr = obs.substring(prefix.length, jsonEnd !== -1 ? jsonEnd : obs.length);
      
      return JSON.parse(jsonStr);
    } catch (e) {
      Logger.log('Error parseando metadata no registrado: ' + e.message);
      return null;
    }
  },

  /**
   * Obtiene transferencias de clientes no registrados
   * @param {number} limite - Máximo de registros (0 = todos)
   * @returns {Array<Object>}
   */
  obtenerNoRegistradas: function(limite = 0) {
    const todas = this.obtenerTodas(limite);
    return todas.filter(t => t.esNoRegistrado);
  },

  /**
   * Agrega una nueva transferencia
   * SOPORTE PARA CLIENTES NO REGISTRADOS:
   * - Si el cliente no existe, se guarda el nombre original proporcionado
   * - Se marca como 'noRegistrado' para trazabilidad
   * - Permite CUIT opcional para facturación como Consumidor Final
   */
  agregar: function(datos) {
    const hoja = this.getHoja();
    const id = this.getSiguienteId();

    // Determinar si el cliente está registrado
    let clienteRegistrado = false;
    let clienteData = null;
    let condicion = datos.condicion || 'Consumidor Final';
    let cuit = datos.cuit || '';
    let nombreOriginal = (datos.cliente || '').toUpperCase();
    
    // Buscar cliente registrado
    if (datos.cliente) {
      clienteData = ClientesRepository.buscarPorNombre(datos.cliente);
      if (clienteData) {
        clienteRegistrado = true;
        condicion = clienteData.condicionFiscal || (clienteData.cuit ? 'Responsable Inscripto' : 'Consumidor Final');
        cuit = clienteData.cuit || cuit;
      }
    }

    // Determinar tipo de factura según condición
    // Factura A: Responsables Inscriptos o Monotributistas con CUIT
    // Factura B: Consumidores Finales
    const tipoFactura = (condicion === 'Responsable Inscripto' ||
                         condicion === 'RI' ||
                         condicion === 'Monotributista' ||
                         condicion === 'Monotributo') ? 'A' : 'B';

    // TRAZABILIDAD PARA CLIENTES NO REGISTRADOS:
    // Guardar nombre original y CUIT opcional en observaciones (formato estructurado)
    let obs = datos.obs || '';
    if (!clienteRegistrado) {
      // Agregar metadata estructurada para trazabilidad
      const metadataNoRegistrado = {
        noRegistrado: true,
        nombreOriginal: nombreOriginal,
        cuitProporcionado: cuit || null,
        fechaIngreso: formatearFechaLocal(new Date())
      };
      
      // Prefix para identificar rápidamente clientes no registrados
      const prefix = '[NO_REGISTRADO] ';
      if (obs.indexOf(prefix) !== 0) {
        obs = prefix + JSON.stringify(metadataNoRegistrado) + (obs ? ' | ' + obs : '');
      }
    }

    const nuevaFila = [
      id,
      datos.fecha ? parsearFechaLocal(datos.fecha) : new Date(),
      nombreOriginal,
      datos.monto || 0,
      datos.banco || '',
      condicion,
      tipoFactura,
      false,
      '',
      obs
    ];

    hoja.appendRow(nuevaFila);

    return {
      id: id,
      fecha: datos.fecha,
      cliente: nombreOriginal,
      clienteRegistrado: clienteRegistrado,
      nombreOriginal: nombreOriginal,  // Trazabilidad
      cuitProporcionado: cuit,  // Para facturación
      monto: datos.monto,
      banco: datos.banco,
      condicion: condicion,
      tipoFactura: tipoFactura,
      facturada: false,
      esNoRegistrado: !clienteRegistrado  // Flag explícito
    };
  },

  /**
   * Agrega múltiples transferencias (para importación desde IA o API)
   * Inserción en lote: una lectura de ID + un setValues (evita N appendRow).
   * @returns {{exitosos: Array, errores: Array}}
   */
  agregarMultiples: function(transferencias) {
    if (!transferencias || transferencias.length === 0) return { exitosos: [], errores: [] };

    const hoja = this.getHoja();
    const idBase = this.getSiguienteId();
    let idActual = idBase;

    const nuevasFilas = [];
    const exitosos = [];
    const errores = [];

    for (const t of transferencias) {
      try {
        let clienteRegistrado = false;
        let clienteData = null;
        let condicion = t.condicion || 'Consumidor Final';
        let cuit = t.cuit || '';
        const nombreOriginal = (t.cliente || '').toUpperCase();

        if (t.cliente) {
          clienteData = ClientesRepository.buscarPorNombre(t.cliente);
          if (clienteData) {
            clienteRegistrado = true;
            condicion = clienteData.condicionFiscal || (clienteData.cuit ? 'Responsable Inscripto' : 'Consumidor Final');
            cuit = clienteData.cuit || cuit;
          }
        }

        const tipoFactura = (condicion === 'Responsable Inscripto' || condicion === 'RI' ||
          condicion === 'Monotributista' || condicion === 'Monotributo') ? 'A' : 'B';

        let obs = t.obs || '';
        if (!clienteRegistrado) {
          const metadataNoRegistrado = {
            noRegistrado: true,
            nombreOriginal: nombreOriginal,
            cuitProporcionado: cuit || null,
            fechaIngreso: formatearFechaLocal(new Date())
          };
          const prefix = '[NO_REGISTRADO] ';
          if (obs.indexOf(prefix) !== 0) {
            obs = prefix + JSON.stringify(metadataNoRegistrado) + (obs ? ' | ' + obs : '');
          }
        }

        nuevasFilas.push([
          idActual,
          t.fecha ? parsearFechaLocal(t.fecha) : new Date(),
          nombreOriginal,
          t.monto || 0,
          t.banco || '',
          condicion,
          tipoFactura,
          false,
          '',
          obs
        ]);

        exitosos.push({
          id: idActual,
          fecha: t.fecha,
          cliente: nombreOriginal,
          clienteRegistrado: clienteRegistrado,
          nombreOriginal: nombreOriginal,
          cuitProporcionado: cuit,
          monto: t.monto,
          banco: t.banco,
          condicion: condicion,
          tipoFactura: tipoFactura,
          facturada: false,
          esNoRegistrado: !clienteRegistrado
        });

        idActual++;
      } catch (e) {
        errores.push({ datos: t, error: e.message });
      }
    }

    if (nuevasFilas.length > 0) {
      const startRow = hoja.getLastRow() + 1;
      hoja.getRange(startRow, 1, nuevasFilas.length, nuevasFilas[0].length).setValues(nuevasFilas);
    }

    return { exitosos: exitosos, errores: errores };
  },

  /**
   * Marca una transferencia como facturada
   */
  marcarFacturada: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID] === id) {
        hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FACTURADA + 1).setValue('SI');
        hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA_FACTURA + 1).setValue(new Date());
        return true;
      }
    }
    return false;
  },

  /**
   * Actualiza una transferencia existente
   */
  actualizar: function(id, datos) {
    const hoja = this.getHoja();
    const filas = hoja.getDataRange().getValues();

    for (let i = 1; i < filas.length; i++) {
      if (filas[i][CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID] === id) {
        const fila = i + 1;

        if (datos.fecha !== undefined) {
          hoja.getRange(fila, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA + 1).setValue(parsearFechaLocal(datos.fecha));
        }
        if (datos.cliente !== undefined) {
          hoja.getRange(fila, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.CLIENTE + 1).setValue((datos.cliente || '').toUpperCase());
        }
        if (datos.monto !== undefined) {
          hoja.getRange(fila, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.MONTO + 1).setValue(datos.monto);
        }
        if (datos.banco !== undefined) {
          hoja.getRange(fila, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.BANCO + 1).setValue(datos.banco);
        }
        if (datos.obs !== undefined) {
          hoja.getRange(fila, CONFIG_FACTURACION.COLS_TRANSFERENCIAS.OBS + 1).setValue(datos.obs);
        }

        return { id: id, actualizado: true };
      }
    }
    throw new Error('Transferencia no encontrada: ' + id);
  },

  /**
   * Busca una transferencia por ID
   */
  buscarPorId: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID] === id) {
        const fila = datos[i];
        return {
          id: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID],
          fecha: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA] instanceof Date ?
            formatearFechaLocal(fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA]) : fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FECHA],
          cliente: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.CLIENTE],
          monto: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.MONTO] || 0,
          banco: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.BANCO] || '',
          condicion: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.CONDICION] || 'Consumidor Final',
          tipoFactura: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.TIPO_FACTURA] || '',
          facturada: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FACTURADA] === true || fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.FACTURADA] === 'SI',
          obs: fila[CONFIG_FACTURACION.COLS_TRANSFERENCIAS.OBS] || ''
        };
      }
    }
    return null;
  },

  /**
   * Elimina una transferencia
   */
  eliminar: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_FACTURACION.COLS_TRANSFERENCIAS.ID] === id) {
        hoja.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  }
};

// ============================================================================
// REPOSITORIO DE PRODUCTOS
// ============================================================================

const ProductosRepository = {
  /**
   * Obtiene o crea la hoja de productos
   */
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG_FACTURACION.HOJAS.PRODUCTOS);

    if (!hoja) {
      hoja = ss.insertSheet(CONFIG_FACTURACION.HOJAS.PRODUCTOS);
      hoja.appendRow(['ID', 'NOMBRE', 'PRECIO', 'STOCK', 'ACTIVO']);
      hoja.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#2E7D32').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }

    return hoja;
  },

  /**
   * Obtiene todos los productos
   */
  obtenerTodos: function() {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    const datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();

    return datos.map(fila => ({
      id: fila[CONFIG_FACTURACION.COLS_PRODUCTOS.ID],
      nombre: fila[CONFIG_FACTURACION.COLS_PRODUCTOS.NOMBRE],
      precio: fila[CONFIG_FACTURACION.COLS_PRODUCTOS.PRECIO] || 0,
      stock: fila[CONFIG_FACTURACION.COLS_PRODUCTOS.STOCK],
      activo: fila[CONFIG_FACTURACION.COLS_PRODUCTOS.ACTIVO] !== false
    })).filter(p => p.nombre);
  },

  /**
   * Obtiene productos activos
   */
  obtenerActivos: function() {
    return this.obtenerTodos().filter(p => p.activo && p.precio > 0);
  },

  /**
   * Agrega un producto
   */
  agregar: function(datos) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    // Generate a safe unique ID (max existing + 1) to avoid collisions after deletions
    let id = 1;
    if (lastRow > 1) {
      const ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues()
                      .flat().filter(v => typeof v === 'number' && v > 0);
      if (ids.length > 0) id = Math.max(...ids) + 1;
    }

    hoja.appendRow([
      id,
      datos.nombre || '',
      datos.precio || 0,
      datos.stock !== undefined ? datos.stock : 999999,
      true
    ]);

    return { id, ...datos, activo: true };
  },

  /**
   * Actualiza un producto
   */
  actualizar: function(id, datos) {
    const hoja = this.getHoja();
    const dataRange = hoja.getDataRange().getValues();

    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.ID] === id) {
        if (datos.nombre !== undefined) {
          hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_PRODUCTOS.NOMBRE + 1).setValue(datos.nombre);
        }
        if (datos.precio !== undefined) {
          hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_PRODUCTOS.PRECIO + 1).setValue(datos.precio);
        }
        if (datos.stock !== undefined) {
          hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_PRODUCTOS.STOCK + 1).setValue(datos.stock);
        }
        if (datos.activo !== undefined) {
          hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_PRODUCTOS.ACTIVO + 1).setValue(datos.activo);
        }
        return true;
      }
    }
    return false;
  },

  /**
   * Elimina un producto
   */
  eliminar: function(id) {
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (datos[i][CONFIG_FACTURACION.COLS_PRODUCTOS.ID] === id) {
        hoja.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  },

  /**
   * Descuenta stock de un producto
   * @param {number} id - ID del producto
   * @param {number} cantidad - Cantidad a descontar
   * @returns {boolean} True si se pudo descontar
   */
  descontarStock: function(id, cantidad) {
    const hoja = this.getHoja();
    const dataRange = hoja.getDataRange().getValues();

    for (let i = 1; i < dataRange.length; i++) {
      if (dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.ID] === id) {
        const stockActual = dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.STOCK];

        // Si es stock ilimitado, no descontar
        if (stockActual === 999999) return true;

        // Verificar si hay suficiente stock
        if (stockActual < cantidad) {
          throw new Error(`Stock insuficiente para producto ID ${id}. Disponible: ${stockActual}, Solicitado: ${cantidad}`);
        }

        // Descontar stock
        const nuevoStock = stockActual - cantidad;
        hoja.getRange(i + 1, CONFIG_FACTURACION.COLS_PRODUCTOS.STOCK + 1).setValue(nuevoStock);
        return true;
      }
    }
    return false;
  },

  /**
   * Valida si hay suficiente stock para una lista de productos sin descontar.
   * Agrega las cantidades por producto antes de validar.
   * @param {Array} productosConCantidad - Array de {id, cantidad}
   * @returns {{ok: boolean, errores: Array<string>}}
   */
  validarStock: function(productosConCantidad) {
    if (!productosConCantidad || productosConCantidad.length === 0) {
      return { ok: true, errores: [] };
    }

    // Agregar cantidades por ID de producto
    const cantidadesPorId = {};
    for (const prod of productosConCantidad) {
      const id = prod.id;
      cantidadesPorId[id] = (cantidadesPorId[id] || 0) + (prod.cantidad || 1);
    }

    const hoja = this.getHoja();
    const dataRange = hoja.getDataRange().getValues();
    const errores = [];

    for (const idStr of Object.keys(cantidadesPorId)) {
      const id = Number(idStr);
      const cantidadSolicitada = cantidadesPorId[idStr];
      let encontrado = false;

      for (let i = 1; i < dataRange.length; i++) {
        if (dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.ID] === id) {
          const stockActual = dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.STOCK];
          const nombre = dataRange[i][CONFIG_FACTURACION.COLS_PRODUCTOS.NOMBRE];
          encontrado = true;
          // Stock ilimitado: siempre ok
          if (stockActual === 999999) break;
          if (stockActual < cantidadSolicitada) {
            errores.push(nombre + ' (disponible: ' + stockActual + ', solicitado: ' + cantidadSolicitada + ')');
          }
          break;
        }
      }

      if (!encontrado) {
        errores.push('Producto ID ' + id + ' no encontrado');
      }
    }

    return { ok: errores.length === 0, errores: errores };
  }
};

// ============================================================================
// FUNCIONES API PARA FRONTEND
// ============================================================================

/**
 * Obtiene datos iniciales del módulo de facturación
 */
function obtenerDatosFacturacion() {
  try {
    const transferencias = TransferenciasRepository.obtenerTodas();
    const productos = ProductosRepository.obtenerTodos();

    return {
      success: true,
      transferencias: serializarParaWeb(transferencias),
      productos: serializarParaWeb(productos),
      apiKeyConfigured: ClaudeService.tieneApiKey()
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosFacturacion: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Agrega una transferencia manual
 */
function agregarTransferencia(datos) {
  try {
    const result = TransferenciasRepository.agregar(datos);
    return { success: true, transferencia: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Elimina una transferencia
 */
function eliminarTransferencia(id) {
  try {
    TransferenciasRepository.eliminar(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Actualiza una transferencia existente
 */
function actualizarTransferencia(id, datos) {
  try {
    TransferenciasRepository.actualizar(id, datos);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene una transferencia por ID
 */
function obtenerTransferencia(id) {
  try {
    const transferencia = TransferenciasRepository.buscarPorId(id);
    return { success: true, transferencia: transferencia };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Marca transferencia como facturada
 */
function marcarTransferenciaFacturada(id) {
  try {
    TransferenciasRepository.marcarFacturada(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * CRUD de productos
 */
function agregarProducto(datos) {
  try {
    const result = ProductosRepository.agregar(datos);
    return { success: true, producto: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function actualizarProducto(id, datos) {
  try {
    ProductosRepository.actualizar(id, datos);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function eliminarProducto(id) {
  try {
    ProductosRepository.eliminar(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Agrega productos de forma masiva
 * @param {Array} productos - Array de {nombre, precio, stock, activo}
 */
function agregarProductosMasivo(productos) {
  try {
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return { success: false, error: 'No hay productos para agregar' };
    }

    let agregados = 0;
    for (const producto of productos) {
      if (producto.nombre && producto.precio > 0) {
        ProductosRepository.agregar({
          nombre: producto.nombre,
          precio: producto.precio,
          stock: producto.stock || 999999,
          activo: producto.activo !== false
        });
        agregados++;
      }
    }

    return { success: true, agregados: agregados };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Procesa una factura: descuenta stock de productos y marca como facturada
 * @param {number} transferenciaid - ID de la transferencia
 * @param {Array} productosAsignados - Array de {id, cantidad}
 */
function procesarFacturaConStock(transferenciaId, productosAsignados) {
  try {
    // Primero descontar stock de todos los productos
    if (productosAsignados && productosAsignados.length > 0) {
      for (const prod of productosAsignados) {
        if (prod.id && prod.cantidad > 0) {
          ProductosRepository.descontarStock(prod.id, prod.cantidad);
        }
      }
    }

    // Luego marcar la transferencia como facturada
    TransferenciasRepository.marcarFacturada(transferenciaId);

    return { success: true, mensaje: 'Factura procesada correctamente' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PROCESAMIENTO DE IMAGENES CON CLAUDE
// ============================================================================

/**
 * Procesa imagen de comprobante bancario con Claude
 * Usa la misma API Key del sistema general (configurada en Configuración)
 */
function procesarImagenComprobante(base64Image) {
  const apiKey = ClaudeService.getApiKey();
  if (!apiKey) {
    return { success: false, error: 'API Key de Claude no configurada. Ve a Configuración del sistema para agregarla.' };
  }

  const systemPrompt = `Eres un experto forense en análisis de documentos bancarios argentinos.
Tu tarea es extraer datos financieros con máxima precisión, ignorando cualquier ruido visual como sombras, borrones, tachaduras o textos irrelevantes.
Prioriza siempre el texto manuscrito sobre el impreso cuando haya correcciones.
Usa el contexto de las columnas para interpretar datos borrosos.
IMPORTANTE: Protege la privacidad - NO incluyas números de cuenta, CBU, alias o datos sensibles.`;

  const userPrompt = `Analiza esta imagen de un documento bancario argentino.

**REGLAS:**
- Tachaduras: Si un texto está tachado, IGNÓRALO.
- Correcciones manuscritas: El texto manuscrito tiene prioridad sobre el impreso.
- Formato argentino: Montos usan punto para miles y coma para decimales (1.500,00).
- Fecha: Busca en encabezado. Formatos: '15/01/24', '15 Ene 2024'. Convierte a YYYY-MM-DD.

**EXTRACCIÓN:**
- Nombres: Normaliza a mayúsculas. Limpia prefijos como "Transf", "Pago a".
- Montos: Solo números del importe de transferencia.
- Bancos: Galicia, Santander, BBVA, Nación, Provincia, Macro, MP (MercadoPago), etc.

**SEGURIDAD:**
- NO incluyas números de cuenta, CBU, alias ni datos sensibles.
- Solo extrae: fecha, nombre del titular, monto, banco origen.

**SALIDA JSON:**
{
  "fecha_documento": "YYYY-MM-DD",
  "items": [
    { "nombre": "NOMBRE COMPLETO", "monto": 12500.50, "banco": "Galicia" }
  ]
}`;

  const messages = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
        { type: "text", text: userPrompt }
      ]
    }
  ];

  try {
    const payload = {
      model: CONFIG_FACTURACION.CLAUDE.MODEL,
      max_tokens: CONFIG_FACTURACION.CLAUDE.MAX_TOKENS,
      temperature: CONFIG_FACTURACION.CLAUDE.TEMPERATURE,
      system: systemPrompt,
      messages: messages
    };

    const options = {
      method: 'post',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG_FACTURACION.CLAUDE.API_URL, options);
    const code = response.getResponseCode();
    const text = response.getContentText();

    if (code !== 200) {
      let errorMsg = `Error ${code}`;
      try {
        errorMsg += `: ${JSON.parse(text).error.message}`;
      } catch (e) {
        errorMsg += `: ${text.substring(0, 100)}`;
      }
      return { success: false, error: errorMsg };
    }

    const json = JSON.parse(text);
    const responseText = json.content[0].text;

    // Extraer JSON de la respuesta
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) {
      return { success: false, error: 'La respuesta de Claude no contiene JSON válido' };
    }

    const datos = JSON.parse(match[0]);

    return {
      success: true,
      fecha: datos.fecha_documento,
      items: datos.items || [],
      tokensUsados: json.usage ? json.usage.input_tokens + json.usage.output_tokens : 0
    };

  } catch (error) {
    Logger.log('Error en procesarImagenComprobante: ' + error.message);
    return { success: false, error: 'Error procesando imagen: ' + error.message };
  }
}

/**
 * Importa transferencias detectadas por IA
 */
function importarTransferenciasIA(transferencias) {
  try {
    const resultados = TransferenciasRepository.agregarMultiples(transferencias);
    return {
      success: true,
      cantidad: resultados.length,
      transferencias: resultados
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// GENERADOR DE RESUMEN MENSUAL
// ============================================================================

/**
 * Genera resumen mensual de facturación
 */
function generarResumenFacturacion(mes, anio) {
  try {
    const ss = getSpreadsheet();
    const transferencias = TransferenciasRepository.obtenerPorMes(mes, anio);
    const productos = ProductosRepository.obtenerActivos();

    if (transferencias.length === 0) {
      return { success: false, error: 'No hay transferencias para el mes seleccionado' };
    }

    // Separar por tipo
    const facturasA = transferencias.filter(t => t.tipoFactura === 'A');
    const consumidoresFinales = transferencias.filter(t => t.tipoFactura === 'CONSUMIDOR FINAL');

    const nombreMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][mes - 1];

    // Crear hoja de Facturas A si hay
    if (facturasA.length > 0) {
      crearHojaFacturasA(ss, `Facturas A - ${nombreMes} ${anio}`, facturasA, productos);
    }

    // Crear hoja de Consumidores Finales si hay
    if (consumidoresFinales.length > 0) {
      crearHojaConsumidoresFinales(ss, `Consumidores Finales - ${nombreMes} ${anio}`, consumidoresFinales);
    }

    return {
      success: true,
      mensaje: `Resumen generado: ${facturasA.length} Facturas A, ${consumidoresFinales.length} Consumidores Finales`,
      facturasA: facturasA.length,
      consumidoresFinales: consumidoresFinales.length
    };

  } catch (error) {
    Logger.log('Error en generarResumenFacturacion: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Crea hoja de Facturas A con productos distribuidos
 */
function crearHojaFacturasA(ss, nombreHoja, transferencias, productos) {
  // Eliminar hoja si existe
  let hoja = ss.getSheetByName(nombreHoja);
  if (hoja) ss.deleteSheet(hoja);

  hoja = ss.insertSheet(nombreHoja);

  // Encabezado
  hoja.getRange(1, 1).setValue('FACTURAS A - ' + new Date().toLocaleDateString('es-AR'));
  hoja.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  hoja.getRange(1, 1, 1, 8).merge().setBackground('#2E7D32').setFontColor('white');

  // Info
  hoja.getRange(3, 1).setValue('Total transferencias:');
  hoja.getRange(3, 2).setValue(transferencias.length);
  hoja.getRange(4, 1).setValue('Monto total:');
  hoja.getRange(4, 2).setValue(transferencias.reduce((sum, t) => sum + t.monto, 0)).setNumberFormat('$#,##0.00');

  // Headers tabla
  const headers = ['Fecha', 'Cliente', 'Banco', 'Monto Transf.', 'Productos', 'Subtotal', 'IVA ' + CONFIG.getIVA().PORCENTAJE + '%', 'Total'];
  hoja.getRange(6, 1, 1, 8).setValues([headers]);
  hoja.getRange(6, 1, 1, 8).setFontWeight('bold').setBackground('#1976D2').setFontColor('white');

  // Datos
  let fila = 7;
  for (const t of transferencias) {
    const productosSeleccionados = seleccionarProductosParaMonto(t.monto, productos);
    const subtotal = productosSeleccionados.reduce((sum, p) => sum + p.precio, 0);
    const iva = subtotal * CONFIG_FACTURACION.getIVA();
    const total = subtotal + iva;

    hoja.getRange(fila, 1, 1, 8).setValues([[
      t.fecha,
      t.cliente,
      t.banco,
      t.monto,
      productosSeleccionados.map(p => p.nombre).join('; '),
      subtotal,
      iva,
      total
    ]]);

    hoja.getRange(fila, 4, 1, 5).setNumberFormat('$#,##0.00');
    fila++;
  }

  // Totales
  hoja.getRange(fila + 1, 1).setValue('TOTALES');
  hoja.getRange(fila + 1, 4).setFormula(`=SUM(D7:D${fila})`);
  hoja.getRange(fila + 1, 6).setFormula(`=SUM(F7:F${fila})`);
  hoja.getRange(fila + 1, 7).setFormula(`=SUM(G7:G${fila})`);
  hoja.getRange(fila + 1, 8).setFormula(`=SUM(H7:H${fila})`);
  hoja.getRange(fila + 1, 1, 1, 8).setFontWeight('bold').setBackground('#FFF3E0');

  hoja.autoResizeColumns(1, 8);
}

/**
 * Crea hoja de Consumidores Finales
 */
function crearHojaConsumidoresFinales(ss, nombreHoja, transferencias) {
  let hoja = ss.getSheetByName(nombreHoja);
  if (hoja) ss.deleteSheet(hoja);

  hoja = ss.insertSheet(nombreHoja);

  // Encabezado
  hoja.getRange(1, 1).setValue('CONSUMIDORES FINALES - ' + new Date().toLocaleDateString('es-AR'));
  hoja.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  hoja.getRange(1, 1, 1, 3).merge().setBackground('#2E7D32').setFontColor('white');

  // Info
  hoja.getRange(3, 1).setValue('Total transferencias:');
  hoja.getRange(3, 2).setValue(transferencias.length);
  hoja.getRange(4, 1).setValue('Monto total:');
  hoja.getRange(4, 2).setValue(transferencias.reduce((sum, t) => sum + t.monto, 0)).setNumberFormat('$#,##0.00');

  // Headers
  hoja.getRange(6, 1, 1, 3).setValues([['Fecha', 'Cliente', 'Importe']]);
  hoja.getRange(6, 1, 1, 3).setFontWeight('bold').setBackground('#1976D2').setFontColor('white');

  // Datos
  let fila = 7;
  for (const t of transferencias) {
    hoja.getRange(fila, 1, 1, 3).setValues([[t.fecha, t.cliente, t.monto]]);
    hoja.getRange(fila, 3).setNumberFormat('$#,##0.00');
    fila++;
  }

  // Total
  hoja.getRange(fila + 1, 1, 1, 2).setValues([['TOTAL', '']]);
  hoja.getRange(fila + 1, 1, 1, 2).merge();
  hoja.getRange(fila + 1, 3).setFormula(`=SUM(C7:C${fila})`);
  hoja.getRange(fila + 1, 1, 1, 3).setFontWeight('bold').setBackground('#FFF3E0');

  hoja.autoResizeColumns(1, 3);
}

/**
 * Selecciona productos para cubrir un monto (algoritmo simple)
 */
function seleccionarProductosParaMonto(montoObjetivo, productos) {
  if (!productos || productos.length === 0) return [];

  const baseAmount = montoObjetivo / (1 + CONFIG_FACTURACION.getIVA());
  const seleccionados = [];
  let sumaActual = 0;

  // Ordenar productos por precio descendente
  const productosOrdenados = [...productos].sort((a, b) => b.precio - a.precio);

  for (const p of productosOrdenados) {
    if (sumaActual + p.precio <= baseAmount * 1.05) {
      seleccionados.push(p);
      sumaActual += p.precio;
      if (sumaActual >= baseAmount) break;
    }
  }

  // Si no llegamos al monto, agregar el más pequeño
  if (sumaActual < baseAmount && productosOrdenados.length > 0) {
    const masBarato = productosOrdenados[productosOrdenados.length - 1];
    if (!seleccionados.find(s => s.id === masBarato.id)) {
      seleccionados.push(masBarato);
    }
  }

  return seleccionados;
}

/**
 * Prueba conexión con Claude (usa la API Key del sistema general)
 */
function probarConexionClaude() {
  const apiKey = ClaudeService.getApiKey();
  if (!apiKey) {
    return { success: false, error: 'API Key no configurada. Ve a Configuración del sistema.' };
  }

  try {
    const payload = {
      model: CONFIG_FACTURACION.CLAUDE.MODEL,
      max_tokens: 10,
      messages: [{ role: "user", content: "Ping" }]
    };

    const options = {
      method: 'post',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG_FACTURACION.CLAUDE.API_URL, options);
    const code = response.getResponseCode();

    if (code === 200) {
      return { success: true, mensaje: 'Conexión exitosa con Claude Sonnet 4.5' };
    } else {
      return { success: false, error: `Error ${code}: ${response.getContentText().substring(0, 100)}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Hoja Pendientes_ARCA: payload para reintento manual o trigger nocturno.
 * @param {Object} payload
 * @returns {{success: boolean, error?: string}}
 */
function encolarFacturaPendienteARCA(payload) {
  try {
    const ss = getSpreadsheet();
    const nombre = 'Pendientes_ARCA';
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      hoja.appendRow(['TIMESTAMP', 'PAYLOAD_JSON', 'ULTIMO_ERROR', 'REINTENTOS']);
    }
    hoja.appendRow([new Date(), JSON.stringify(payload || {}), '', 0]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
