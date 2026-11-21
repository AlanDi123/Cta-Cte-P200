/**
 * Módulos logísticos: vales físicos y vacíos.
 */
const ValesFisicosRepository = {
  getHoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName('MOD_VALES');
    if (!hoja) {
      hoja = ss.insertSheet('MOD_VALES');
      hoja.appendRow(['ID', 'FECHA', 'NUMERO_VALE', 'TIPO_MOVIMIENTO', 'MONTO', 'ESTADO', 'MOTIVO_ANULACION', 'USUARIO', 'DETALLE_JSON']);
      hoja.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#4A148C').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    } else if (hoja.getLastColumn() < 9 || !hoja.getRange(1, 9).getValue()) {
      hoja.getRange(1, 9).setValue('DETALLE_JSON')
        .setFontWeight('bold').setBackground('#4A148C').setFontColor('#FFFFFF');
    }
    return hoja;
  },

  _normalizarDetalle: function(data) {
    let detalle = data.detalle;
    if (!Array.isArray(detalle)) {
      try {
        detalle = data.detalleJSON ? JSON.parse(data.detalleJSON) : [];
      } catch (error) {
        throw new Error('El detalle de envases no tiene un formato válido.');
      }
    }
    if (!Array.isArray(detalle) || detalle.length > 50) throw new Error('El detalle debe ser una lista de hasta 50 envases.');

    const ids = new Set();
    const normalizado = detalle.map(function(item) {
      const envaseId = String(item && item.envaseId || '').trim();
      const nombre = String(item && item.nombre || '').trim();
      const valor = Number(item && item.valor);
      const cantidad = Number(item && item.cantidad);
      if (!/^[A-Za-z0-9_-]{1,50}$/.test(envaseId) || ids.has(envaseId)) throw new Error('El detalle contiene un ID de envase inválido o repetido.');
      if (!nombre || nombre.length > 100) throw new Error('Cada envase debe tener un nombre de hasta 100 caracteres.');
      if (!Number.isFinite(valor) || valor < 0) throw new Error('El valor del envase debe ser mayor o igual a cero.');
      if (!Number.isSafeInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad de cada envase debe ser un entero mayor a cero.');
      ids.add(envaseId);
      return { envaseId: envaseId, nombre: nombre, valor: valor, cantidad: cantidad };
    });
    const serializado = JSON.stringify(normalizado);
    if (serializado.length > 7000) throw new Error('El detalle de envases excede el tamaño permitido.');
    return { detalle: normalizado, serializado: serializado };
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
      const detalle = this._normalizarDetalle(data);
      const totalDetalle = detalle.detalle.reduce(function(total, item) {
        return total + item.valor * item.cantidad;
      }, 0);
      if (detalle.detalle.length && Math.abs(totalDetalle - monto) > 0.01) {
        throw new Error('El monto no coincide con el detalle de envases.');
      }

      lock = LockService.getScriptLock();
      lock.waitLock(10000);
      lockAdquirido = true;

      const hoja = this.getHoja();
      const nuevoId = this.generarId(hoja);
      const usuario = Session.getActiveUser().getEmail() || '';
      hoja.appendRow([nuevoId, new Date(), numero, tipo, monto, 'ACTIVO', '', usuario, detalle.serializado]);
      return { success: true, id: nuevoId };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (lockAdquirido) lock.releaseLock();
    }
  },

  obtenerTodos: function(filtros) {
    try {
      filtros = filtros || {};
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
        const fechaObj = fila[1];
        if (estado === 'ACTIVO') {
          if (tipo === 'ENTREGADO') entregados += monto;
          if (tipo === 'RECIBIDO') recibidos += monto;
        }
        vales.push({
          id: fila[0],
          fechaRaw: fechaObj instanceof Date
            ? Utilities.formatDate(fechaObj, Session.getScriptTimeZone(), 'yyyy-MM-dd')
            : '',
          fecha: fechaObj instanceof Date
            ? Utilities.formatDate(fechaObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
            : String(fechaObj || ''),
          numero: fila[2],
          tipo: tipo,
          monto: monto,
          estado: estado,
          motivo: fila[6] || '',
          usuario: fila[7] || '',
          detalle: this._parsearDetalle(fila[8])
        });
      }

      vales.reverse();
      const numeroFiltro = String(filtros.numero || '').trim().toUpperCase();
      const fechaFiltro = String(filtros.fecha || '').trim();
      const valesFiltrados = vales.filter(function(vale) {
        if (numeroFiltro && String(vale.numero || '').toUpperCase().indexOf(numeroFiltro) === -1) return false;
        if (fechaFiltro && vale.fechaRaw !== fechaFiltro) return false;
        return true;
      });
      return {
        success: true,
        vales: valesFiltrados,
        balance: { entregados: entregados, recibidos: recibidos, neto: entregados - recibidos }
      };
    } catch (error) {
      return { success: false, error: error.message, vales: [], balance: { entregados: 0, recibidos: 0, neto: 0 } };
    }
  },

  _parsearDetalle: function(raw) {
    if (!raw) return [];
    try {
      const detalle = JSON.parse(raw);
      return Array.isArray(detalle) ? detalle : [];
    } catch (error) {
      return [];
    }
  },

  buscarPorNumero: function(numero) {
    const numeroNormalizado = String(numero || '').trim().toUpperCase();
    if (!numeroNormalizado) return { success: false, error: 'Ingresá un número de vale.' };
    const resultado = this.obtenerTodos();
    if (!resultado.success) return resultado;
    const vale = resultado.vales.find(function(item) {
      return String(item.numero || '').toUpperCase() === numeroNormalizado &&
        item.tipo === 'ENTREGADO' && item.estado === 'ACTIVO';
    });
    return { success: true, vale: vale || null };
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

// ============================================================================
// PINES
//
// Dos PINes de 4 dígitos, guardados SOLO en propiedades del script (nunca en el
// código ni en el HTML, que es público en GitHub):
//   PIN_MODULOS_EXTRA → Vacíos y Vales. Es además la "llave maestra": sin él no
//                        se puede cambiar ningún PIN.
//   PIN_FACTURACION   → módulos de Facturación. Antes era '1234' escrito en el
//                        HTML y comparado en el navegador: no se podía cambiar.
// ============================================================================

/** PIN de facturación mientras nadie lo haya cambiado: el mismo que regía antes. */
var PIN_FACTURACION_INICIAL = '1234';

function _usuarioActualPin() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'anonimo';
  } catch (e) {
    return 'anonimo';
  }
}

