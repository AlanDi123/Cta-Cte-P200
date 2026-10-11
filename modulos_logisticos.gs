/**
 * Módulos logísticos: vales físicos y vacíos.
 */
const ValesFisicosRepository = {
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName('MOD_VALES');
    if (!hoja) {
      hoja = ss.insertSheet('MOD_VALES');
      hoja.appendRow(['ID', 'FECHA', 'NUMERO_VALE', 'TIPO_MOVIMIENTO', 'MONTO', 'ESTADO', 'MOTIVO_ANULACION', 'USUARIO']);
      hoja.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4A148C').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }
    return hoja;
  },

  generarId: function(hoja) {
    const datos = hoja.getDataRange().getValues();
    return datos.slice(1).reduce(function(maximo, fila) {
      return Math.max(maximo, Number(fila[0]) || 0);
    }, 0) + 1;
  },

  registrar: function(data) {
    let lock;
    let lockAdquirido = false;
    try {
      if (!data || typeof data !== 'object') throw new Error('Datos del vale inválidos.');
      const numero = String(data.numero || '').trim().toUpperCase();
      const tipo = String(data.tipo || '').trim().toUpperCase();
      const monto = Number(data.monto);
      if (!numero) throw new Error('El número de vale es obligatorio.');
      if (numero.length > 100) throw new Error('El número de vale es demasiado largo.');
      if (tipo !== 'ENTREGADO' && tipo !== 'RECIBIDO') throw new Error('Tipo de movimiento inválido.');
      if (!Number.isFinite(monto) || monto <= 0) throw new Error('El monto debe ser mayor a cero.');

      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      lockAdquirido = true;

      const hoja = this.getHoja();
      const nuevoId = this.generarId(hoja);
      const usuario = Session.getActiveUser().getEmail() || '';
      hoja.appendRow([nuevoId, new Date(), numero, tipo, monto, 'ACTIVO', '', usuario]);
      return { success: true, id: nuevoId };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  },

  obtenerUltimos: function(limite) {
    try {
      const cantidad = Math.min(100, Math.max(1, parseInt(limite, 10) || 10));
      const hoja = this.getHoja();
      const datos = hoja.getDataRange().getValues();
      let entregados = 0;
      let recibidos = 0;
      const vales = [];

      for (let i = 1; i < datos.length; i++) {
        const fila = datos[i];
        const tipo = String(fila[3] || '').toUpperCase();
        const estado = String(fila[5] || '').toUpperCase();
        const monto = Number(fila[4]) || 0;
        if (estado === 'ACTIVO') {
          if (tipo === 'ENTREGADO') entregados += monto;
          if (tipo === 'RECIBIDO') recibidos += monto;
        }
        vales.push({
          id: fila[0],
          fecha: fila[1] instanceof Date
            ? Utilities.formatDate(fila[1], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
            : String(fila[1] || ''),
          numero: fila[2],
          tipo: tipo,
          monto: monto,
          estado: estado,
          motivo: fila[6] || '',
          usuario: fila[7] || ''
        });
      }

      vales.reverse();
      return {
        success: true,
        vales: vales.slice(0, cantidad),
        balance: { entregados: entregados, recibidos: recibidos, neto: entregados - recibidos }
      };
    } catch (error) {
      return { success: false, error: error.message, vales: [], balance: { entregados: 0, recibidos: 0, neto: 0 } };
    }
  },

  anular: function(id, motivo) {
    let lock;
    let lockAdquirido = false;
    try {
      const valeId = Number(id);
      const motivoAnulacion = String(motivo || '').trim();
      if (!Number.isInteger(valeId) || valeId < 1) throw new Error('Identificador de vale inválido.');
      if (motivoAnulacion.length < 3) throw new Error('El motivo debe tener al menos 3 caracteres.');

      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      lockAdquirido = true;

      const hoja = this.getHoja();
      const datos = hoja.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        if (Number(datos[i][0]) !== valeId) continue;
        if (String(datos[i][5]).toUpperCase() !== 'ACTIVO') {
          return { success: false, error: 'El vale ya está anulado.' };
        }
        hoja.getRange(i + 1, 6).setValue('ANULADO');
        hoja.getRange(i + 1, 7).setValue(motivoAnulacion);
        return { success: true };
      }
      return { success: false, error: 'Vale no encontrado.' };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  }
};

function _obtenerCacheAccesoVales() {
  return CacheService.getScriptCache();
}

function _validarTokenVales(token) {
  const tokenLimpio = String(token || '').trim();
  return tokenLimpio.length > 0 && _obtenerCacheAccesoVales().get('VALES_ACCESS_' + tokenLimpio) === '1';
}

function validarPinModulosExtra(pin) {
  const pinGuardado = PropertiesService.getScriptProperties().getProperty('PIN_MODULOS_EXTRA');
  const pinCorrecto = /^\d{4}$/.test(pinGuardado || '') ? pinGuardado : CONFIG.MODULOS_EXTRA.PIN_ACCESO;
  const cache = _obtenerCacheAccesoVales();
  const usuario = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'anonimo';
  const claveIntentos = 'VALES_PIN_INTENTOS_' + usuario.slice(0, 150);
  const ahora = Date.now();
  let estadoIntentos = {};
  try {
    estadoIntentos = JSON.parse(cache.get(claveIntentos) || '{}');
  } catch (error) {
    estadoIntentos = {};
  }
  if (estadoIntentos.bloqueadoHasta > ahora) {
    const segundos = Math.ceil((estadoIntentos.bloqueadoHasta - ahora) / 1000);
    return { success: false, error: 'Demasiados intentos. Probá nuevamente en ' + segundos + ' segundos.' };
  }
  if (String(pin || '') !== pinCorrecto) {
    estadoIntentos.intentos = (Number(estadoIntentos.intentos) || 0) + 1;
    if (estadoIntentos.intentos >= 5) estadoIntentos.bloqueadoHasta = ahora + 300000;
    cache.put(claveIntentos, JSON.stringify(estadoIntentos), 300);
    return { success: false, error: estadoIntentos.intentos >= 5
      ? 'Demasiados intentos. Probá nuevamente en 300 segundos.'
      : 'PIN incorrecto.' };
  }

  cache.remove(claveIntentos);
  const token = Utilities.getUuid();
  cache.put('VALES_ACCESS_' + token, '1', 1800);
  return { success: true, token: token };
}

function valesFisicosRegistrar(data, token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.registrar(data);
}

function valesFisicosObtener(token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.obtenerUltimos(10);
}

function valesFisicosAnular(id, motivo, token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.anular(id, motivo);
}

const VaciosRepository = {
  _getHojas: function() {
    const ss = getSpreadsheet();
    let hSesion = ss.getSheetByName('MOD_VACIOS_SESION');
    let hDetalle = ss.getSheetByName('MOD_VACIOS_DETALLE');

    if (!hSesion) {
      hSesion = ss.insertSheet('MOD_VACIOS_SESION');
      hSesion.appendRow(['ID', 'FECHA', 'ESTADO', 'DIF_TOTAL_DINERO', 'USUARIO']);
      hSesion.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#2E7D32').setFontColor('#FFFFFF');
      hSesion.setFrozenRows(1);
    }
    if (!hDetalle) {
      hDetalle = ss.insertSheet('MOD_VACIOS_DETALLE');
      hDetalle.appendRow(['SESION_ID', 'ENVASE_ID', 'ENVASE_NOMBRE', 'VALOR_UNITARIO', 'STOCK_INICIAL', 'ENTRARON', 'SALIERON', 'STOCK_FINAL', 'DIF_CANTIDAD', 'DIF_DINERO']);
      hDetalle.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFFFFF');
      hDetalle.setFrozenRows(1);
    }
    return { hSesion: hSesion, hDetalle: hDetalle };
  },

  _obtenerEnvasesConfig: function() {
    const props = PropertiesService.getScriptProperties();
    let envases = CONFIG.MODULOS_EXTRA.ENVASES_DEFAULT;
    const guardados = props.getProperty('ENVASES_VACIOS');
    if (guardados) {
      try {
        const parseados = JSON.parse(guardados);
        if (Array.isArray(parseados)) envases = parseados;
      } catch (error) {
        Logger.log('ENVASES_VACIOS inválido; se usarán los valores por defecto.');
      }
    }

    const ids = {};
    return envases.filter(function(envase) {
      if (!envase || envase.id === undefined || !String(envase.nombre || '').trim()) return false;
      const id = String(envase.id).trim();
      const valor = Number(envase.valor);
      if (!id || ids[id] || !Number.isFinite(valor) || valor < 0) return false;
      ids[id] = true;
      return true;
    }).map(function(envase) {
      return { id: String(envase.id).trim(), nombre: String(envase.nombre).trim(), valor: Number(envase.valor) };
    });
  },

  obtenerEstadoActual: function() {
    try {
      const hojas = this._getHojas();
      const datosSesion = hojas.hSesion.getDataRange().getValues();
      const datosDetalle = hojas.hDetalle.getDataRange().getValues();
      let sesionActiva = null;
      let ultimaCerrada = null;

      for (let i = datosSesion.length - 1; i >= 1; i--) {
        if (datosSesion[i][2] === 'ABIERTO') {
          sesionActiva = { id: datosSesion[i][0], fecha: datosSesion[i][1], estado: 'ABIERTO', difTotal: Number(datosSesion[i][3]) || 0 };
          break;
        }
        if (datosSesion[i][2] === 'CERRADO' && !ultimaCerrada) ultimaCerrada = { id: datosSesion[i][0] };
      }

      if (sesionActiva) {
        const detalles = datosDetalle.slice(1)
          .filter(function(fila) { return Number(fila[0]) === Number(sesionActiva.id); })
          .map(function(fila) {
            return {
              envaseId: String(fila[1]), nombre: fila[2], valor: Number(fila[3]) || 0,
              inicial: Number(fila[4]) || 0, entraron: Number(fila[5]) || 0,
              salieron: Number(fila[6]) || 0, final: Number(fila[7]) || 0
            };
          });
        return { success: true, sesion: sesionActiva, detalles: detalles };
      }

      const detallesAyer = ultimaCerrada
        ? datosDetalle.slice(1).filter(function(fila) { return Number(fila[0]) === Number(ultimaCerrada.id); })
        : [];
      const proyeccion = this._obtenerEnvasesConfig().map(function(envase) {
        const ayer = detallesAyer.find(function(fila) { return String(fila[1]) === envase.id; });
        return {
          envaseId: envase.id, nombre: envase.nombre, valor: envase.valor,
          inicial: ayer ? Number(ayer[7]) || 0 : 0, entraron: 0, salieron: 0, final: 0
        };
      });
      return { success: true, sesion: null, detalles: proyeccion };
    } catch (error) {
      return { success: false, error: error.message, sesion: null, detalles: [] };
    }
  },

  abrirTurno: function() {
    let lock;
    let lockAdquirido = false;
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      lockAdquirido = true;

      const estadoActual = this.obtenerEstadoActual();
      if (!estadoActual.success) throw new Error(estadoActual.error || 'No se pudo consultar el estado de Vacíos.');
      if (estadoActual.sesion) return { success: false, error: 'Ya hay un turno abierto.' };
      if (estadoActual.detalles.length === 0) return { success: false, error: 'No hay envases configurados para abrir el turno.' };

      const hojas = this._getHojas();
      const datosSesion = hojas.hSesion.getDataRange().getValues();
      const nuevoId = datosSesion.slice(1).reduce(function(maximo, fila) {
        return Math.max(maximo, Number(fila[0]) || 0);
      }, 0) + 1;
      const usuario = Session.getActiveUser().getEmail() || '';
      hojas.hSesion.appendRow([nuevoId, new Date(), 'ABIERTO', 0, usuario]);

      estadoActual.detalles.forEach(function(detalle) {
        hojas.hDetalle.appendRow([
          nuevoId, detalle.envaseId, detalle.nombre, detalle.valor,
          detalle.inicial, 0, 0, 0, 0, 0
        ]);
      });
      return { success: true, id: nuevoId };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  },

  guardarProgreso: function(sesionId, detallesInput, esCierre) {
    let lock;
    let lockAdquirido = false;
    try {
      const id = Number(sesionId);
      if (!Number.isInteger(id) || id < 1) throw new Error('Identificador de turno inválido.');
      if (!Array.isArray(detallesInput)) throw new Error('Los detalles del turno deben ser una lista.');

      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      lockAdquirido = true;

      const hojas = this._getHojas();
      const datosSesion = hojas.hSesion.getDataRange().getValues();
      const filaSesion = datosSesion.findIndex(function(fila, indice) {
        return indice > 0 && Number(fila[0]) === id;
      });
      if (filaSesion < 0) throw new Error('Turno no encontrado.');
      if (datosSesion[filaSesion][2] !== 'ABIERTO') throw new Error('El turno ya está cerrado.');

      const entradas = new Map();
      detallesInput.forEach(function(detalle) {
        if (!detalle || detalle.envaseId === undefined) throw new Error('Detalle de envase inválido.');
        const envaseId = String(detalle.envaseId);
        if (entradas.has(envaseId)) throw new Error('Hay envases repetidos en el envío.');
        const entraron = Number(detalle.entraron);
        const salieron = Number(detalle.salieron);
        const finalFisico = detalle.final === '' || detalle.final === null || detalle.final === undefined
          ? NaN
          : Number(detalle.final);
        if (!Number.isSafeInteger(entraron) || entraron < 0 || !Number.isSafeInteger(salieron) || salieron < 0) {
          throw new Error('Entradas y salidas deben ser números enteros no negativos.');
        }
        if (esCierre && (!Number.isSafeInteger(finalFisico) || finalFisico < 0)) {
          throw new Error('El stock físico final debe ser un número entero no negativo para cada envase.');
        }
        entradas.set(envaseId, { entraron: entraron, salieron: salieron, final: finalFisico });
      });

      const datosDetalle = hojas.hDetalle.getDataRange().getValues();
      const filasActualizar = [];
      let totalDiferenciaDinero = 0;
      for (let i = 1; i < datosDetalle.length; i++) {
        if (Number(datosDetalle[i][0]) !== id) continue;
        const envaseId = String(datosDetalle[i][1]);
        const entrada = entradas.get(envaseId);
        if (!entrada) throw new Error('Falta información para el envase ' + String(datosDetalle[i][2]) + '.');
        entradas.delete(envaseId);

        const inicial = Number(datosDetalle[i][4]) || 0;
        const valor = Number(datosDetalle[i][3]) || 0;
        const teorico = inicial + entrada.entraron - entrada.salieron;
        if (teorico < 0) throw new Error('Las salidas superan el stock disponible de ' + String(datosDetalle[i][2]) + '.');
        const difCantidad = esCierre ? entrada.final - teorico : 0;
        const difDinero = difCantidad * valor;
        totalDiferenciaDinero += difDinero;
        filasActualizar.push({
          fila: i + 1,
          valores: esCierre
            ? [entrada.entraron, entrada.salieron, entrada.final, difCantidad, difDinero]
            : [entrada.entraron, entrada.salieron]
        });
      }
      if (filasActualizar.length === 0) throw new Error('El turno no tiene envases asociados.');
      if (entradas.size > 0) throw new Error('El envío contiene envases que no pertenecen a este turno.');

      filasActualizar.forEach(function(actualizacion) {
        hojas.hDetalle.getRange(actualizacion.fila, 6, 1, actualizacion.valores.length).setValues([actualizacion.valores]);
      });
      if (esCierre) {
        hojas.hSesion.getRange(filaSesion + 1, 3, 1, 2).setValues([['CERRADO', totalDiferenciaDinero]]);
      }
      return { success: true, difTotal: totalDiferenciaDinero };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  }
};

function vaciosDiariosEstado(token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  const resultado = VaciosRepository.obtenerEstadoActual();
  if (resultado.success && resultado.sesion && resultado.sesion.fecha instanceof Date) {
    resultado.sesion.fecha = Utilities.formatDate(resultado.sesion.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return resultado;
}

function vaciosDiariosAbrir(token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return VaciosRepository.abrirTurno();
}

function vaciosDiariosGuardar(sesionId, detalles, esCierre, token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return VaciosRepository.guardarProgreso(sesionId, detalles, esCierre);
}