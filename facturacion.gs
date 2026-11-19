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
   *
   * Con límite, devuelve las MÁS RECIENTES. Antes leía desde la fila 2 —las
   * más viejas— y recién después ordenaba descendente, así que obtenerPorMes,
   * que llama con límite 500, dejaba de ver el mes en curso en cuanto la hoja
   * pasaba las 500 filas: el resumen mensual devolvía cero transferencias.
   *
   * @param {number} limite - Máximo de registros (0 = todos)
   */
  obtenerTodas: function(limite = 0) {
    const hoja = this.getHoja();
    const lastRow = hoja.getLastRow();

    if (lastRow <= 1) return [];

    const totalFilas = lastRow - 1;
    // 0 = sin límite (todos los registros)
    const numRows  = (limite > 0) ? Math.min(limite, totalFilas) : totalFilas;
    // Con límite se arranca desde el final de la hoja, no desde el principio
    const startRow = (limite > 0) ? Math.max(2, lastRow - numRows + 1) : 2;
    const datos = hoja.getRange(startRow, 1, numRows, 10).getValues();

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

    // 1. El nombre guardado es siempre el que ingresa el usuario (ej. "Yeni")
    let nombreParaRegistro = (datos.cliente || '').toUpperCase().trim();
    if (!nombreParaRegistro) nombreParaRegistro = 'CONSUMIDOR FINAL';

    let clienteRegistrado = false;
    let condicionFiscalParaFactura = 'Consumidor Final';
    let cuitParaFactura = datos.cuit || '';

    const clienteData = ClientesRepository.buscarPorNombre(nombreParaRegistro);
    if (clienteData) {
      clienteRegistrado = true;
      condicionFiscalParaFactura = clienteData.condicionFiscal ||
        (clienteData.cuit ? 'Responsable Inscripto' : 'Consumidor Final');
      cuitParaFactura = clienteData.cuit || cuitParaFactura;
    } else if (datos.condicion && String(datos.condicion).trim()) {
      condicionFiscalParaFactura = datos.condicion;
    }

    const condUpper = String(condicionFiscalParaFactura || '').toUpperCase();
    const tipoFactura = (condicionFiscalParaFactura === 'RI' ||
                         condUpper.indexOf('RESPONSABLE') >= 0 ||
                         condUpper.indexOf('MONOTRIBUT') >= 0) ? 'A' : 'B';

    // TRAZABILIDAD PARA CLIENTES NO REGISTRADOS:
    // Guardar nombre original y CUIT opcional en observaciones (formato estructurado)
    let obs = datos.obs || '';
    if (!clienteRegistrado) {
      // Agregar metadata estructurada para trazabilidad
      const metadataNoRegistrado = {
        noRegistrado: true,
        nombreOriginal: nombreParaRegistro,
        cuitProporcionado: cuitParaFactura || null,
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
      nombreParaRegistro,
      datos.monto || 0,
      datos.banco || '',
      condicionFiscalParaFactura,
      tipoFactura,
      false,
      '',
      obs
    ];

    hoja.appendRow(nuevaFila);

    return {
      id: id,
      fecha: datos.fecha,
      cliente: nombreParaRegistro,
      clienteRegistrado: clienteRegistrado,
      nombreOriginal: nombreParaRegistro,
      cuitProporcionado: cuitParaFactura,
      monto: datos.monto,
      banco: datos.banco,
      condicion: condicionFiscalParaFactura,
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
    // Delega en el lote para tener una sola ruta de codigo y las mismas
    // garantias, pero CONSERVA EXACTAMENTE el contrato anterior:
    //   - lanza si el stock no alcanza,
    //   - devuelve false si el producto no existe,
    //   - devuelve true si descontó o si era stock ilimitado.
    //
    // El "producto no encontrado" se traduce de vuelta a false a proposito:
    // descontarStockLote lo trata como error porque ahi si importa, pero el
    // unico llamador de esta funcion (la emision ARCA, despues de obtener el
    // CAE) espera el comportamiento viejo. Cambiarselo por una excepcion
    // alteraria su flujo sin que nadie lo haya pedido.
    try {
      const res = this.descontarStockLote([{ id: id, cantidad: cantidad }]);
      return res.encontrados > 0;
    } catch (e) {
      if (String(e.message || '').indexOf('no encontrado') > -1) return false;
      throw e;
    }
  },

  /**
   * Descuenta stock de varios productos como UNA SOLA operacion.
   *
   * Por que existe: antes se llamaba a descontarStock producto por producto
   * dentro de un bucle. Eso tenia dos problemas graves:
   *
   *  1. SIN ATOMICIDAD. Si el tercer producto no tenia stock, los dos
   *     primeros YA estaban descontados y la transferencia no se marcaba como
   *     facturada. Quedaba stock restado de una factura que nunca se emitio.
   *
   *  2. SIN CANDADO ENTRE VALIDAR Y DESCONTAR. validarStock leia la hoja y
   *     descontarStock la volvia a leer y escribia. Dos facturas simultaneas
   *     del ultimo producto pasaban AMBAS la validacion y el stock terminaba
   *     en negativo.
   *
   * Aqui se valida TODO primero, en memoria, sobre una unica lectura de la
   * hoja; si algo falla no se escribe nada. Y se devuelven los valores
   * anteriores para poder revertir con restaurarStock si falla un paso
   * posterior.
   *
   * @param {Array<{id: number, cantidad: number}>} items
   * @returns {{aplicados: Array<{fila: number, id: number, nombre: string, anterior: number, nuevo: number}>, encontrados: number, ilimitados: number}}
   * @throws {Error} Si algun producto no existe o no tiene stock suficiente
   */
  descontarStockLote: function(items) {
    const C = CONFIG_FACTURACION.COLS_PRODUCTOS;
    const STOCK_ILIMITADO = 999999;

    if (!items || items.length === 0) {
      return { aplicados: [], encontrados: 0, ilimitados: 0 };
    }

    // Agregar cantidades por producto: el mismo id puede venir repetido, y
    // validar cada aparicion por separado dejaria pasar la suma
    const pedido = {};
    for (let i = 0; i < items.length; i++) {
      const id = Number(items[i] && items[i].id);
      const cant = Number(items[i] && items[i].cantidad) || 0;
      if (!id || cant <= 0) continue;
      pedido[id] = (pedido[id] || 0) + cant;
    }
    const ids = Object.keys(pedido);
    if (ids.length === 0) {
      return { aplicados: [], encontrados: 0, ilimitados: 0 };
    }

    // UNA sola lectura de la hoja para todo el lote
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();

    const porId = {};
    for (let f = 1; f < datos.length; f++) {
      const idFila = Number(datos[f][C.ID]);
      if (idFila) porId[idFila] = f;
    }

    // ── Fase 1: validar TODO. Ni una escritura hasta terminar ──────────────
    const errores = [];
    const planificados = [];
    let ilimitados = 0;

    for (let k = 0; k < ids.length; k++) {
      const id = Number(ids[k]);
      const cantidad = pedido[ids[k]];
      const fila = porId[id];

      if (fila === undefined) {
        errores.push('Producto ID ' + id + ' no encontrado');
        continue;
      }

      const stockActual = Number(datos[fila][C.STOCK]);
      const nombre = String(datos[fila][C.NOMBRE] || ('ID ' + id));

      if (stockActual === STOCK_ILIMITADO) {
        ilimitados++;
        continue; // stock ilimitado: no se toca
      }
      if (!isFinite(stockActual) || stockActual < cantidad) {
        errores.push('Stock insuficiente para "' + nombre + '" (disponible: ' +
                     (isFinite(stockActual) ? stockActual : 0) + ', solicitado: ' + cantidad + ')');
        continue;
      }

      planificados.push({
        fila: fila,
        id: id,
        nombre: nombre,
        anterior: stockActual,
        nuevo: stockActual - cantidad
      });
    }

    if (errores.length > 0) {
      // Nada se escribio: el estado de la hoja queda exactamente como estaba
      throw new Error(errores.join(' · '));
    }

    // ── Fase 2: recien ahora se escribe ───────────────────────────────────
    for (let j = 0; j < planificados.length; j++) {
      hoja.getRange(planificados[j].fila + 1, C.STOCK + 1).setValue(planificados[j].nuevo);
      Logger.log('[STOCK] "' + planificados[j].nombre + '": ' +
                 planificados[j].anterior + ' → ' + planificados[j].nuevo);
    }

    return {
      aplicados: planificados,
      encontrados: planificados.length + ilimitados,
      ilimitados: ilimitados
    };
  },

  /**
   * Devuelve el stock a sus valores anteriores.
   *
   * Es la reversion de descontarStockLote, para cuando un paso POSTERIOR al
   * descuento falla (por ejemplo, marcar la transferencia como facturada) y
   * dejar el stock restado seria incorrecto.
   *
   * @param {Array<{fila: number, anterior: number, nombre: string}>} aplicados
   * @returns {number} Cuantas filas se restauraron
   */
  restaurarStock: function(aplicados) {
    if (!aplicados || aplicados.length === 0) return 0;
    const C = CONFIG_FACTURACION.COLS_PRODUCTOS;
    const hoja = this.getHoja();
    let n = 0;
    for (let i = 0; i < aplicados.length; i++) {
      try {
        hoja.getRange(aplicados[i].fila + 1, C.STOCK + 1).setValue(aplicados[i].anterior);
        Logger.log('[STOCK] Revertido "' + aplicados[i].nombre + '" a ' + aplicados[i].anterior);
        n++;
      } catch (e) {
        Logger.log('[STOCK] CRITICO: no se pudo revertir "' + aplicados[i].nombre +
                   '" a ' + aplicados[i].anterior + ': ' + e.message);
      }
    }
    return n;
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
      ocrDisponible: true  // el OCR gratuito no necesita credenciales
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
  // Candado sobre TODA la operacion: descontar el stock y marcar la
  // transferencia tienen que pasar juntos o no pasar. Sin el, validar y
  // descontar eran dos lecturas separadas y dos facturas simultaneas del
  // ultimo producto pasaban ambas la validacion.
  const lock = LockService.getScriptLock();
  let lockAdquirido = false;
  let aplicados = null;

  try {
    lock.waitLock(30000);
    lockAdquirido = true;

    // Un solo paso que valida todo primero y recien despues escribe. Si
    // algun producto no alcanza, no se descuenta NINGUNO: antes se iba
    // descontando de a uno y un fallo a mitad de camino dejaba stock restado
    // de una factura que nunca se marcaba como emitida.
    if (productosAsignados && productosAsignados.length > 0) {
      const res = ProductosRepository.descontarStockLote(productosAsignados);
      aplicados = res.aplicados;
    }

    const marcada = TransferenciasRepository.marcarFacturada(transferenciaId);
    if (!marcada) {
      throw new Error('No se encontró la transferencia ' + transferenciaId + ' para marcarla como facturada.');
    }

    return {
      success: true,
      mensaje: 'Factura procesada correctamente',
      stockDescontado: aplicados ? aplicados.length : 0
    };

  } catch (error) {
    // REVERSION: si el stock ya se descontó y el marcado fallo, se devuelve.
    // Dejarlo restado sin factura emitida falsearia el inventario.
    if (aplicados && aplicados.length > 0) {
      const revertidos = ProductosRepository.restaurarStock(aplicados);
      Logger.log('[procesarFacturaConStock] Falló tras descontar stock. Revertidos ' +
                 revertidos + ' de ' + aplicados.length + ' productos. Motivo: ' + error.message);
      if (revertidos < aplicados.length) {
        return {
          success: false,
          error: error.message + ' · ATENCIÓN: no se pudo devolver el stock de ' +
                 (aplicados.length - revertidos) + ' producto(s). Revisalos a mano en la hoja Productos.',
          requiereAtencion: 'STOCK_SIN_REVERTIR'
        };
      }
      return { success: false, error: error.message + ' · El stock se devolvió sin cambios.' };
    }
    Logger.log('[procesarFacturaConStock] ' + error.message);
    return { success: false, error: error.message };

  } finally {
    if (lockAdquirido) lock.releaseLock();
  }
}

// ============================================================================
// PROCESAMIENTO DE IMAGENES CON OCR GRATUITO
// ============================================================================

/**
 * Lee una captura de comprobantes bancarios con OCR GRATUITO.
 *
 * Antes mandaba la imagen a la API de Claude, con su clave y su costo por
 * imagen. Ahora usa el OCR de Drive, que no cuesta nada y no necesita
 * credenciales. Este caso le resulta favorable: son capturas de homebanking,
 * texto renderizado en pantalla, nitido y alineado — muy distinto del libro
 * manuscrito.
 *
 * Mantiene el contrato de antes, { success, fecha, items[] }, para que el
 * frontend siga funcionando sin cambios.
 *
 * @param {string} base64Image - Imagen en base64
 * @returns {{success: boolean, fecha?: string, items?: Array, error?: string}}
 */
function procesarImagenComprobante(base64Image) {
  try {
    if (!base64Image) {
      return { success: false, error: 'No se recibió ninguna imagen.' };
    }

    const cfg = CONFIG.getOcr();
    const lectura = OcrService.leerConDrive(base64Image, cfg.IDIOMA);
    if (!lectura.success) {
      return { success: false, error: lectura.error };
    }

    const extracto = OcrService.interpretarExtracto(lectura.texto);

    // Casar cada nombre leído con el padrón: es lo que más precisión aporta
    const items = extracto.items.map(function(item) {
      const busqueda = ClientesRepository.buscarConSugerencias(normalizarString(item.nombre));
      return {
        nombre: busqueda.exacto ? busqueda.exacto.nombre : item.nombre,
        nombreLeido: item.nombre,
        monto: item.monto,
        banco: item.banco,
        enPadron: !!busqueda.exacto,
        sugerencias: busqueda.exacto ? [] :
          (busqueda.sugerencias || []).map(function(sg) { return sg.nombre; })
      };
    });

    if (items.length === 0) {
      return {
        success: false,
        error: 'No se detectó ninguna transferencia en la imagen. Probá con una ' +
               'captura más nítida o cargalas a mano.',
        textoCrudo: lectura.texto
      };
    }

    return {
      success: true,
      fecha: extracto.fecha,
      items: items,
      motor: 'ocr-drive',
      ms: lectura.ms,
      textoCrudo: lectura.texto
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

    // Separar por tipo.
    //
    // El alta escribe tipoFactura como 'A' o 'B' (ver línea ~216), pero este
    // filtro comparaba contra 'CONSUMIDOR FINAL', un valor que el sistema
    // NUNCA escribe en esa columna: solo lo usa como nombre de cliente. Por
    // eso la rama nunca se ejecutaba, TODAS las facturas B quedaban fuera del
    // resumen y la hoja «Consumidores Finales» no se generaba jamás.
    //
    // Se acepta también el valor antiguo por si alguna fila histórica lo tiene.
    const esA = function(t) { return String(t.tipoFactura || '').toUpperCase() === 'A'; };
    const esB = function(t) {
      const tipo = String(t.tipoFactura || '').toUpperCase();
      return tipo === 'B' || tipo === 'CONSUMIDOR FINAL';
    };

    const facturasA = transferencias.filter(esA);
    const consumidoresFinales = transferencias.filter(esB);

    // Nada debe desaparecer en silencio: si alguna fila no entra en ninguna
    // categoría (columna vacía o valor inesperado), se informa.
    const sinClasificar = transferencias.filter(function(t) { return !esA(t) && !esB(t); });

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

    let mensaje = `Resumen generado: ${facturasA.length} Facturas A, ${consumidoresFinales.length} Consumidores Finales`;
    if (sinClasificar.length > 0) {
      mensaje += ` · Atención: ${sinClasificar.length} transferencia(s) sin tipo de factura quedaron fuera del resumen`;
      Logger.log('[FACT] Transferencias sin clasificar en el resumen de ' + nombreMes + ' ' + anio +
        ': ' + sinClasificar.map(function(t) { return t.id; }).join(', '));
    }

    return {
      success: true,
      mensaje: mensaje,
      facturasA: facturasA.length,
      consumidoresFinales: consumidoresFinales.length,
      sinClasificar: sinClasificar.length
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
 * Comprueba que el OCR gratuito funciona de punta a punta.
 *
 * Reemplaza a probarConexionClaude, que hacía un ping a la API de Anthropic.
 * Ya no hay ninguna API externa ni clave que probar: lo que importa es que el
 * servicio de Drive esté habilitado y que el reconocimiento devuelva texto.
 * Para eso genera una imagen mínima con una palabra conocida y la lee.
 *
 * @returns {{success: boolean, mensaje?: string, error?: string}}
 */
function probarOcrGratuito() {
  try {
    // En Apps Script cada archivo .gs que falta en el proyecto aparece como
    // "X is not defined", sin decir que hacer. Aca se dice exactamente cual falta.
    const faltantes = [];
    if (typeof OcrService === 'undefined') faltantes.push('ocr.gs');
    if (typeof NombresEs === 'undefined') faltantes.push('nombres_es.gs');
    if (faltantes.length > 0) {
      return {
        success: false,
        error: 'Falta subir a Apps Script: ' + faltantes.join(' y ') + '. Creá cada uno con ' +
               '"+ → Script", con ese nombre, y pegá su contenido completo. Si además quedó el ' +
               'viejo claude.gs, borralo: duplica ImageCache y hace que ocr.gs no cargue.'
      };
    }
    if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.create) {
      return {
        success: false,
        error: 'El servicio avanzado de Drive no está habilitado. Activalo en el ' +
               'editor de Apps Script: Servicios → Drive API v3.'
      };
    }

    // PNG mínimo (1x1) solo para comprobar el circuito: crear, exportar, borrar.
    // No se espera texto de una imagen de un píxel; lo que se valida es que
    // Drive acepte la conversión y devuelva el documento sin error.
    const pngMinimo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    const lectura = OcrService.leerConDrive('data:image/png;base64,' + pngMinimo, CONFIG.getOcr().IDIOMA);

    if (!lectura.success) {
      return { success: false, error: lectura.error };
    }

    return {
      success: true,
      mensaje: 'OCR gratuito operativo (OCR de Drive, ' + lectura.ms + ' ms). ' +
               'No requiere ninguna clave ni tiene costo por imagen.'
    };
  } catch (error) {
    Logger.log('Error en probarOcrGratuito: ' + error.message);
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