/**
 * Límite de intentos por usuario y por tipo de PIN: 5 fallos → 5 minutos de espera.
 * @returns {{bloqueado: function(): (number|0), fallo: function(): boolean, exito: function()}}
 */
function _limitadorPin(tipo) {
  const cache = _obtenerCacheAccesoVales();
  const clave = tipo + '_PIN_INTENTOS_' + _usuarioActualPin().slice(0, 150);
  let estado = {};
  try { estado = JSON.parse(cache.get(clave) || '{}'); } catch (e) { estado = {}; }
  return {
    /** Segundos de espera si está bloqueado; 0 si no. */
    bloqueado: function() {
      const ahora = Date.now();
      return estado.bloqueadoHasta > ahora ? Math.ceil((estado.bloqueadoHasta - ahora) / 1000) : 0;
    },
    /** Registra un fallo; devuelve true si con este quedó bloqueado. */
    fallo: function() {
      estado.intentos = (Number(estado.intentos) || 0) + 1;
      if (estado.intentos >= 5) estado.bloqueadoHasta = Date.now() + 300000;
      cache.put(clave, JSON.stringify(estado), 300);
      return estado.intentos >= 5;
    },
    exito: function() { cache.remove(clave); }
  };
}

function _pinLogistica() {
  const p = PropertiesService.getScriptProperties().getProperty('PIN_MODULOS_EXTRA');
  return /^\d{4}$/.test(p || '') ? p : '';
}

