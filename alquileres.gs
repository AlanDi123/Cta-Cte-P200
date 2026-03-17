/**
 * ============================================================================
 * REPOSITORIO DE ALQUILERES - SISTEMA SOL & VERDE
 * ============================================================================
 * Gestion de alquileres de puestos con pagos semanales y facturas mensuales
 * Inquilinos: ORTIZ JESUS, FLORES FLORIBEL
 * ============================================================================
 */

const AlquileresRepository = {

  getHoja: function() {
    var ss = getSpreadsheet();
    var hoja = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES);
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.ALQUILERES);
      hoja.appendRow(['ID', 'FECHA', 'INQUILINO', 'TIPO', 'MONTO', 'SEMANA', 'AÑO', 'MES', 'SEMANAS_CUBIERTAS', 'OBS', 'TIMESTAMP']);
      hoja.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#6A1B9A').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }
    return hoja;
  },

  getHojaConfig: function() {
    var ss = getSpreadsheet();
    var hoja = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES_CONFIG);
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.ALQUILERES_CONFIG);
      hoja.appendRow(['INQUILINO', 'MONTO_SEMANAL', 'AJUSTE_OBRA', 'AJUSTE_MERCADERIA', 'SALDO', 'ULTIMO_PAGO', 'OBS']);
      hoja.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#6A1B9A').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
      // Insertar inquilinos iniciales
      const inquilinos = CONFIG.getInquilinos();
      for (var i = 0; i < inquilinos.length; i++) {
        hoja.appendRow([inquilinos[i], 400000, 0, 0, 0, '', '']);
      }
    }
    return hoja;
  },

  generarNuevoID: function() {
    var hoja = this.getHoja();
    var lastRow = hoja.getLastRow();
    if (lastRow <= 1) return 1;
    var ids = hoja.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(function(id) { return id; });
    return ids.length > 0 ? Math.max.apply(null, ids) + 1 : 1;
  },

  // =========================================================================
  // CONFIGURACION DE INQUILINOS
  // =========================================================================

  obtenerConfigInquilino: function(inquilino) {
    var hoja = this.getHojaConfig();
    var datos = hoja.getDataRange().getValues();
    var nombre = normalizarString(inquilino);

    for (var i = 1; i < datos.length; i++) {
      if (normalizarString(datos[i][CONFIG.COLS_ALQ_CONFIG.INQUILINO]) === nombre) {
        return {
          inquilino: datos[i][CONFIG.COLS_ALQ_CONFIG.INQUILINO],
          montoSemanal: datos[i][CONFIG.COLS_ALQ_CONFIG.MONTO_SEMANAL] || 0,
          ajusteObra: datos[i][CONFIG.COLS_ALQ_CONFIG.AJUSTE_OBRA] || 0,
          ajusteMercaderia: datos[i][CONFIG.COLS_ALQ_CONFIG.AJUSTE_MERCADERIA] || 0,
          saldo: datos[i][CONFIG.COLS_ALQ_CONFIG.SALDO] || 0,
          ultimoPago: datos[i][CONFIG.COLS_ALQ_CONFIG.ULTIMO_PAGO] || '',
          obs: datos[i][CONFIG.COLS_ALQ_CONFIG.OBS] || '',
          montoEfectivo: (datos[i][CONFIG.COLS_ALQ_CONFIG.MONTO_SEMANAL] || 0) +
                         (datos[i][CONFIG.COLS_ALQ_CONFIG.AJUSTE_OBRA] || 0) -
                         (datos[i][CONFIG.COLS_ALQ_CONFIG.AJUSTE_MERCADERIA] || 0),
          fila: i + 1
        };
      }
    }
    return null;
  },

  obtenerTodosInquilinos: function() {
    const inquilinos = CONFIG.getInquilinos();
    var resultado = [];
    for (var i = 0; i < inquilinos.length; i++) {
      var config = this.obtenerConfigInquilino(inquilinos[i]);
      if (config) resultado.push(config);
    }
    return resultado;
  },

  actualizarConfigInquilino: function(inquilino, datos) {
    var config = this.obtenerConfigInquilino(inquilino);
    if (!config) throw new Error('Inquilino no encontrado: ' + inquilino);

    var hoja = this.getHojaConfig();
    var fila = config.fila;
    var C = CONFIG.COLS_ALQ_CONFIG;

    if (datos.montoSemanal !== undefined) hoja.getRange(fila, C.MONTO_SEMANAL + 1).setValue(datos.montoSemanal);
    if (datos.ajusteObra !== undefined) hoja.getRange(fila, C.AJUSTE_OBRA + 1).setValue(datos.ajusteObra);
    if (datos.ajusteMercaderia !== undefined) hoja.getRange(fila, C.AJUSTE_MERCADERIA + 1).setValue(datos.ajusteMercaderia);
    if (datos.saldo !== undefined) hoja.getRange(fila, C.SALDO + 1).setValue(datos.saldo);
    if (datos.ultimoPago !== undefined) hoja.getRange(fila, C.ULTIMO_PAGO + 1).setValue(datos.ultimoPago);
    if (datos.obs !== undefined) hoja.getRange(fila, C.OBS + 1).setValue(datos.obs);

    return this.obtenerConfigInquilino(inquilino);
  },

  // =========================================================================
  // REGISTRO DE PAGOS Y FACTURAS
  // =========================================================================

  registrarPago: function(datos) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);

      var hoja = this.getHoja();
      var id = this.generarNuevoID();
      var fecha = datos.fecha ? parsearFechaLocal(datos.fecha) : new Date();
      var infoSemana = this.obtenerInfoSemana(fecha);

      var nuevaFila = [
        id,
        fecha,
        normalizarString(datos.inquilino),
        datos.tipo || CONFIG.TIPOS_ALQUILER.PAGO_SEMANAL,
        datos.monto,
        datos.semana || infoSemana.semana,
        datos.anio || infoSemana.anio,
        datos.mes || (fecha.getMonth() + 1),
        datos.semanasCubiertas || '',
        datos.obs || '',
        new Date()
      ];

      hoja.appendRow(nuevaFila);

      // Actualizar saldo y ultimo pago en config
      var config = this.obtenerConfigInquilino(datos.inquilino);
      if (config) {
        this.actualizarConfigInquilino(datos.inquilino, {
          ultimoPago: fecha
        });
      }

      lock.releaseLock();

      return {
        id: id,
        fecha: fecha.toISOString(),
        inquilino: normalizarString(datos.inquilino),
        tipo: datos.tipo || CONFIG.TIPOS_ALQUILER.PAGO_SEMANAL,
        monto: datos.monto,
        semana: datos.semana || infoSemana.semana,
        anio: datos.anio || infoSemana.anio,
        semanasCubiertas: datos.semanasCubiertas || '',
        obs: datos.obs || ''
      };

    } catch (error) {
      lock.releaseLock();
      Logger.log('[ALQUILERES] Error en registrarPago: ' + error.message);
      throw error;
    }
  },

  registrarFacturaMensual: function(datos) {
    var config = this.obtenerConfigInquilino(datos.inquilino);
    if (!config) throw new Error('Inquilino no encontrado: ' + datos.inquilino);

    var montoSemanal = config.montoEfectivo;
    var semanasCubiertas = montoSemanal > 0 ? Math.floor(datos.monto / montoSemanal) : 0;

    // Encontrar semanas impagas para marcar como cubiertas
    var anio = datos.anio || new Date().getFullYear();
    var mes = datos.mes || (new Date().getMonth() + 1);
    var semanasImpagasList = this.obtenerSemanasImpagas(datos.inquilino, anio);
    var cubiertasStr = semanasImpagasList.slice(0, semanasCubiertas).map(function(s) {
      return s.semana;
    }).join(',');

    return this.registrarPago({
      inquilino: datos.inquilino,
      tipo: CONFIG.TIPOS_ALQUILER.FACTURA_MENSUAL,
      monto: datos.monto,
      semana: 0, // factura no es de una semana especifica
      anio: anio,
      mes: mes,
      semanasCubiertas: cubiertasStr,
      obs: datos.obs || ('Factura mensual - cubre ' + semanasCubiertas + ' semanas'),
      fecha: datos.fecha
    });
  },

  // =========================================================================
  // CONSULTAS
  // =========================================================================

  obtenerMovimientos: function(inquilino, anio) {
    var hoja = this.getHoja();
    var lastRow = hoja.getLastRow();
    if (lastRow <= 1) return [];

    var datos = hoja.getRange(2, 1, lastRow - 1, 11).getValues();
    var nombre = normalizarString(inquilino);
    var movimientos = [];

    for (var i = 0; i < datos.length; i++) {
      var fila = datos[i];
      var filaInquilino = normalizarString(fila[CONFIG.COLS_ALQUILERES.INQUILINO]);
      var filaAnio = fila[CONFIG.COLS_ALQUILERES.ANIO];

      if (filaInquilino === nombre && (!anio || filaAnio === anio)) {
        movimientos.push({
          id: fila[CONFIG.COLS_ALQUILERES.ID],
          fecha: fila[CONFIG.COLS_ALQUILERES.FECHA] instanceof Date ? fila[CONFIG.COLS_ALQUILERES.FECHA].toISOString() : fila[CONFIG.COLS_ALQUILERES.FECHA],
          inquilino: fila[CONFIG.COLS_ALQUILERES.INQUILINO],
          tipo: fila[CONFIG.COLS_ALQUILERES.TIPO],
          monto: fila[CONFIG.COLS_ALQUILERES.MONTO],
          semana: fila[CONFIG.COLS_ALQUILERES.SEMANA],
          anio: fila[CONFIG.COLS_ALQUILERES.ANIO],
          mes: fila[CONFIG.COLS_ALQUILERES.MES],
          semanasCubiertas: fila[CONFIG.COLS_ALQUILERES.SEMANAS_CUBIERTAS] || '',
          obs: fila[CONFIG.COLS_ALQUILERES.OBS] || ''
        });
      }
    }

    return movimientos.reverse(); // mas recientes primero
  },

  obtenerMovimientosRecientes: function(limite) {
    var hoja = this.getHoja();
    var lastRow = hoja.getLastRow();
    if (lastRow <= 1) return [];

    var rowsToRead = Math.min(limite || 20, lastRow - 1);
    var startRow = Math.max(2, lastRow - rowsToRead + 1);
    var datos = hoja.getRange(startRow, 1, rowsToRead, 11).getValues();
    var movimientos = [];

    for (var i = datos.length - 1; i >= 0; i--) {
      var fila = datos[i];
      if (!fila[CONFIG.COLS_ALQUILERES.ID]) continue;
      movimientos.push({
        id: fila[CONFIG.COLS_ALQUILERES.ID],
        fecha: fila[CONFIG.COLS_ALQUILERES.FECHA] instanceof Date ? fila[CONFIG.COLS_ALQUILERES.FECHA].toISOString() : '',
        inquilino: fila[CONFIG.COLS_ALQUILERES.INQUILINO],
        tipo: fila[CONFIG.COLS_ALQUILERES.TIPO],
        monto: fila[CONFIG.COLS_ALQUILERES.MONTO],
        semana: fila[CONFIG.COLS_ALQUILERES.SEMANA],
        obs: fila[CONFIG.COLS_ALQUILERES.OBS] || ''
      });
    }

    return movimientos;
  },

  // =========================================================================
  // CALENDARIO - ESTADO DE SEMANAS
  // =========================================================================

  obtenerInfoSemana: function(fecha) {
    var d = fecha instanceof Date ? fecha : parsearFechaLocal(fecha);
    // ISO week number
    var temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
    return { semana: weekNo, anio: temp.getUTCFullYear() };
  },

  obtenerFechasDeSemana: function(anio, semana) {
    // Primer jueves del año
    var jan4 = new Date(anio, 0, 4);
    var dayOfWeek = jan4.getDay() || 7;
    var firstMonday = new Date(anio, 0, 4 - dayOfWeek + 1);
    var inicio = new Date(firstMonday);
    inicio.setDate(inicio.getDate() + (semana - 1) * 7);
    var fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return { inicio: inicio, fin: fin };
  },

  // AGREGAR esta función auxiliar nueva dentro de AlquileresRepository
  // Calcula si el año tiene 52 o 53 semanas ISO
  _semanaISOMaxima: function(anio) {
    // La semana 28 de diciembre siempre pertenece a la última semana del año ISO
    var dic28 = new Date(anio, 11, 28);
    return this.obtenerInfoSemana(dic28).semana;
  },

  obtenerEstadoCalendario: function(inquilino, anio) {
    var movimientos = this.obtenerMovimientos(inquilino, anio);

    // Mapear semanas pagadas
    var semanasPagadas = {};

    for (var i = 0; i < movimientos.length; i++) {
      var mov = movimientos[i];

      if (mov.tipo === CONFIG.TIPOS_ALQUILER.PAGO_SEMANAL && mov.semana) {
        if (!semanasPagadas[mov.semana]) semanasPagadas[mov.semana] = 0;
        semanasPagadas[mov.semana] += mov.monto;
      }

      // Facturas mensuales cubren semanas
      if (mov.tipo === CONFIG.TIPOS_ALQUILER.FACTURA_MENSUAL && mov.semanasCubiertas) {
        var cubiertas = String(mov.semanasCubiertas).split(',');
        for (var j = 0; j < cubiertas.length; j++) {
          var sem = parseInt(cubiertas[j]);
          if (sem) {
            if (!semanasPagadas[sem]) semanasPagadas[sem] = 0;
            semanasPagadas[sem] += mov.monto / cubiertas.length;
          }
        }
      }
    }

    // Construir calendario por mes
    var config = this.obtenerConfigInquilino(inquilino);
    var montoSemanal = config ? config.montoEfectivo : 400000;
    var hoy = new Date();
    var semanaActual = this.obtenerInfoSemana(hoy);

    var meses = [];
    var nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    for (var mes = 0; mes < 12; mes++) {
      var semanasDelMes = [];
      // Encontrar semanas que pertenecen a este mes
      var primerDia = new Date(anio, mes, 1);
      var ultimoDia = new Date(anio, mes + 1, 0);

      var semInicio = this.obtenerInfoSemana(primerDia).semana;
      var semFin = this.obtenerInfoSemana(ultimoDia).semana;

      // Manejar cambio de año en diciembre
      if (mes === 11 && semFin < semInicio) {
        // Usar la semana máxima real del año (52 o 53 según el año)
        semFin = this._semanaISOMaxima(anio);
      }
      // Manejar inicio de enero: si la semana 1 pertenece al año anterior,
      // la primera semana del año actual puede empezar en 1 directamente
      if (mes === 0 && semInicio > 50) {
        // Las semanas > 50 en enero pertenecen al año anterior, empezar desde semana 1
        semInicio = 1;
      }

      for (var s = semInicio; s <= semFin; s++) {
        var pagado = semanasPagadas[s] || 0;
        var estado = 'futuro';
        var esFuturo = (anio > semanaActual.anio) || (anio === semanaActual.anio && s > semanaActual.semana);

        if (!esFuturo) {
          if (pagado >= montoSemanal) {
            estado = 'pagado';
          } else if (pagado > 0) {
            estado = 'parcial';
          } else {
            estado = 'impago';
          }
        }

        var fechas = this.obtenerFechasDeSemana(anio, s);
        // Usar formato YYYY-MM-DD en zona horaria local para evitar desfase UTC en el cliente
        var tz = Session.getScriptTimeZone();
        semanasDelMes.push({
          semana: s,
          estado: estado,
          montoPagado: pagado,
          montoEsperado: montoSemanal,
          fechaInicio: Utilities.formatDate(fechas.inicio, tz, 'yyyy-MM-dd'),
          fechaFin:    Utilities.formatDate(fechas.fin,    tz, 'yyyy-MM-dd')
        });
      }

      meses.push({
        mes: mes + 1,
        nombre: nombresMeses[mes],
        semanas: semanasDelMes
      });
    }

    return { anio: anio, meses: meses, montoSemanal: montoSemanal };
  },

  obtenerSemanasImpagas: function(inquilino, anio) {
    var calendario = this.obtenerEstadoCalendario(inquilino, anio);
    var impagas = [];
    for (var m = 0; m < calendario.meses.length; m++) {
      var semanas = calendario.meses[m].semanas;
      for (var s = 0; s < semanas.length; s++) {
        if (semanas[s].estado === 'impago' || semanas[s].estado === 'parcial') {
          impagas.push(semanas[s]);
        }
      }
    }
    return impagas;
  }
};