function _pinFacturacion() {
  const p = PropertiesService.getScriptProperties().getProperty('PIN_FACTURACION');
  return /^\d{4}$/.test(p || '') ? p : PIN_FACTURACION_INICIAL;
}

/**
 * Valida el PIN de Vacíos y Vales y entrega un token de 30 minutos.
 *
 * Para que entrar sea rápido, en la MISMA llamada devuelve los datos del módulo
 * que se está abriendo (antes eran dos viajes al servidor, uno detrás del otro).
 *
 * @param {string} pin
 * @param {string} [modulo] - 'vacios' | 'vales'
 */
function validarPinModulosExtra(pin, modulo) {
  const pinCorrecto = _pinLogistica();
  // Sin PIN configurado NO hay valor por defecto: el repositorio es público.
  if (!pinCorrecto) {
    return {
      success: false,
      requiereConfiguracion: true,
      error: 'Todavía no hay PIN configurado para estos módulos. ' +
             'Definilo en Configuración → Seguridad.'
    };
  }
  const limite = _limitadorPin('VALES');
  const espera = limite.bloqueado();
  if (espera) return { success: false, error: 'Demasiados intentos. Probá nuevamente en ' + espera + ' segundos.' };
  if (String(pin || '') !== pinCorrecto) {
    return { success: false, error: limite.fallo()
      ? 'Demasiados intentos. Probá nuevamente en 300 segundos.'
      : 'PIN incorrecto.' };
  }
  limite.exito();
  const token = Utilities.getUuid();
  _obtenerCacheAccesoVales().put('VALES_ACCESS_' + token, '1', 1800);

  const respuesta = { success: true, token: token };
  // Los datos van "de regalo": si fallan, la entrada igual se concede y la
  // pantalla los pide como siempre.
  try {
    if (modulo === 'vacios') respuesta.datos = VaciosMovRepository.obtener();
    else if (modulo === 'vales') respuesta.datos = ValesFisicosRepository.obtenerTodos({});
    if (respuesta.datos) respuesta.datos = JSON.parse(JSON.stringify(respuesta.datos));
  } catch (e) {
    Logger.log('validarPinModulosExtra: datos de ' + modulo + ' no disponibles: ' + e.message);
    delete respuesta.datos;
  }
  return respuesta;
}

/**
 * Valida el PIN de los módulos de Facturación (en el servidor, ya no en el HTML).
 * @param {string} pin
 */
function validarPinFacturacion(pin) {
  const limite = _limitadorPin('FACT');
  const espera = limite.bloqueado();
  if (espera) return { success: false, error: 'Demasiados intentos. Probá nuevamente en ' + espera + ' segundos.' };
  if (String(pin || '') !== _pinFacturacion()) {
    return { success: false, error: limite.fallo()
      ? 'Demasiados intentos. Probá nuevamente en 300 segundos.'
      : 'PIN incorrecto.' };
  }
  limite.exito();
  return { success: true };
}

/**
 * Cambia el PIN de Facturación y/o el de Vacíos y Vales.
 *
 * Exige el PIN ACTUAL de Vacíos y Vales. Ante un PIN actual equivocado responde
 * siempre lo mismo ("No autorizado."), sin decir qué estuvo mal: no da pistas.
 * Única excepción: si el PIN de Vacíos y Vales nunca se configuró, se permite
 * fijarlo esa vez sin el actual (si no, nadie podría empezar).
 *
 * @param {{actual: string, nuevoFacturacion?: string, nuevoLogistica?: string}} datos
 */