// ============================================================================
// API PUBLICA - ALQUILERES
// ============================================================================

function obtenerDatosAlquileres() {
  try {
    var inquilinos = AlquileresRepository.obtenerTodosInquilinos();
    var recientes = AlquileresRepository.obtenerMovimientosRecientes(20);

    return {
      success: true,
      inquilinos: serializarParaWeb(inquilinos),
      movimientosRecientes: serializarParaWeb(recientes)
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosAlquileres: ' + error.message);
    return { success: false, error: error.message };
  }
}

function obtenerCalendarioAlquiler(inquilino, anio) {
  try {
    var calendario = AlquileresRepository.obtenerEstadoCalendario(inquilino, anio);
    var config = AlquileresRepository.obtenerConfigInquilino(inquilino);
    var impagas = AlquileresRepository.obtenerSemanasImpagas(inquilino, anio);
    var movimientos = AlquileresRepository.obtenerMovimientos(inquilino, anio);

    return {
      success: true,
      calendario: serializarParaWeb(calendario),
      config: serializarParaWeb(config),
      semanasImpagas: serializarParaWeb(impagas),
      movimientos: serializarParaWeb(movimientos)
    };
  } catch (error) {
    Logger.log('Error en obtenerCalendarioAlquiler: ' + error.message);
    return { success: false, error: error.message };
  }
}

function guardarPagoAlquiler(datos) {
  try {
    if (!datos.inquilino) throw new Error('Inquilino requerido');
    if (!datos.monto || datos.monto <= 0) throw new Error('Monto invalido');

    var resultado;
    if (datos.tipo === CONFIG.TIPOS_ALQUILER.FACTURA_MENSUAL) {
      resultado = AlquileresRepository.registrarFacturaMensual(datos);
    } else {
      resultado = AlquileresRepository.registrarPago(datos);
    }

    var config = AlquileresRepository.obtenerConfigInquilino(datos.inquilino);

    // Invalidar cache de alquileres para el año actual
    SheetsCache.invalidar('alquileres_completos_' + new Date().getFullYear());

    return {
      success: true,
      movimiento: serializarParaWeb(resultado),
      config: serializarParaWeb(config),
      mensaje: (datos.tipo === CONFIG.TIPOS_ALQUILER.FACTURA_MENSUAL ? 'Factura mensual' : 'Pago semanal') + ' registrado'
    };
  } catch (error) {
    Logger.log('Error en guardarPagoAlquiler: ' + error.message);
    return { success: false, error: error.message };
  }
}

function actualizarConfigAlquiler(inquilino, datos) {
  try {
    var config = AlquileresRepository.actualizarConfigInquilino(inquilino, datos);
    return {
      success: true,
      config: serializarParaWeb(config),
      mensaje: 'Configuracion actualizada'
    };
  } catch (error) {
    Logger.log('Error en actualizarConfigAlquiler: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Alias para compatibilidad: registra una factura mensual.
 * El frontend llama a guardarFacturaMensual pero guardarPagoAlquiler
 * ya maneja FACTURA_MENSUAL cuando datos.tipo lo indica.
 */
function guardarFacturaMensual(datos) {
  if (!datos.tipo) datos.tipo = CONFIG.TIPOS_ALQUILER.FACTURA_MENSUAL;
  return guardarPagoAlquiler(datos);
}

/**
 * Devuelve en una sola llamada todos los datos necesarios para la vista
 * completa de alquileres: config + movimientos + calendario de cada inquilino.
 */
function obtenerDatosAlquileresCompletos(anio) {
  try {
    var anioConsulta = anio || new Date().getFullYear();
    var CACHE_KEY = 'alquileres_completos_' + anioConsulta;

    // Intentar desde SheetsCache primero (TTL 120s)
    var cached = SheetsCache.get(CACHE_KEY);
    if (cached) {
      Logger.log('[ALQUILERES] Cache hit para año ' + anioConsulta);
      return { success: true, anio: anioConsulta, inquilinos: cached };
    }

    var inquilinos = AlquileresRepository.obtenerTodosInquilinos();
    var resultado  = [];

    for (var i = 0; i < inquilinos.length; i++) {
      var inq = inquilinos[i];
      var calendario    = AlquileresRepository.obtenerEstadoCalendario(inq.inquilino, anioConsulta);
      var movimientos   = AlquileresRepository.obtenerMovimientos(inq.inquilino, anioConsulta);
      var semanasImpagas = AlquileresRepository.obtenerSemanasImpagas(inq.inquilino, anioConsulta);
      resultado.push({ config: inq, calendario: calendario, movimientos: movimientos, semanasImpagas: semanasImpagas });
    }

    var resultadoSerial = serializarParaWeb(resultado);
    SheetsCache.set(CACHE_KEY, resultadoSerial, 120); // cache 2 minutos

    return { success: true, anio: anioConsulta, inquilinos: resultadoSerial };

  } catch (error) {
    Logger.log('Error en obtenerDatosAlquileresCompletos: ' + error.message);
    return { success: false, error: error.message };
  }
}