function cambiarPines(datos) {
  const d = datos || {};
  const nuevoFact = String(d.nuevoFacturacion || '').trim();
  const nuevoLog = String(d.nuevoLogistica || '').trim();
  if (!nuevoFact && !nuevoLog) return { success: false, error: 'Indicá al menos un PIN nuevo.' };
  if ((nuevoFact && !/^\d{4}$/.test(nuevoFact)) || (nuevoLog && !/^\d{4}$/.test(nuevoLog))) {
    return { success: false, error: 'Cada PIN nuevo debe tener exactamente 4 números.' };
  }

  const pinLog = _pinLogistica();
  if (pinLog) {
    const limite = _limitadorPin('CAMBIO');
    if (limite.bloqueado()) return { success: false, error: 'No autorizado.' };
    if (String(d.actual || '') !== pinLog) {
      limite.fallo();
      return { success: false, error: 'No autorizado.' };
    }
    limite.exito();
  } else if (!nuevoLog) {
    // Primera vez: hay que empezar por el PIN maestro
    return { success: false, error: 'No autorizado.' };
  }

  const props = PropertiesService.getScriptProperties();
  const cambiados = [];
  if (nuevoLog) { props.setProperty('PIN_MODULOS_EXTRA', nuevoLog); cambiados.push('vacios-vales'); }
  if (nuevoFact) { props.setProperty('PIN_FACTURACION', nuevoFact); cambiados.push('facturacion'); }
  // Los accesos ya abiertos no se cortan: sus tokens vencen solos en 30 minutos.
  return { success: true, cambiados: cambiados };
}

function valesFisicosRegistrar(data, token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.registrar(data);
}

function valesFisicosObtener(token, filtros) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.obtenerTodos(filtros || {});
}

function valesFisicosBuscarNumero(numero, token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return ValesFisicosRepository.buscarPorNumero(numero);
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
  },

  obtenerHistorial: function() {
    try {
      const hojas = this._getHojas();
      const datosSesion = hojas.hSesion.getDataRange().getValues();
      const datosDetalle = hojas.hDetalle.getDataRange().getValues();
      const historial = [];

      for (let i = 1; i < datosSesion.length; i++) {
        if (String(datosSesion[i][2]).toUpperCase() !== 'CERRADO') continue;
        const sesionId = datosSesion[i][0];
        const fecha = datosSesion[i][1] instanceof Date
          ? Utilities.formatDate(datosSesion[i][1], Session.getScriptTimeZone(), 'dd/MM/yyyy')
          : String(datosSesion[i][1] || '');
        const detalles = datosDetalle.slice(1)
          .filter(function(fila) { return Number(fila[0]) === Number(sesionId); })
          .map(function(fila) {
            return {
              nombre: String(fila[2] || ''),
              valor: Number(fila[3]) || 0,
              difCantidad: Number(fila[8]) || 0,
              difDinero: Number(fila[9]) || 0
            };
          });
        historial.push({
          id: sesionId,
          fecha: fecha,
          difTotalDinero: Number(datosSesion[i][3]) || 0,
          usuario: String(datosSesion[i][4] || ''),
          detalles: detalles
        });
      }
      historial.reverse();
      return { success: true, historial: historial };
    } catch (error) {
      return { success: false, error: error.message, historial: [] };
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

function vaciosDiariosHistorial(token) {
  if (!_validarTokenVales(token)) return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
  return VaciosRepository.obtenerHistorial();
}
// ============================================================================
// CONTROL DE VACÍOS — MOVIMIENTOS
//
// Reemplaza a los turnos (abrir / guardar / cerrar). Cada fila es un movimiento:
// fecha, proveedor, tipo de vacío, INGRESO o EGRESO, cantidad y observación.
// Los saldos se calculan siempre desde las filas, no se guardan: no pueden
// desincronizarse.
//
// Tipos = la lista de envases de Configuración (ENVASES_VACIOS), la misma que
// usa Vales para calcular montos.
//
// Las hojas de turnos viejas (MOD_VACIOS_SESION / _DETALLE) no se tocan: se
// siguen pudiendo consultar con vaciosDiariosHistorial.
// ============================================================================

const VaciosMovRepository = {
  HOJA: 'MOD_VACIOS_MOV',
  ENCABEZADOS: ['ID', 'FECHA', 'PROVEEDOR', 'TIPO_ID', 'TIPO', 'MOVIMIENTO', 'CANTIDAD', 'OBS', 'CREADO', 'USUARIO'],

  _hoja: function() {
    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(this.HOJA);
    if (!hoja) {
      hoja = ss.insertSheet(this.HOJA);
      hoja.appendRow(this.ENCABEZADOS);
      hoja.getRange(1, 1, 1, this.ENCABEZADOS.length).setFontWeight('bold').setBackground('#2E7D32').setFontColor('#FFFFFF');
      hoja.setFrozenRows(1);
    }
    return hoja;
  },

  _tipos: function() {
    return VaciosRepository._obtenerEnvasesConfig().map(function(e) { return { id: e.id, nombre: e.nombre }; });
  },

  _fechaTexto: function(v) {
    if (v instanceof Date) return formatearFechaLocal(v);
    return String(v || '').slice(0, 10);
  },

  /** Filas de la hoja como objetos, con su número de fila. */
  _leer: function() {
    const hoja = this._hoja();
    const ultima = hoja.getLastRow();
    if (ultima < 2) return [];
    const self = this;
    return hoja.getRange(2, 1, ultima - 1, this.ENCABEZADOS.length).getValues().map(function(f, i) {
      return {
        fila: i + 2,
        id: Number(f[0]) || 0,
        fecha: self._fechaTexto(f[1]),
        proveedor: String(f[2] || ''),
        tipoId: String(f[3] || ''),
        tipo: String(f[4] || ''),
        movimiento: String(f[5] || '').toUpperCase() === 'EGRESO' ? 'EGRESO' : 'INGRESO',
        cantidad: Number(f[6]) || 0,
        obs: String(f[7] || '')
      };
    }).filter(function(m) { return m.id > 0; });
  },

  /** Valida y normaliza lo que llega de la pantalla. Lanza Error con un mensaje claro. */
  _validar: function(data) {
    const d = data || {};
    const fecha = String(d.fecha || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(parsearFechaLocal(fecha).getTime())) {
      throw new Error('La fecha no es válida.');
    }
    const proveedor = String(d.proveedor || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!proveedor) throw new Error('Falta el proveedor.');
    if (proveedor.length > 100) throw new Error('El proveedor admite hasta 100 caracteres.');
    const tipo = this._tipos().filter(function(t) { return t.id === String(d.tipoId || ''); })[0];
    if (!tipo) throw new Error('Elegí un tipo de vacío de la lista.');
    const movimiento = String(d.movimiento || '').toUpperCase();
    if (movimiento !== 'INGRESO' && movimiento !== 'EGRESO') throw new Error('Indicá si es ingreso o egreso.');
    const cantidad = Number(d.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 100000) {
      throw new Error('La cantidad debe ser un número entero mayor que cero.');
    }
    const obs = String(d.obs || '').trim().slice(0, 300);
    return { fecha: fecha, proveedor: proveedor, tipoId: tipo.id, tipo: tipo.nombre, movimiento: movimiento, cantidad: cantidad, obs: obs };
  },

  /**
   * Todo lo que muestra la pantalla, calculado desde las filas.
   * @returns {{success: boolean, movimientos: Array, stockPorTipo: Array, saldosPorProveedor: Array, proveedores: Array, tipos: Array}}
   */
  obtener: function() {
    const tipos = this._tipos();
    const filas = this._leer().sort(function(a, b) {
      return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id;
    });

    const saldo = {};          // proveedorNormalizado|tipoId → saldo corrido
    const stock = {};          // tipoId → stock
    const nombreTipo = {};
    tipos.forEach(function(t) { stock[t.id] = 0; nombreTipo[t.id] = t.nombre; });
    const provs = {};          // proveedorNormalizado → { proveedor, porTipo }

    filas.forEach(function(m) {
      const signo = m.movimiento === 'EGRESO' ? -1 : 1;
      const clave = normalizarString(m.proveedor);
      const k = clave + '|' + m.tipoId;
      saldo[k] = (saldo[k] || 0) + signo * m.cantidad;
      m.saldo = saldo[k];
      stock[m.tipoId] = (stock[m.tipoId] || 0) + signo * m.cantidad;
      if (!nombreTipo[m.tipoId]) nombreTipo[m.tipoId] = m.tipo;   // tipo que ya no está en Config
      provs[clave] = provs[clave] || { proveedor: m.proveedor, porTipo: {} };
      provs[clave].proveedor = m.proveedor;                       // el nombre más reciente
      provs[clave].porTipo[m.tipoId] = saldo[k];
    });

    const saldosPorProveedor = Object.keys(provs).map(function(c) {
      const p = provs[c];
      let total = 0;
      Object.keys(p.porTipo).forEach(function(t) { total += p.porTipo[t]; });
      return { proveedor: p.proveedor, porTipo: p.porTipo, total: total };
    }).sort(function(a, b) { return a.proveedor.localeCompare(b.proveedor); });

    return {
      success: true,
      tipos: tipos,
      stockPorTipo: Object.keys(stock).map(function(id) { return { tipoId: id, tipo: nombreTipo[id], stock: stock[id] }; }),
      saldosPorProveedor: saldosPorProveedor,
      proveedores: saldosPorProveedor.map(function(p) { return p.proveedor; }),
      // Más reciente primero, sin el número de fila interno
      movimientos: filas.slice().reverse().map(function(m) {
        return { id: m.id, fecha: m.fecha, proveedor: m.proveedor, tipoId: m.tipoId, tipo: m.tipo,
                 movimiento: m.movimiento, cantidad: m.cantidad, saldo: m.saldo, obs: m.obs };
      })
    };
  },

  _conLock: function(fn) {
    const lock = LockService.getScriptLock();
    let tengo = false;
    try {
      tengo = lock.tryLock(10000);
      if (!tengo) return { success: false, error: 'El sistema está ocupado. Probá de nuevo en unos segundos.' };
      fn();
      SpreadsheetApp.flush();
      return { success: true, datos: this.obtener() };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (tengo) lock.releaseLock();
    }
  },

  registrar: function(data) {
    const self = this;
    return this._conLock(function() {
      const m = self._validar(data);
      const hoja = self._hoja();
      const ids = self._leer().map(function(x) { return x.id; });
      const id = (ids.length ? Math.max.apply(null, ids) : 0) + 1;
      hoja.appendRow([id, parsearFechaLocal(m.fecha), m.proveedor, m.tipoId, m.tipo, m.movimiento, m.cantidad, m.obs,
                      new Date(), _usuarioActualPin()]);
    });
  },

  editar: function(id, data) {
    const self = this;
    return this._conLock(function() {
      const m = self._validar(data);
      const fila = self._leer().filter(function(x) { return x.id === Number(id); })[0];
      if (!fila) throw new Error('Ese movimiento ya no existe.');
      self._hoja().getRange(fila.fila, 2, 1, 7).setValues([[parsearFechaLocal(m.fecha), m.proveedor, m.tipoId, m.tipo,
                                                              m.movimiento, m.cantidad, m.obs]]);
    });
  },

  eliminar: function(id) {
    const self = this;
    return this._conLock(function() {
      const fila = self._leer().filter(function(x) { return x.id === Number(id); })[0];
      if (!fila) throw new Error('Ese movimiento ya no existe.');
      self._hoja().deleteRow(fila.fila);
    });
  }
};

function _sinAccesoVacios() {
  return { success: false, error: 'Acceso vencido. Ingresá nuevamente el PIN.' };
}

function vaciosMovObtener(token) {
  if (!_validarTokenVales(token)) return _sinAccesoVacios();
  try { return VaciosMovRepository.obtener(); } catch (e) { return { success: false, error: e.message }; }
}

function vaciosMovRegistrar(data, token) {
  if (!_validarTokenVales(token)) return _sinAccesoVacios();
  return VaciosMovRepository.registrar(data);
}

function vaciosMovEditar(id, data, token) {
  if (!_validarTokenVales(token)) return _sinAccesoVacios();
  return VaciosMovRepository.editar(id, data);
}

function vaciosMovEliminar(id, token) {
  if (!_validarTokenVales(token)) return _sinAccesoVacios();
  return VaciosMovRepository.eliminar(id);
}
