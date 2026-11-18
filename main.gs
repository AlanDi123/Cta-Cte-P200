/**
 * ============================================================================
 * MAIN - SISTEMA SOL & VERDE
 * ============================================================================
 * Punto de entrada y APIs publicas expuestas al frontend
 * Version: 2.0.0
 * ============================================================================
 */

// Variable global para el spreadsheet
let _spreadsheet = null;

/**
 * Obtiene el spreadsheet activo o por ID
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  if (_spreadsheet) return _spreadsheet;

  const propiedades = PropertiesService.getScriptProperties();

  // Intentar obtener por ID guardado
  const spreadsheetId = propiedades.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    try {
      _spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      return _spreadsheet;
    } catch (e) {
      Logger.log('No se pudo abrir por ID, intentando activo...');
    }
  }

  // Intentar obtener el activo
  try {
    _spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (_spreadsheet) {
      // Guardar ID para futuro
      propiedades.setProperty('SPREADSHEET_ID', _spreadsheet.getId());
      return _spreadsheet;
    }
  } catch (e) {
    Logger.log('Error obteniendo spreadsheet activo: ' + e.message);
  }

  throw new Error('No se pudo acceder al spreadsheet. Ejecuta inicializarSistema() desde el editor.');
}

/**
 * Punto de entrada para Web App y API REST
 * @param {Object} e - Evento con parámetros de la petición
 * @returns {HtmlOutput|TextOutput}
 */
function doGet(e) {
  // Si tiene parámetro 'action', es una petición API REST
  if (e && e.parameter && e.parameter.action) {
    return manejarApiGet(e);
  }

  // Si no, devolver la Web App
  // XFrame: Script property XFRAME_DENY=1 → DENY (más seguro si no embebés en iframes)
  var html = _crearSalidaHtmlInterfaz()
    .setTitle('Sol & Verde - Sistema de Cuenta Corriente')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  var denyFrame = PropertiesService.getScriptProperties().getProperty('XFRAME_DENY') === '1';
  html.setXFrameOptionsMode(
    denyFrame ? HtmlService.XFrameOptionsMode.DENY : HtmlService.XFrameOptionsMode.ALLOWALL
  );
  return html;
}

// ============================================================================
// INTERFAZ EN CALIENTE DESDE GITHUB
//
// Con HTML_REMOTO = '1', doGet sirve SistemaSolVerde.html descargado de la
// rama main en GitHub en lugar del archivo del proyecto. Asi la interfaz —que
// son 13.700 lineas, la mayor parte del sistema y todo lo que el usuario ve—
// se actualiza con cada push, sin desplegar nada.
//
// Es viable porque el archivo NO usa plantillas de Apps Script: se servia con
// createHtmlOutputFromFile, no con createTemplateFromFile, asi que es HTML
// estatico sin ningun <?= ?> que haya que evaluar del lado del servidor.
//
// Tres resguardos, en este orden:
//   1. Si la descarga falla o devuelve algo que no parece la interfaz, se
//      sirve la COPIA EN CACHE.
//   2. Si tampoco hay copia, se sirve el ARCHIVO LOCAL del proyecto.
//   3. Cualquier excepcion cae igualmente al archivo local.
// El sistema no puede quedar caido por una falla de red o un push a medias.
//
// Nota honesta sobre "tiempo real": raw.githubusercontent.com se sirve detras
// de una CDN con unos 5 minutos de cache propia, asi que el cambio aparece
// dentro de ese margen, no en el instante exacto del push.
// ============================================================================

/** Repositorio y archivo de los que se toma la interfaz. */
var HTML_REMOTO = {
  REPO:    'AlanDi123/Cta-Cte-P200',
  RAMA:    'main',
  ARCHIVO: 'SistemaSolVerde.html',
  // Marca que debe aparecer en el contenido para considerarlo valido. Evita
  // servir una pagina de error de GitHub o una descarga cortada a medias.
  MARCA:   'id="module-visor-cliente"',
  TAMANIO_MINIMO: 50000,
  CHUNK:   90000,   // CacheService admite ~100 KB por valor
  TTL:     21600    // 6 horas, el maximo que permite CacheService
};

/**
 * Devuelve el HtmlOutput de la interfaz, remoto si está activado.
 * @returns {HtmlOutput}
 */
function _crearSalidaHtmlInterfaz() {
  try {
    if (PropertiesService.getScriptProperties().getProperty('HTML_REMOTO') !== '1') {
      return HtmlService.createHtmlOutputFromFile('SistemaSolVerde');
    }
    var contenido = _obtenerHtmlRemoto();
    if (contenido) {
      return HtmlService.createHtmlOutput(contenido);
    }
  } catch (error) {
    Logger.log('[HTML_REMOTO] Falló, se sirve el archivo local: ' + error.message);
  }
  return HtmlService.createHtmlOutputFromFile('SistemaSolVerde');
}

/**
 * Descarga la interfaz desde GitHub, usando ETag para no retransmitir lo que
 * no cambió.
 *
 * Se usa ETag contra raw.githubusercontent.com en lugar de consultar la API de
 * GitHub por el último commit: la API sin credenciales tiene un límite de 60
 * peticiones por hora y por IP, y los servidores de Apps Script comparten IP,
 * así que ese límite se agotaría solo. Una petición condicional no tiene ese
 * problema y, cuando no hubo cambios, responde 304 sin cuerpo.
 *
 * @returns {string|null} HTML, o null si no se pudo obtener nada servible
 */
function _obtenerHtmlRemoto() {
  var cache = CacheService.getScriptCache();
  var etagGuardado = cache.get('html_etag');

  var url = 'https://raw.githubusercontent.com/' + HTML_REMOTO.REPO + '/' +
            HTML_REMOTO.RAMA + '/' + HTML_REMOTO.ARCHIVO;

  var opciones = { muteHttpExceptions: true, followRedirects: true };
  if (etagGuardado) {
    opciones.headers = { 'If-None-Match': etagGuardado };
  }

  var respuesta;
  try {
    respuesta = UrlFetchApp.fetch(url, opciones);
  } catch (e) {
    Logger.log('[HTML_REMOTO] No se pudo contactar GitHub: ' + e.message);
    return _leerHtmlDeCache(cache);
  }

  var codigo = respuesta.getResponseCode();

  // 304: no cambió nada desde la última vez. Es el camino habitual y el rápido.
  if (codigo === 304) {
    var deCache = _leerHtmlDeCache(cache);
    if (deCache) return deCache;
    // La caché expiró pero el ETag seguía vivo: se pide de nuevo sin condición
    Logger.log('[HTML_REMOTO] 304 sin copia en caché; se vuelve a pedir completo.');
    cache.remove('html_etag');
    return _obtenerHtmlRemoto();
  }

  if (codigo !== 200) {
    Logger.log('[HTML_REMOTO] GitHub respondió ' + codigo);
    return _leerHtmlDeCache(cache);
  }

  var contenido = respuesta.getContentText('UTF-8');

  // Validación: que de verdad sea la interfaz y no una página de error ni una
  // descarga cortada. Sin esto, un push a medias dejaría el sistema en blanco.
  if (!contenido || contenido.length < HTML_REMOTO.TAMANIO_MINIMO ||
      contenido.indexOf(HTML_REMOTO.MARCA) === -1) {
    Logger.log('[HTML_REMOTO] Contenido descartado por no parecer la interfaz (' +
               (contenido ? contenido.length : 0) + ' bytes)');
    return _leerHtmlDeCache(cache);
  }

  _guardarHtmlEnCache(cache, contenido, respuesta.getHeaders()['ETag'] ||
                                        respuesta.getHeaders()['etag'] || '');
  return contenido;
}

/** Reconstruye la interfaz guardada en caché. null si falta algún trozo. */
function _leerHtmlDeCache(cache) {
  var metaStr = cache.get('html_meta');
  if (!metaStr) return null;
  try {
    var meta = JSON.parse(metaStr);
    var partes = [];
    for (var i = 0; i < meta.chunks; i++) {
      var trozo = cache.get('html_c' + i);
      if (trozo === null) return null; // copia incompleta: no sirve
      partes.push(trozo);
    }
    var contenido = partes.join('');
    return contenido.length >= HTML_REMOTO.TAMANIO_MINIMO ? contenido : null;
  } catch (e) {
    return null;
  }
}

/** Guarda la interfaz troceada, porque CacheService admite ~100 KB por valor. */
function _guardarHtmlEnCache(cache, contenido, etag) {
  try {
    var trozos = {};
    var n = 0;
    for (var i = 0; i < contenido.length; i += HTML_REMOTO.CHUNK) {
      trozos['html_c' + n] = contenido.substring(i, i + HTML_REMOTO.CHUNK);
      n++;
    }
    trozos['html_meta'] = JSON.stringify({ chunks: n, bytes: contenido.length, cuando: new Date().toISOString() });
    if (etag) trozos['html_etag'] = etag;
    cache.putAll(trozos, HTML_REMOTO.TTL);
    Logger.log('[HTML_REMOTO] Interfaz actualizada desde GitHub: ' + contenido.length +
               ' bytes en ' + n + ' trozos.');
  } catch (e) {
    Logger.log('[HTML_REMOTO] No se pudo guardar en caché: ' + e.message);
  }
}

/**
 * Estado de la actualización en caliente, para mostrarlo en Configuración.
 * @returns {Object} Estado y detalle
 */
function obtenerEstadoHtmlRemoto() {
  try {
    var activo = PropertiesService.getScriptProperties().getProperty('HTML_REMOTO') === '1';
    var cache = CacheService.getScriptCache();
    var metaStr = cache.get('html_meta');
    var meta = null;
    if (metaStr) {
      try { meta = JSON.parse(metaStr); } catch (e) { meta = null; }
    }
    return {
      success: true,
      activo: activo,
      repo: HTML_REMOTO.REPO,
      rama: HTML_REMOTO.RAMA,
      enCache: !!meta,
      bytes: meta ? meta.bytes : 0,
      ultimaDescarga: meta ? meta.cuando : null
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Activa o desactiva la actualización en caliente de la interfaz.
 *
 * Al activarla hace una prueba real: si la descarga no funciona, NO queda
 * activada. Es preferible fallar al configurar que dejar el sistema sirviendo
 * una interfaz vieja o, peor, en blanco.
 *
 * @param {boolean} activar
 * @returns {Object} Resultado
 */
function configurarHtmlRemoto(activar) {
  try {
    var props = PropertiesService.getScriptProperties();

    if (!activar) {
      props.deleteProperty('HTML_REMOTO');
      CacheService.getScriptCache().removeAll(['html_meta', 'html_etag']);
      return { success: true, activo: false, mensaje: 'Desactivado. Se sirve el archivo del proyecto.' };
    }

    // Prueba antes de activar
    var prueba = _probarDescargaInterfaz();
    if (!prueba.success) {
      return { success: false, activo: false, error: prueba.error };
    }

    props.setProperty('HTML_REMOTO', '1');
    return {
      success: true,
      activo: true,
      mensaje: 'Activado. La interfaz se tomará de ' + HTML_REMOTO.REPO + ' (' +
               HTML_REMOTO.RAMA + '), ' + Math.round(prueba.bytes / 1024) + ' KB.'
    };
  } catch (error) {
    Logger.log('Error en configurarHtmlRemoto: ' + error.message);
    return { success: false, error: error.message };
  }
}

/** Descarga la interfaz y la valida, sin activar nada ni tocar la caché. */
function _probarDescargaInterfaz() {
  try {
    var url = 'https://raw.githubusercontent.com/' + HTML_REMOTO.REPO + '/' +
              HTML_REMOTO.RAMA + '/' + HTML_REMOTO.ARCHIVO;
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });

    if (r.getResponseCode() !== 200) {
      return {
        success: false,
        error: 'GitHub respondió ' + r.getResponseCode() + '. Verificá que el repositorio ' +
               HTML_REMOTO.REPO + ' sea público o que la rama ' + HTML_REMOTO.RAMA + ' exista.'
      };
    }

    var contenido = r.getContentText('UTF-8');
    if (!contenido || contenido.length < HTML_REMOTO.TAMANIO_MINIMO) {
      return { success: false, error: 'El archivo descargado es demasiado chico (' +
               (contenido ? contenido.length : 0) + ' bytes): no parece la interfaz.' };
    }
    if (contenido.indexOf(HTML_REMOTO.MARCA) === -1) {
      return { success: false, error: 'El archivo descargado no tiene la estructura esperada.' };
    }
    return { success: true, bytes: contenido.length };
  } catch (error) {
    return { success: false, error: 'No se pudo contactar GitHub: ' + error.message };
  }
}

// ============================================================================
// AUTENTICACION DE LA API REST
//
// Las acciones financieras de doPost (addTransfers, addMovements, saveBackup)
// y las de lectura sensible de la API GET (getClients, exportData,
// getLatestBackup) NO validaban nada, mientras las de logistica si pasaban su
// token. Segun como este publicado el Web App, cualquiera con la URL podia
// inyectar movimientos de cuenta corriente, pisar el backup o descargar el
// padron completo de clientes.
//
// El token se guarda en la propiedad de script API_TOKEN y se configura desde
// Configuracion. Mientras no exista, esas acciones quedan DENEGADAS: es
// preferible que una integracion falle de forma visible y se arregle, a que
// el agujero siga abierto en silencio.
//
// La accion 'status' queda abierta a proposito, para poder comprobar que el
// servicio responde sin exponer ningun dato.
// ============================================================================

/**
 * Valida el token de la API REST.
 * La comparacion recorre siempre todos los caracteres para no filtrar
 * informacion por el tiempo de respuesta.
 * @param {string} token - Token recibido en la peticion
 * @returns {{ok: boolean, error?: string}}
 */
function _validarTokenApi(token) {
  const esperado = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!esperado || String(esperado).trim().length < 16) {
    return {
      ok: false,
      error: 'La API no tiene token configurado. Generá uno en Configuración → ' +
             'Claves y Tokens y enviálo en el campo "token" de cada petición.'
    };
  }

  const recibido = String(token || '');
  const objetivo = String(esperado).trim();
  if (recibido.length !== objetivo.length) {
    return { ok: false, error: 'Token de API inválido.' };
  }
  let diferencias = 0;
  for (let i = 0; i < objetivo.length; i++) {
    if (recibido.charCodeAt(i) !== objetivo.charCodeAt(i)) diferencias++;
  }
  if (diferencias !== 0) {
    return { ok: false, error: 'Token de API inválido.' };
  }
  return { ok: true };
}

/** Respuesta JSON de rechazo por token. */
function _respuestaNoAutorizada(motivo) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, error: motivo, code: 'NO_AUTORIZADO' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// GESTION DE INQUILINOS (ALQUILERES)
// ============================================================================

/**
 * Agrega un inquilino a la hoja ALQUILERES_CONFIG.
 *
 * Antes la lista vivia en un array fijo del codigo (CONFIG.INQUILINOS), asi
 * que sumar o quitar un inquilino obligaba a editar el archivo y volver a
 * desplegar. CONFIG.getInquilinos() ya leia de la hoja; faltaba poder
 * editarla desde la interfaz.
 *
 * @param {Object} datos - {nombre, montoSemanal}
 * @returns {{success: boolean, mensaje?: string, error?: string}}
 */
function agregarInquilino(datos) {
  const lock = LockService.getScriptLock();
  let lockAdquirido = false;
  try {
    const nombre = normalizarString((datos && datos.nombre) || '');
    if (!nombre || nombre.length < 2) {
      return { success: false, error: 'El nombre del inquilino es obligatorio.' };
    }
    const monto = Number((datos && datos.montoSemanal) || 0);
    if (!isFinite(monto) || monto < 0) {
      return { success: false, error: 'El monto semanal debe ser un número mayor o igual a cero.' };
    }

    lock.waitLock(30000);
    lockAdquirido = true;

    const ss = getSpreadsheet();
    let hoja = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES_CONFIG);
    if (!hoja) {
      hoja = ss.insertSheet(CONFIG.HOJAS.ALQUILERES_CONFIG);
      hoja.appendRow(['INQUILINO', 'MONTO_SEMANAL', 'AJUSTE_OBRA', 'AJUSTE_MERCADERIA',
                      'SALDO', 'ULTIMO_PAGO', 'OBS']);
      hoja.getRange(1, 1, 1, 7).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }

    // Duplicados: se compara normalizado, igual que al registrar un pago
    const ultima = hoja.getLastRow();
    if (ultima > 1) {
      const existentes = hoja.getRange(2, 1, ultima - 1, 1).getValues();
      for (let i = 0; i < existentes.length; i++) {
        if (normalizarString(existentes[i][0]) === nombre) {
          return { success: false, error: 'Ya existe un inquilino con ese nombre.' };
        }
      }
    }

    hoja.appendRow([nombre, monto, 0, 0, 0, '', '']);
    Logger.log('[ALQUILERES] Inquilino agregado: ' + nombre);
    return { success: true, mensaje: 'Inquilino "' + nombre + '" agregado.' };

  } catch (error) {
    Logger.log('Error en agregarInquilino: ' + error.message);
    return { success: false, error: error.message };
  } finally {
    if (lockAdquirido) lock.releaseLock();
  }
}

/**
 * Quita un inquilino de la hoja de configuracion.
 *
 * NO borra su historial de movimientos: solo deja de ofrecerlo en las listas.
 * Borrar los movimientos seria destruir el registro contable.
 *
 * @param {string} nombre - Nombre del inquilino
 * @returns {{success: boolean, mensaje?: string, error?: string}}
 */
function quitarInquilino(nombre) {
  const lock = LockService.getScriptLock();
  let lockAdquirido = false;
  try {
    const buscado = normalizarString(nombre || '');
    if (!buscado) return { success: false, error: 'Falta el nombre del inquilino.' };

    lock.waitLock(30000);
    lockAdquirido = true;

    const ss = getSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES_CONFIG);
    if (!hoja || hoja.getLastRow() <= 1) {
      return { success: false, error: 'No hay inquilinos configurados.' };
    }

    const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < filas.length; i++) {
      if (normalizarString(filas[i][0]) === buscado) {
        hoja.deleteRow(i + 2);
        Logger.log('[ALQUILERES] Inquilino quitado de la configuración: ' + buscado);
        return {
          success: true,
          mensaje: 'Inquilino quitado. Su historial de movimientos se conserva intacto.'
        };
      }
    }
    return { success: false, error: 'No se encontró ese inquilino.' };

  } catch (error) {
    Logger.log('Error en quitarInquilino: ' + error.message);
    return { success: false, error: error.message };
  } finally {
    if (lockAdquirido) lock.releaseLock();
  }
}

/**
 * Lista los inquilinos configurados, con su monto semanal.
 * @returns {{success: boolean, inquilinos: Array<Object>}}
 */
function obtenerInquilinosConfig() {
  try {
    const ss = getSpreadsheet();
    const hoja = ss.getSheetByName(CONFIG.HOJAS.ALQUILERES_CONFIG);
    if (!hoja || hoja.getLastRow() <= 1) return { success: true, inquilinos: [] };

    const C = CONFIG.COLS_ALQ_CONFIG;
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).getValues();
    const inquilinos = datos
      .filter(function(f) { return String(f[C.INQUILINO] || '').trim(); })
      .map(function(f) {
        return {
          nombre: String(f[C.INQUILINO]).trim(),
          montoSemanal: Number(f[C.MONTO_SEMANAL]) || 0,
          saldo: Number(f[C.SALDO]) || 0
        };
      });
    return { success: true, inquilinos: inquilinos };
  } catch (error) {
    Logger.log('Error en obtenerInquilinosConfig: ' + error.message);
    return { success: false, inquilinos: [], error: error.message };
  }
}

// ============================================================================
// EXPORTAR E IMPORTAR LA CONFIGURACION
// ============================================================================

/**
 * Exporta la configuracion del sistema como JSON.
 *
 * Deja FUERA todo lo que sea credencial —tokens, claves, certificados, PIN—
 * para que el archivo se pueda guardar o compartir sin filtrar nada.
 *
 * @returns {{success: boolean, json?: string, claves?: number, error?: string}}
 */
function exportarConfiguracion() {
  try {
    const props = PropertiesService.getScriptProperties().getProperties();

    // Nada de esto sale del sistema, por mas que se pida un respaldo completo
    const SECRETOS = ['API_TOKEN', 'AFIP_ACCESS_TOKEN', 'AFIP_CERT', 'AFIP_KEY',
                      'PIN_MODULOS_EXTRA', 'CLAUDE_API_KEY', 'SPREADSHEET_ID'];
    const esSecreto = function(clave) {
      if (SECRETOS.indexOf(clave) > -1) return true;
      return /TOKEN|KEY|SECRET|PASS|PIN|CLAVE|CERT/i.test(clave);
    };

    const limpias = {};
    let n = 0;
    Object.keys(props).forEach(function(clave) {
      if (esSecreto(clave)) return;
      limpias[clave] = props[clave];
      n++;
    });

    return {
      success: true,
      json: JSON.stringify({
        sistema: CONFIG.SISTEMA.NOMBRE,
        version: CONFIG.SISTEMA.VERSION,
        exportado: new Date().toISOString(),
        nota: 'No incluye credenciales (tokens, claves, certificados ni PIN).',
        configuracion: limpias
      }, null, 2),
      claves: n
    };
  } catch (error) {
    Logger.log('Error en exportarConfiguracion: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Importa una configuracion exportada antes.
 *
 * Ignora cualquier clave que parezca una credencial, incluso si viene en el
 * archivo: un JSON de origen desconocido no debe poder plantar un token ni
 * cambiar el PIN. Tampoco toca SPREADSHEET_ID, que apunta a los datos.
 *
 * @param {string} json - Contenido del archivo exportado
 * @returns {{success: boolean, aplicadas?: number, ignoradas?: Array, error?: string}}
 */
function importarConfiguracion(json) {
  try {
    let paquete;
    try {
      paquete = JSON.parse(String(json || ''));
    } catch (e) {
      return { success: false, error: 'El archivo no es un JSON válido.' };
    }

    const entrada = (paquete && paquete.configuracion) ? paquete.configuracion : paquete;
    if (!entrada || typeof entrada !== 'object') {
      return { success: false, error: 'El archivo no tiene una configuración reconocible.' };
    }

    const props = PropertiesService.getScriptProperties();
    const ignoradas = [];
    let aplicadas = 0;

    Object.keys(entrada).forEach(function(clave) {
      if (/TOKEN|KEY|SECRET|PASS|PIN|CLAVE|CERT|SPREADSHEET_ID/i.test(clave)) {
        ignoradas.push(clave);
        return;
      }
      const valor = entrada[clave];
      if (valor === null || valor === undefined || typeof valor === 'object') {
        ignoradas.push(clave);
        return;
      }
      props.setProperty(clave, String(valor));
      aplicadas++;
    });

    Logger.log('[CONFIG] Configuración importada: ' + aplicadas + ' claves aplicadas, ' +
               ignoradas.length + ' ignoradas por seguridad o formato.');
    return { success: true, aplicadas: aplicadas, ignoradas: ignoradas };

  } catch (error) {
    Logger.log('Error en importarConfiguracion: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Informa si la API tiene token configurado, SIN devolver su valor.
 * @returns {{success: boolean, configurado: boolean, longitud: number}}
 */
function obtenerEstadoTokenApi() {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    const valido = !!token && String(token).trim().length >= 16;
    return {
      success: true,
      configurado: valido,
      longitud: valido ? String(token).trim().length : 0
    };
  } catch (e) {
    return { success: false, configurado: false, longitud: 0, error: e.message };
  }
}

/**
 * Genera un token nuevo para la API REST y lo guarda.
 *
 * Lo devuelve UNA sola vez, en el momento de crearlo: después solo puede
 * consultarse si está configurado, nunca su valor. Si ya había uno, queda
 * invalidado, así que hay que actualizarlo en lo que consuma la API.
 *
 * @returns {{success: boolean, token?: string, error?: string}}
 */
function generarTokenApi() {
  try {
    // 48 caracteres hexadecimales a partir de dos UUID: suficiente entropía
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').substring(0, 48);
    PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
    Logger.log('[API] Token de API regenerado por ' + (Session.getActiveUser().getEmail() || 'desconocido'));
    return {
      success: true,
      token: token,
      mensaje: 'Token generado. Copialo ahora: no se vuelve a mostrar. ' +
               'Actualizá cualquier sistema externo que consuma la API.'
    };
  } catch (e) {
    Logger.log('Error en generarTokenApi: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Elimina el token de la API, dejando sus acciones protegidas inaccesibles.
 * @returns {{success: boolean, error?: string}}
 */
function revocarTokenApi() {
  try {
    PropertiesService.getScriptProperties().deleteProperty('API_TOKEN');
    Logger.log('[API] Token de API revocado por ' + (Session.getActiveUser().getEmail() || 'desconocido'));
    return { success: true, mensaje: 'Token revocado. La API quedó cerrada hasta que generés uno nuevo.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Punto de entrada para peticiones POST (API REST)
 * @param {Object} e - Evento con datos POST
 * @returns {TextOutput} Respuesta JSON
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Registrar en log para debugging
    Logger.log('API POST recibida - Acción: ' + data.action);

    // Acciones financieras: exigen el token de API
    const ACCIONES_PROTEGIDAS = ['addTransfers', 'addMovements', 'saveBackup'];
    if (ACCIONES_PROTEGIDAS.indexOf(data.action) > -1) {
      const auth = _validarTokenApi(data.token);
      if (!auth.ok) {
        Logger.log('[API] Rechazada acción "' + data.action + '": ' + auth.error);
        return _respuestaNoAutorizada(auth.error);
      }
    }

    if (data.action === 'addTransfers') {
      return agregarTransferenciasAPI(data.data);
    }

    if (data.action === 'addMovements') {
      return agregarMovimientosAPI(data.data);
    }

    if (data.action === 'saveBackup') {
      return guardarBackupAPI(data.data);
    }

    // ─── LOGÍSTICA: VALES ─────────────────────────────────────────
    if (data.action === 'valesRegistrar') {
      return ContentService.createTextOutput(JSON.stringify(valesFisicosRegistrar(data, data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'valesObtener') {
      return ContentService.createTextOutput(JSON.stringify(valesFisicosObtener(data.token, data.filtros || {})))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'valesAnular') {
      return ContentService.createTextOutput(JSON.stringify(valesFisicosAnular(data.id, data.motivo, data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'valesBuscarNumero') {
      return ContentService.createTextOutput(JSON.stringify(valesFisicosBuscarNumero(data.numero, data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── LOGÍSTICA: VACÍOS ────────────────────────────────────────
    if (data.action === 'vaciosEstado') {
      return ContentService.createTextOutput(JSON.stringify(vaciosDiariosEstado(data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'vaciosAbrir') {
      return ContentService.createTextOutput(JSON.stringify(vaciosDiariosAbrir(data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'vaciosGuardar' || data.action === 'vaciosCerrar') {
      return ContentService.createTextOutput(JSON.stringify(vaciosDiariosGuardar(
        data.sesionId, data.detalles, data.action === 'vaciosCerrar', data.token
      ))).setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'vaciosHistorial') {
      return ContentService.createTextOutput(JSON.stringify(vaciosDiariosHistorial(data.token)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: 'Acción no reconocida: ' + data.action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en doPost: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Maneja peticiones GET de la API REST
 * @param {Object} e - Evento con parámetros
 * @returns {TextOutput} Respuesta JSON
 */
function manejarApiGet(e) {
  try {
    const action = e.parameter.action;

    // Lecturas sensibles: exigen el token de API. 'status' queda abierta.
    const ACCIONES_PROTEGIDAS_GET = ['getClients', 'getLatestBackup', 'exportData'];
    if (ACCIONES_PROTEGIDAS_GET.indexOf(action) > -1) {
      const auth = _validarTokenApi(e.parameter.token);
      if (!auth.ok) {
        Logger.log('[API] Rechazada acción GET "' + action + '": ' + auth.error);
        return _respuestaNoAutorizada(auth.error);
      }
    }

    if (action === 'getClients') {
      return obtenerClientesAPI();
    }

    if (action === 'getLatestBackup') {
      return obtenerUltimoBackupAPI();
    }

    if (action === 'exportData') {
      return exportarDatosCompletos();
    }

    if (action === 'status') {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          status: 'POS Sol y Verde API activa',
          version: CONFIG.SISTEMA.VERSION,
          timestamp: new Date().toISOString()
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Acción por defecto
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        status: 'POS Sol y Verde API activa',
        availableActions: ['getClients', 'getLatestBackup', 'exportData', 'status'],
        postActions: ['addTransfers', 'addMovements', 'saveBackup']
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en manejarApiGet: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// API REST - FUNCIONES PRIVADAS
// ============================================================================

/**
 * Agrega múltiples transferencias desde API externa
 * @param {Array} transferencias - Array de objetos transferencia
 * @returns {TextOutput} Respuesta JSON
 */
function agregarTransferenciasAPI(transferencias) {
  try {
    if (!Array.isArray(transferencias) || transferencias.length === 0) {
      throw new Error('Se requiere un array de transferencias válido');
    }

    // Adaptar formato de API a formato interno
    const transferenciasAdaptadas = transferencias.map(t => ({
      fecha: t.FECHA,
      cliente: (t.CLIENTE || '').toUpperCase(),
      monto: Number(t.MONTO) || 0,
      banco: t.BANCO || '',
      condicion: t.CONDICION || 'Consumidor Final',
      tipoFactura: t.TIPO_FACTURA || '',
      obs: t.OBS || ''
    }));

    // Usar el repositorio existente
    const resultado = TransferenciasRepository.agregarMultiples(transferenciasAdaptadas);

    Logger.log(`API: ${resultado.exitosos.length} transferencias agregadas exitosamente`);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        count: resultado.exitosos.length,
        exitosos: resultado.exitosos.length,
        errores: resultado.errores.length,
        detalleErrores: resultado.errores
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en agregarTransferenciasAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Agrega múltiples movimientos desde API externa
 * @param {Array} movimientos - Array de objetos movimiento
 * @returns {TextOutput} Respuesta JSON
 */
function agregarMovimientosAPI(movimientos) {
  try {
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      throw new Error('Se requiere un array de movimientos válido');
    }

    // Adaptar formato de API a formato interno
    const movimientosAdaptados = movimientos.map(m => ({
      fecha: validarFecha(m.FECHA) ? m.FECHA : null,
      cliente: normalizarString(m.CLIENTE || ''),
      tipo: ['DEBE','HABER'].includes(m.TIPO) ? m.TIPO : null,
      monto: typeof m.MONTO === 'number' && m.MONTO > 0 ? m.MONTO : null,
      obs: sanitizarTexto(m.OBS || ''),
      usuario: m.USUARIO || 'API_EXTERNA'
    }));

    // Usar el repositorio existente
    const resultado = MovimientosRepository.registrarLote(movimientosAdaptados.filter(mov => mov.fecha && mov.cliente && mov.tipo && mov.monto));

    Logger.log(`API: ${resultado.exitosos.length} movimientos agregados exitosamente`);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        count: resultado.exitosos.length,
        exitosos: resultado.exitosos.length,
        errores: resultado.errores.length,
        detalleErrores: resultado.errores
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en agregarMovimientosAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obtiene todos los clientes para API externa
 * @returns {TextOutput} Respuesta JSON
 */
function obtenerClientesAPI() {
  try {
    // Obtener todos los clientes sin límite
    const clientes = ClientesRepository.obtenerTodos(0, 0);

    // Adaptar al formato de la API (usar nombres de columnas en mayúsculas)
    const clientesAPI = clientes.map(c => ({
      NOMBRE: c.nombre,
      TEL: c.tel || '',
      EMAIL: c.email || '',
      CUIT: c.cuit || '',
      SALDO: c.saldo || 0,
      LIMITE: c.limite || 0,
      CONDICION_FISCAL: c.condicionFiscal || 'Consumidor Final',
      RAZON_SOCIAL: c.razonSocial || '',
      DOMICILIO_FISCAL: c.domicilioFiscal || '',
      OBS: c.obs || ''
    }));

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: clientesAPI,
        total: clientesAPI.length,
        timestamp: new Date().toISOString()
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en obtenerClientesAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message, data: [] })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Guarda un backup completo del sistema en Google Drive
 * @param {Object} datosBackup - Datos del backup (opcional, si no se provee se generan automáticamente)
 * @returns {TextOutput} Respuesta JSON
 */
function guardarBackupAPI(datosBackup) {
  try {
    let datosParaGuardar;

    // Si no se proporcionan datos, exportar todo el sistema
    if (!datosBackup || Object.keys(datosBackup).length === 0) {
      Logger.log('Generando backup automático del sistema completo');
      datosParaGuardar = generarBackupCompleto();
    } else {
      datosParaGuardar = datosBackup;
    }

    // Crear o recuperar carpeta de backup
    const folder = getOrCreateFolder_('Backup Sistema POS');

    // Generar nombre de archivo con timestamp
    const date = Utilities.formatDate(
      new Date(),
      'America/Argentina/Buenos_Aires',
      'yyyy-MM-dd_HHmmss'
    );
    const fileName = 'backup_pos_' + date + '.json';

    // Crear archivo de backup
    const contenidoBackup = JSON.stringify(datosParaGuardar, null, 2);
    const archivo = folder.createFile(fileName, contenidoBackup, 'application/json');

    Logger.log('Backup guardado: ' + fileName);

    // Mantener solo los últimos 30 backups
    const files = folder.getFilesByType('application/json');
    const allFiles = [];
    while (files.hasNext()) {
      allFiles.push(files.next());
    }

    // Ordenar por fecha de creación (más reciente primero)
    allFiles.sort(function(a, b) {
      return b.getDateCreated().getTime() - a.getDateCreated().getTime();
    });

    // Eliminar backups antiguos (mantener solo 30)
    for (let i = 30; i < allFiles.length; i++) {
      allFiles[i].setTrashed(true);
      Logger.log('Backup eliminado (antiguo): ' + allFiles[i].getName());
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        fileName: fileName,
        fileId: archivo.getId(),
        backupsMantenidos: Math.min(30, allFiles.length),
        backupsEliminados: Math.max(0, allFiles.length - 30)
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en guardarBackupAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Obtiene el último backup guardado en Google Drive
 * @returns {TextOutput} Respuesta JSON con el contenido del backup
 */
function obtenerUltimoBackupAPI() {
  try {
    const folder = getOrCreateFolder_('Backup Sistema POS');
    const files = folder.getFilesByType('application/json');

    let latest = null;
    while (files.hasNext()) {
      const f = files.next();
      if (!latest || f.getDateCreated().getTime() > latest.getDateCreated().getTime()) {
        latest = f;
      }
    }

    if (latest) {
      const contenido = latest.getBlob().getDataAsString();
      Logger.log('Último backup recuperado: ' + latest.getName());

      // Intentar parsear para verificar que es JSON válido
      const datosBackup = JSON.parse(contenido);

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          fileName: latest.getName(),
          fileId: latest.getId(),
          dateCreated: latest.getDateCreated().toISOString(),
          data: datosBackup
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: 'No hay backups disponibles'
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en obtenerUltimoBackupAPI: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Exporta todos los datos del sistema para sincronización con POS
 * @returns {TextOutput} Respuesta JSON con todos los datos
 */
function exportarDatosCompletos() {
  try {
    Logger.log('Exportando datos completos del sistema...');

    const datosCompletos = generarBackupCompleto();

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: datosCompletos,
        timestamp: new Date().toISOString()
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error en exportarDatosCompletos: ' + error.message);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Genera un backup completo del sistema
 * @returns {Object} Objeto con todos los datos del sistema
 */
function generarBackupCompleto() {
  // Obtener todos los datos de los repositorios
  const clientes = ClientesRepository.obtenerTodos(0, 0);
  const movimientos = MovimientosRepository.obtenerRecientes(0); // 0 = todos
  const transferencias = TransferenciasRepository.obtenerTodas();

  // Obtener configuración del emisor
  const datosEmisor = obtenerDatosEmisor();

  return {
    version: CONFIG.SISTEMA.VERSION,
    fechaBackup: new Date().toISOString(),
    clientes: serializarParaWeb(clientes),
    movimientos: serializarParaWeb(movimientos),
    transferencias: serializarParaWeb(transferencias),
    emisor: datosEmisor.datos || {},
    estadisticas: {
      totalClientes: clientes.length,
      totalMovimientos: movimientos.length,
      totalTransferencias: transferencias.length,
      totalAdeudado: clientes.reduce((sum, c) => sum + (c.saldo || 0), 0)
    }
  };
}

/**
 * Obtiene o crea una carpeta en Google Drive
 * @param {string} name - Nombre de la carpeta
 * @returns {GoogleAppsScript.Drive.Folder} Carpeta de Drive
 */
function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  Logger.log('Creando carpeta: ' + name);
  return DriveApp.createFolder(name);
}

/**
 * Inicializa el sistema
 * @returns {Object} Resultado de la inicializacion
 */
function inicializarSistema() {
  try {
    Logger.log('=== INICIALIZANDO SISTEMA SOL & VERDE V2.0 ===');

    // Verificar spreadsheet
    const ss = getSpreadsheet();
    Logger.log('Spreadsheet: ' + ss.getName());

    // Verificar/crear hojas
    ClientesRepository.getHoja();
    Logger.log('Hoja CLIENTES: OK');

    MovimientosRepository.getHoja();
    Logger.log('Hoja MOVIMIENTOS: OK');

    CajaRepository.getHoja();
    Logger.log('Hoja CAJA_ARQUEOS: OK');

    Logger.log('=== SISTEMA INICIALIZADO CORRECTAMENTE ===');

    return {
      success: true,
      mensaje: 'Sistema inicializado correctamente',
      spreadsheet: ss.getName()
    };

  } catch (error) {
    Logger.log('ERROR en inicializacion: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - DATOS INICIALES
// ============================================================================

/**
 * Obtiene datos iniciales para el dashboard
 * @returns {Object} {clientes, movimientos, estadisticas}
 */
function obtenerDatosParaHTML() {
  try {
    // Solo clientes: es lo que necesita el autocomplete al inicio
    var clientes = ClientesRepository.obtenerTodos(0, 0);
    
    return {
      success:      true,
      clientes:     serializarParaWeb(clientes),
      movimientos:  [],   // se cargan en segundo plano por cargarMovimientosRecientes()
      totalClientes: clientes.length,
      timestamp:    new Date().toISOString()
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosParaHTML: ' + error.message);
    return { success: false, error: error.message, clientes: [], movimientos: [] };
  }
}

/**
 * Registra error crítico del navegador (window.onerror) en AUDITORIA.
 * @param {Object} detalle
 */
function registrarErrorCritico(detalle) {
  try {
    AuditLogger.registrar({
      modulo: 'FRONTEND',
      operacion: 'ERROR_JS',
      entidadId: '',
      entidadDesc: (detalle && detalle.mensaje) ? String(detalle.mensaje).substring(0, 240) : 'Error desconocido',
      antes: null,
      despues: detalle || {},
      montoImpacto: 0
    });
  } catch (e) {
    /* no propagar */
  }
}

/**
 * Paquete único de arranque: clientes, últimos movimientos, caja diaria, config, API key.
 * @returns {Object}
 */
function obtenerDatosArranqueDashboard() {
  try {
    var clientes = ClientesRepository.obtenerTodos(0, 0);
    var movimientos = MovimientosRepository.obtenerRecientes(50);
    var estadoCaja = CajaDiariaRepository.obtenerActiva();

    return {
      success: true,
      clientes: serializarParaWeb(clientes),
      movimientos: serializarParaWeb(movimientos),
      estadoCaja: serializarParaWeb(estadoCaja),
      configuracion: obtenerConfiguracion(),
      totalClientes: clientes.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosArranqueDashboard: ' + error.message);
    return {
      success: false,
      error: error.message,
      clientes: [],
      movimientos: [],
      estadoCaja: null
    };
  }
}

/**
 * Obtiene movimientos para el frontend.
 * @param {number} limite - 0 o sin parámetro = TODOS los movimientos
 */
function obtenerMovimientosRecientes(limite) {
  try {
    // Si llega undefined o null, cargar todos (0 = sin límite)
    var limiteNum = (typeof limite === 'number') ? limite : 0;
    var movimientos = MovimientosRepository.obtenerRecientes(limiteNum);
    return {
      success:     true,
      movimientos: serializarParaWeb(movimientos),
      total:       movimientos.length
    };
  } catch (error) {
    Logger.log('Error en obtenerMovimientosRecientes: ' + error.message);
    return { success: false, error: error.message, movimientos: [] };
  }
}

/**
 * Obtiene estadisticas del sistema
 * @returns {Object} Estadisticas completas
 */
function obtenerEstadisticas() {
  try {
    // Reutilizar clientes ya cacheados en RequestCache si están disponibles
    var CACHE_KEY_EST = 'estadisticas_resultado';
    var cached = RequestCache.get(CACHE_KEY_EST);
    if (cached) return cached;

    var clientes    = ClientesRepository.obtenerTodos(); // usa SheetsCache interno
    var estadsMov   = MovimientosRepository.obtenerEstadisticas();
    var deudores    = clientes.filter(function(c) { return c.saldo > 0; })
                              .sort(function(a, b) { return b.saldo - a.saldo; });

    var resultado = {
      success:        true,
      totalClientes:  clientes.length,
      totalDeudores:  deudores.length,
      totalAdeudado:  deudores.reduce(function(s, c) { return s + c.saldo; }, 0),
      topDeudores:    deudores.slice(0, 10).map(function(c) {
                        return { nombre: c.nombre, saldo: c.saldo };
                      }),
      movimientos:    estadsMov,
      timestamp:      new Date().toISOString()
    };

    RequestCache.set(CACHE_KEY_EST, resultado);
    return resultado;

  } catch (error) {
    Logger.log('Error en obtenerEstadisticas: ' + error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// API PUBLICA - CLIENTES
// ============================================================================

/**
 * Crea un nuevo cliente
 * @param {Object} clienteData - Datos del cliente
 * @returns {Object} Cliente creado
 */
function crearCliente(clienteData) {
  try {
    const cliente = ClientesRepository.crear(clienteData);
    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      mensaje: 'Cliente creado: ' + cliente.nombre
    };
  } catch (error) {
    Logger.log('Error en crearCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Actualiza un cliente existente
 * @param {string} nombre - Nombre del cliente
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Cliente actualizado
 */
function actualizarCliente(nombre, datos) {
  try {
    const cliente = ClientesRepository.actualizar(nombre, datos);
    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      mensaje: 'Cliente actualizado'
    };
  } catch (error) {
    Logger.log('Error en actualizarCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Elimina un cliente y todos sus movimientos
 * @param {string} nombre - Nombre del cliente
 * @returns {Object} Resultado
 */
function eliminarCliente(nombre) {
  try {
    // Primero eliminar movimientos
    MovimientosRepository.eliminarPorCliente(nombre);

    // Luego eliminar cliente
    ClientesRepository.eliminar(nombre);

    return {
      success: true,
      mensaje: 'Cliente eliminado: ' + nombre
    };
  } catch (error) {
    Logger.log('Error en eliminarCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Busca un cliente con sugerencias fuzzy
 * @param {string} termino - Termino de busqueda
 * @returns {Object} {exacto, sugerencias}
 */
function buscarCliente(termino) {
  try {
    const resultado = ClientesRepository.buscarConSugerencias(termino);
    return {
      success: true,
      exacto: resultado.exacto ? serializarParaWeb(resultado.exacto) : null,
      sugerencias: serializarParaWeb(resultado.sugerencias)
    };
  } catch (error) {
    Logger.log('Error en buscarCliente: ' + error.message);
    return {
      success: false,
      error: error.message,
      exacto: null,
      sugerencias: []
    };
  }
}

/**
 * Obtiene el historial de un cliente, por tramos.
 *
 * Sin opciones usa el limite configurado en Configuracion
 * (VISOR_MOVS_DEFAULT, 20 por defecto). Antes devolvia SIEMPRE todos los
 * movimientos y el navegador descartaba el resto: con un cliente de miles de
 * filas se transferia todo para mostrar 30.
 *
 * @param {string} nombre - Nombre del cliente
 * @param {Object} [opciones] - {limite, offset}. limite 0 = todos
 * @returns {Object} {cliente, movimientos, total, offset, limite, hayMas, ultimoPago, ultimoFiado}
 */
function obtenerHistorialCliente(nombre, opciones) {
  try {
    const cliente = ClientesRepository.buscarPorNombre(nombre);
    if (!cliente) {
      return {
        success: false,
        error: 'Cliente no encontrado: ' + nombre
      };
    }

    opciones = opciones || {};
    const limiteConfigurado = CONFIG.getVisor().MOVS_DEFAULT;

    let limite = (opciones.limite === undefined || opciones.limite === null || opciones.limite === '')
      ? limiteConfigurado
      : parseInt(opciones.limite, 10);
    if (isNaN(limite) || limite < 0) limite = limiteConfigurado;

    let offset = parseInt(opciones.offset, 10);
    if (isNaN(offset) || offset < 0) offset = 0;

    const pagina = MovimientosRepository.obtenerPorClientePaginado(nombre, limite, offset);

    return {
      success: true,
      cliente: serializarParaWeb(cliente),
      movimientos: serializarParaWeb(pagina.movimientos),
      total: pagina.total,
      offset: pagina.offset,
      limite: pagina.limite,
      hayMas: pagina.hayMas,
      ultimoPago: pagina.ultimoPago,
      ultimoFiado: pagina.ultimoFiado
    };
  } catch (error) {
    Logger.log('Error en obtenerHistorialCliente: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene todos los clientes deudores (para impresion)
 * @returns {Object} {deudores}
 */
function obtenerDeudores() {
  try {
    const deudores = ClientesRepository.obtenerDeudores();
    return {
      success: true,
      deudores: serializarParaWeb(deudores),
      totalAdeudado: deudores.reduce((sum, c) => sum + c.saldo, 0)
    };
  } catch (error) {
    Logger.log('Error en obtenerDeudores: ' + error.message);
    return {
      success: false,
      error: error.message,
      deudores: []
    };
  }
}

/**
 * Obtiene saldos de deudores con movimientos del dia especificado
 * INCLUYE tanto saldos positivos (deuda) como negativos (a favor)
 * @param {string} fecha - Fecha en formato YYYY-MM-DD (opcional, default hoy)
 * @returns {Object} {deudores: [{nombre, saldo, pagosDia, fiadosDia}], totalAdeudado, saldoAFavor}
 */
function obtenerSaldosConMovimientosDia(fecha) {
  try {
    var fechaFiltro = fecha ? parsearFechaLocal(fecha) : new Date();
    fechaFiltro.setHours(0, 0, 0, 0);
    var fechaFin = new Date(fechaFiltro);
    fechaFin.setHours(23, 59, 59, 999);

    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var esHoy = fechaFiltro.getTime() === hoy.getTime();

    // Movimientos del día para cálculo de columnas
    var movimientosDia = MovimientosRepository.obtenerPorRango(fechaFiltro, fechaFin);

    // Agrupar movimientos del día por cliente
    var movsPorCliente = {};
    for (var i = 0; i < movimientosDia.length; i++) {
      var mov = movimientosDia[i];
      if (!movsPorCliente[mov.cliente]) {
        movsPorCliente[mov.cliente] = { pagos: 0, fiados: 0 };
      }
      if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.HABER) {
        movsPorCliente[mov.cliente].pagos  += mov.monto;
      } else {
        movsPorCliente[mov.cliente].fiados += mov.monto;
      }
    }

    // Obtener saldos (actuales o históricos)
    var clientes = ClientesRepository.obtenerTodos();
    var saldosPorNombre = {};

    if (esHoy) {
      for (var j = 0; j < clientes.length; j++) {
        saldosPorNombre[clientes[j].nombre] = clientes[j].saldo || 0;
      }
    } else {
      saldosPorNombre = MovimientosRepository.calcularSaldosHistoricos(fechaFin);
    }

    // ─── TOTALES GLOBALES (incluyen a TODOS, incluso saldo=0) ────────────────
    var totalFiadosDia   = 0;
    var totalPagosDia    = 0;
    var totalDeudaActiva = 0;  // suma de saldos > 0
    var totalAFavor      = 0;  // suma de saldos < 0 (valor absoluto)

    for (var k = 0; k < clientes.length; k++) {
      var c = clientes[k];
      var saldo = saldosPorNombre[c.nombre] || 0;
      var mDia  = movsPorCliente[c.nombre]  || { pagos: 0, fiados: 0 };

      // Sumar en totales independientemente del saldo actual
      totalFiadosDia += mDia.fiados;
      totalPagosDia  += mDia.pagos;
      if (saldo > 0)  totalDeudaActiva += saldo;
      if (saldo < 0)  totalAFavor      += Math.abs(saldo);
    }

    // ─── LISTA VISIBLE: solo clientes con saldo != 0 ─────────────────────────
    var resultado = [];

    for (var l = 0; l < clientes.length; l++) {
      var cli = clientes[l];
      var sal = saldosPorNombre[cli.nombre] || 0;
      if (sal === 0) continue; // ocultar, pero ya sumamos en totales arriba

      var mDiaCli = movsPorCliente[cli.nombre] || { pagos: 0, fiados: 0 };
      resultado.push({
        nombre:    cli.nombre,
        saldo:     sal,
        esAFavor:  sal < 0,
        fiadosDia: mDiaCli.fiados,
        pagosDia:  mDiaCli.pagos
      });
    }

    // ─── ORDENAMIENTO ALFABÉTICO ESTRICTO ────────────────────────────────────
    resultado.sort(function(a, b) {
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });

    Logger.log('[SALDOS] Clientes en lista: ' + resultado.length + 
               ' | Con deuda: ' + resultado.filter(function(r) { return !r.esAFavor; }).length +
               ' | A favor: '   + resultado.filter(function(r) { return r.esAFavor; }).length +
               ' | Total fiados día: $' + totalFiadosDia +
               ' | Total pagos día: $'  + totalPagosDia);

    return {
      success:          true,
      fecha:            formatearFechaLocal(fechaFiltro),
      esHistorico:      !esHoy,
      deudores:         serializarParaWeb(resultado),
      totalAdeudado:    totalDeudaActiva,
      saldoAFavor:      totalAFavor,
      totalPagosDia:    totalPagosDia,
      totalFiadosDia:   totalFiadosDia,
      resumen: {
        clientesConDeuda:  resultado.filter(function(r) { return !r.esAFavor; }).length,
        clientesAFavor:    resultado.filter(function(r) { return r.esAFavor; }).length,
        clientesEnLista:   resultado.length
      }
    };

  } catch (error) {
    Logger.log('Error en obtenerSaldosConMovimientosDia: ' + error.message);
    return { success: false, error: error.message, deudores: [] };
  }
}

// ============================================================================
// API PUBLICA - MOVIMIENTOS
// ============================================================================

/**
 * Guarda un nuevo movimiento
 * @param {Object} movimientoData - {fecha, cliente, tipo, monto, obs}
 * @returns {Object} Movimiento guardado
 */
function guardarMovimiento(movimientoData) {
  try {
    // C-12: Parsear monto en formato argentino si viene como string
    if (movimientoData && movimientoData.monto !== undefined) {
      movimientoData.monto = parsearMontoARG(movimientoData.monto);
    }
    const movimiento = MovimientosRepository.registrar(movimientoData);
    const cliente = ClientesRepository.buscarPorNombre(movimiento.cliente);

    return {
      success: true,
      movimiento: serializarParaWeb(movimiento),
      cliente: cliente ? serializarParaWeb(cliente) : null,
      mensaje: movimientoData.tipo === 'DEBE' ? 'Fiado registrado' : 'Pago registrado'
    };
  } catch (error) {
    Logger.log('Error en guardarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Edita un movimiento existente
 * @param {number} id - ID del movimiento
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Movimiento actualizado
 */
function editarMovimiento(id, datos) {
  try {
    const movimiento = MovimientosRepository.editar(id, datos);
    return {
      success: true,
      movimiento: serializarParaWeb(movimiento),
      mensaje: 'Movimiento actualizado'
    };
  } catch (error) {
    Logger.log('Error en editarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Elimina un movimiento
 * @param {number} id - ID del movimiento
 * @returns {Object} Resultado
 */
function eliminarMovimiento(id) {
  try {
    MovimientosRepository.eliminar(id);
    return {
      success: true,
      mensaje: 'Movimiento eliminado'
    };
  } catch (error) {
    Logger.log('Error en eliminarMovimiento: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Recalcula todos los saldos
 * @returns {Object} Resultado
 */
function recalcularTodosSaldos() {
  try {
    const resultado = MovimientosRepository.recalcularTodosSaldos();
    return {
      success: true,
      clientesActualizados: resultado.clientesActualizados,
      omitidosSinMovimientos: resultado.omitidosSinMovimientos,
      mensaje: resultado.clientesActualizados + ' clientes actualizados, ' + resultado.omitidosSinMovimientos + ' sin movimientos (saldo preservado)'
    };
  } catch (error) {
    Logger.log('Error en recalcularTodosSaldos: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - LECTURA DE IMAGENES (OCR GRATUITO)
// ============================================================================

/**
 * Verifica si la API Key esta configurada
 * @returns {Object} {presente: boolean}
 */
function verificarApiKey() {
  // Conservada por compatibilidad con el frontend. El sistema ya NO usa
  // ninguna clave de IA: el OCR es gratuito y no necesita credenciales, asi
  // que siempre esta "presente".
  return {
    presente: true,
    motor: 'ocr-gratuito',
    mensaje: 'OCR gratuito activo: no requiere clave.'
  };
}

/**
 * Obtiene todos los clientes para exportación (sin límite)
 * @returns {Object} Lista de todos los clientes
 */
function obtenerTodosClientesParaExportar() {
  try {
    const clientes = ClientesRepository.obtenerTodos(0, 0); // Sin límite
    return {
      success: true,
      clientes: serializarParaWeb(clientes),
      total: clientes.length
    };
  } catch (error) {
    Logger.log('Error en obtenerTodosClientesParaExportar: ' + error.message);
    return {
      success: false,
      error: error.message,
      clientes: []
    };
  }
}

/**
 * Guarda imagen temporalmente para analisis
 * @param {string} imageBase64 - Imagen en base64
 * @returns {Object} {token}
 */
function guardarImagenTemporal(imageBase64) {
  try {
    const token = ImageCache.guardar(imageBase64);
    return {
      success: true,
      token: token
    };
  } catch (error) {
    Logger.log('Error en guardarImagenTemporal: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Lee una imagen de libro contable con OCR gratuito.
 *
 * Antes dependía de la API de Claude, con su clave y su costo por imagen.
 * Ahora usa el OCR de Drive (el mismo motor de Google Docs, sin costo ni
 * clave) y corrige lo leído contra el padrón real de clientes, que es lo que
 * más precisión aporta. El navegador puede además cruzar su propio motor y
 * mandar el resultado por ocrCorregirMovimientos.
 *
 * @param {string} token - Token de la imagen en caché
 * @param {string} fecha - Fecha del día
 * @returns {Object} Movimientos detectados, validados y con sugerencias
 */
function analizarImagen(token, fecha) {
  try {
    const imageBase64 = ImageCache.recuperar(token);
    if (!imageBase64) {
      throw new Error('Imagen no encontrada o expirada. Subí la imagen nuevamente.');
    }

    const cfg = CONFIG.getOcr();
    const lectura = OcrService.leerConDrive(imageBase64, cfg.IDIOMA);
    if (!lectura.success) {
      return { success: false, error: lectura.error };
    }

    const fechaUso = fecha || obtenerFechaHoy();
    const interpretado = OcrService.interpretarLibro(lectura.texto, fechaUso);
    const corregido = OcrService.corregirContraPadron(interpretado.movimientos);

    let observaciones = '';
    if (interpretado.movimientos.length === 0) {
      observaciones = 'No se detectó ningún movimiento. Probá con una foto más nítida, ' +
                      'bien derecha y con buena luz, o cargalos a mano.';
    } else {
      const dudosos = corregido.conSugerencias.length;
      if (dudosos > 0) {
        observaciones = dudosos + ' de ' + interpretado.movimientos.length +
                        ' nombres no coinciden exactamente con el padrón: revisalos antes de guardar.';
      }
    }

    return {
      success: true,
      movimientosValidos: serializarParaWeb(corregido.validos),
      movimientosConSugerencias: serializarParaWeb(corregido.conSugerencias),
      totalExtraidos: interpretado.movimientos.length,
      lineasIgnoradas: interpretado.lineasIgnoradas,
      textoCrudo: lectura.texto,
      motor: 'drive',
      ms: lectura.ms,
      observaciones: observaciones
    };

  } catch (error) {
    Logger.log('Error en analizarImagen: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Guarda multiples movimientos (desde Visual Reasoning)
 * @param {Array} movimientos - Array de movimientos
 * @returns {Object} Resultado
 */
function guardarMovimientosLote(movimientos) {
  try {
    const resultado = MovimientosRepository.registrarLote(movimientos);

    return {
      success: true,
      exitosos: resultado.exitosos.length,
      errores: resultado.errores.length,
      detalleExitosos: serializarParaWeb(resultado.exitosos),
      detalleErrores: resultado.errores,
      mensaje: `${resultado.exitosos.length} movimientos guardados, ${resultado.errores.length} errores`
    };
  } catch (error) {
    Logger.log('Error en guardarMovimientosLote: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - SISTEMA DE CAJA
// ============================================================================

/**
 * Guarda un arqueo de caja
 * @param {Object} datos - Datos del arqueo
 * @returns {Object} Resultado
 */
function guardarArqueo(datos) {
  try {
    const resultado = CajaRepository.guardarSesion(datos);
    return resultado;
  } catch (error) {
    Logger.log('Error en guardarArqueo: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene historial de sesiones de caja
 * @param {number} limite - Cantidad maxima
 * @returns {Object} Historial
 */
function obtenerHistorialCaja(limite) {
  try {
    const historial = CajaRepository.obtenerHistorial(limite || 30);
    return {
      success: true,
      sesiones: serializarParaWeb(historial)
    };
  } catch (error) {
    Logger.log('Error en obtenerHistorialCaja: ' + error.message);
    return {
      success: false,
      error: error.message,
      sesiones: []
    };
  }
}

/**
 * Genera resumen de arqueo para impresion
 * @param {string} sesionId - ID de sesion (opcional)
 * @returns {Object} Resumen del arqueo
 */
function obtenerResumenArqueo(sesionId) {
  try {
    const resumen = generarResumenArqueo(sesionId);
    if (resumen.error) {
      return { success: false, error: resumen.error };
    }
    return {
      success: true,
      ...serializarParaWeb(resumen)
    };
  } catch (error) {
    Logger.log('Error en obtenerResumenArqueo: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene los contadores configurables de caja (Arqueo de Efectivo).
 * "General" no se incluye acá: el frontend lo agrega fijo al final.
 * @returns {Array<{nombre:string, activo:boolean}>}
 */
function obtenerContadoresCajaConfig() {
  var DEFAULT_CONTADORES = [
    { nombre: 'Diego', activo: true },
    { nombre: 'Oscar', activo: true },
    { nombre: 'Aldo', activo: true }
  ];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CONTADORES_CAJA');
    if (!raw) return DEFAULT_CONTADORES;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return DEFAULT_CONTADORES;
    return parsed.map(function(c, i) {
      return {
        nombre: (c && c.nombre) ? String(c.nombre).trim().slice(0, 20) : DEFAULT_CONTADORES[i].nombre,
        activo: !!(c && c.activo)
      };
    });
  } catch (e) {
    Logger.log('Error en obtenerContadoresCajaConfig: ' + e.message);
    return DEFAULT_CONTADORES;
  }
}

/**
 * Obtiene la configuracion del sistema
 * @returns {Object} Configuracion
 */
function obtenerConfiguracion() {
  const ocr = CONFIG.getOcr();
  return {
    // Denominaciones editables desde Configuración, con las de fábrica como
    // respaldo. Antes se enviaba el objeto fijo del código.
    denominaciones: { BILLETES: CONFIG.getDenominaciones(), MONEDAS: DENOMINACIONES.MONEDAS },
    formato: CONFIG.getFormato(),
    ui: CONFIG.getUI(),
    negocio: CONFIG.getNegocio(),
    tiposMovimiento: CONFIG.TIPOS_MOVIMIENTO,
    colores: CONFIG.COLORES,
    sistema: CONFIG.SISTEMA,
    print: CONFIG.getPrint(),
    contadoresCaja: obtenerContadoresCajaConfig(),
    visor: CONFIG.getVisor(),
    // El navegador necesita estos valores para preparar la imagen antes de
    // reconocerla: sin ellos usaría sus propios valores por defecto y los
    // ajustes de Configuración no tendrían efecto en el motor del navegador.
    ocr: {
      idioma:          ocr.IDIOMA,
      confianzaMinima: ocr.CONFIANZA_MINIMA,
      binarizacion:    ocr.BINARIZACION,
      anchoMaximo:     ocr.ANCHO_MAXIMO,
      autoRotar:       ocr.AUTO_ROTAR,
      motorServidor:   ocr.MOTOR_SERVIDOR,
      motorNavegador:  ocr.MOTOR_NAVEGADOR
    }
  };
}

// ============================================================================
// API PUBLICA - CONFIGURACION FISCAL DEL EMISOR
// ============================================================================

/**
 * Guarda los datos fiscales del emisor
 * @param {Object} datos - Datos del emisor
 * @returns {Object} Resultado
 */
function guardarDatosEmisor(datos) {
  try {
    const props = PropertiesService.getScriptProperties();

    // Validar CUIT
    if (!datos.cuit || datos.cuit.trim().length < 11) {
      throw new Error('CUIT inválido');
    }

    // Validar campos obligatorios
    if (!datos.razonSocial || !datos.razonSocial.trim()) {
      throw new Error('La Razón Social es obligatoria');
    }

    if (!datos.domicilio || !datos.domicilio.trim()) {
      throw new Error('El Domicilio Comercial es obligatorio');
    }

    // Guardar en ScriptProperties
    props.setProperty('EMISOR_CUIT', datos.cuit.trim());
    props.setProperty('EMISOR_RAZON_SOCIAL', datos.razonSocial.trim());
    props.setProperty('EMISOR_DOMICILIO', datos.domicilio.trim());
    props.setProperty('EMISOR_IIBB', datos.ingresosBrutos ? datos.ingresosBrutos.trim() : '');
    props.setProperty('EMISOR_FECHA_INICIO', datos.fechaInicio || '');
    props.setProperty('EMISOR_CONDICION_IVA', datos.condicionIVA || 'Responsable Inscripto');

    Logger.log('Datos del emisor guardados: ' + datos.razonSocial);

    return {
      success: true,
      mensaje: 'Datos del emisor guardados correctamente'
    };
  } catch (error) {
    Logger.log('Error en guardarDatosEmisor: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene los datos fiscales del emisor
 * @returns {Object} Datos del emisor
 */
function obtenerDatosEmisor() {
  try {
    const props = PropertiesService.getScriptProperties();

    const datos = {
      cuit: props.getProperty('EMISOR_CUIT') || '',
      razonSocial: props.getProperty('EMISOR_RAZON_SOCIAL') || '',
      domicilio: props.getProperty('EMISOR_DOMICILIO') || '',
      ingresosBrutos: props.getProperty('EMISOR_IIBB') || '',
      fechaInicio: props.getProperty('EMISOR_FECHA_INICIO') || '',
      condicionIVA: props.getProperty('EMISOR_CONDICION_IVA') || 'Responsable Inscripto'
    };

    return {
      success: true,
      datos: datos
    };
  } catch (error) {
    Logger.log('Error en obtenerDatosEmisor: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// API PUBLICA - CONFIGURACION GENERAL DEL SISTEMA
// ============================================================================

/**
 * Obtiene todas las configuraciones del sistema
 * @returns {Object} Todas las configuraciones
 */
function obtenerConfiguracionCompleta() {
  try {
    const props = PropertiesService.getScriptProperties();
    let envasesVacios = CONFIG.MODULOS_EXTRA.ENVASES_DEFAULT;
    const envasesVaciosGuardados = props.getProperty('ENVASES_VACIOS');
    if (envasesVaciosGuardados) {
      try {
        const envasesParseados = JSON.parse(envasesVaciosGuardados);
        if (Array.isArray(envasesParseados)) envasesVacios = envasesParseados;
      } catch (error) {
        Logger.log('ENVASES_VACIOS inválido; se usarán los valores por defecto.');
      }
    }
    
    // Inquilinos (lista separada por comas)
    const inquilinosProp = props.getProperty('INQUILINOS') || CONFIG.INQUILINOS.join(',');
    const inquilinosArray = inquilinosProp.split(',');
    const inquilinosFiltrados = inquilinosArray.map(i => i.trim()).filter(i => i);
    
    // Configuración general del sistema
    const config = {
      // Sistema
      nombreSistema: props.getProperty('SISTEMA_NOMBRE') || CONFIG.SISTEMA.NOMBRE,
      version: CONFIG.SISTEMA.VERSION,
      
      // Límites y valores por defecto
      limiteCredito: parseFloat(props.getProperty('LIMITE_CREDITO_DEFAULT') || CONFIG.DEFAULTS.LIMITE_CREDITO),
      saldoInicial: parseFloat(props.getProperty('SALDO_INICIAL_DEFAULT') || CONFIG.DEFAULTS.SALDO_INICIAL),
      
      // Backups
      carpetaBackup: props.getProperty('CARPETA_BACKUP') || 'Backup Sistema POS',
      
      // UI
      logoUrl: props.getProperty('LOGO_URL') || 'https://i.imgur.com/tStvmV1.png',
      
      // Paginación
      paginaTamano: parseInt(props.getProperty('PAGINATION_DEFAULT_SIZE') || CONFIG.PAGINATION.DEFAULT_PAGE_SIZE),
      paginaTamanoMax: parseInt(props.getProperty('PAGINATION_MAX_SIZE') || CONFIG.PAGINATION.MAX_PAGE_SIZE),

      // Limites de visualizacion (0 = todos)
      visorMovsDefault: CONFIG.getVisor().MOVS_DEFAULT,

      // Formato de montos y fechas
      formatoMoneda:    CONFIG.getFormato().MONEDA_SIMBOLO,
      formatoFecha:     CONFIG.getFormato().FORMATO_FECHA,
      formatoDecimales: CONFIG.getFormato().DECIMALES,

      // Interfaz
      uiDuracionAviso:  CONFIG.getUI().DURACION_AVISO,
      uiFilasPorPagina: CONFIG.getUI().FILAS_POR_PAGINA,
      uiTamanioFuente:  CONFIG.getUI().TAMANIO_FUENTE,
      uiTemaInicial:    CONFIG.getUI().TEMA_INICIAL,

      // Reglas del negocio
      negocioAlertaSaldo:     CONFIG.getNegocio().ALERTA_SALDO,
      negocioDiasInactivo:    CONFIG.getNegocio().DIAS_INACTIVO,
      negocioDiasBackup:      CONFIG.getNegocio().DIAS_BACKUP,
      negocioRetencionBackup: CONFIG.getNegocio().RETENCION_BACKUP,

      // Denominaciones de billetes para el arqueo
      denominaciones: CONFIG.getDenominaciones(),

      // OCR gratuito
      ocrIdioma:           CONFIG.getOcr().IDIOMA,
      ocrConfianzaMinima:  CONFIG.getOcr().CONFIANZA_MINIMA,
      ocrBinarizacion:     CONFIG.getOcr().BINARIZACION,
      ocrAnchoMaximo:      CONFIG.getOcr().ANCHO_MAXIMO,
      ocrMotorServidor:    CONFIG.getOcr().MOTOR_SERVIDOR,
      ocrMotorNavegador:   CONFIG.getOcr().MOTOR_NAVEGADOR,
      ocrAutoRotar:        CONFIG.getOcr().AUTO_ROTAR,
      
      // IVA
      ivaPorcentaje: parseFloat(props.getProperty('IVA_PORCENTAJE') || '10.5'),
      ivaMultiplicador: parseFloat(props.getProperty('IVA_MULTIPLICADOR') || '0.105'),
      ivaAlicuotaId: parseInt(props.getProperty('IVA_ALICUOTA_ID') || '4'),
      
      // Búsqueda Fuzzy
      fuzzyMinScore: parseInt(props.getProperty('FUZZY_MIN_SCORE') || CONFIG.FUZZY.MIN_SCORE),
      fuzzyMaxSugerencias: parseInt(props.getProperty('FUZZY_MAX_SUGERENCIAS') || CONFIG.FUZZY.MAX_SUGERENCIAS),
      fuzzyPesoExacto: parseInt(props.getProperty('FUZZY_PESO_EXACTO') || CONFIG.FUZZY.PESO_EXACTO),
      fuzzyPesoComienza: parseInt(props.getProperty('FUZZY_PESO_COMIENZA') || CONFIG.FUZZY.PESO_COMIENZA),
      fuzzyPesoContiene: parseInt(props.getProperty('FUZZY_PESO_CONTIENE') || CONFIG.FUZZY.PESO_CONTIENE),
      fuzzyPesoLevenshtein: parseInt(props.getProperty('FUZZY_PESO_LEVENSHTEIN') || CONFIG.FUZZY.PESO_LEVENSHTEIN),
      
      // Impresión
      printFontSizeSaldos: parseInt(props.getProperty('PRINT_FONT_SIZE_SALDOS') || CONFIG.PRINT.FONT_SIZE_SALDOS),
      printFontSizeHeader: parseInt(props.getProperty('PRINT_FONT_SIZE_HEADER') || CONFIG.PRINT.FONT_SIZE_HEADER),
      printOrientation: props.getProperty('PRINT_ORIENTATION') || CONFIG.PRINT.ORIENTATION,
      printScale: parseInt(props.getProperty('PRINT_SCALE') || CONFIG.PRINT.SCALE),
      printMargin: parseFloat(props.getProperty('PRINT_MARGIN') || CONFIG.PRINT.MARGIN),
      printFitToWidth: (props.getProperty('PRINT_FIT_TO_WIDTH') || CONFIG.PRINT.FIT_TO_WIDTH.toString()) === 'true',
      printPageMode: props.getProperty('PRINT_PAGE_MODE') || CONFIG.PRINT.PAGE_MODE,
      printShowLogo: (props.getProperty('PRINT_SHOW_LOGO') || CONFIG.PRINT.SHOW_LOGO.toString()) !== 'false',
      printShowCompany: (props.getProperty('PRINT_SHOW_COMPANY') || CONFIG.PRINT.SHOW_COMPANY.toString()) !== 'false',
      printFooter: props.getProperty('PRINT_FOOTER') || CONFIG.PRINT.FOOTER,
      printPageBreak: (props.getProperty('PRINT_PAGE_BREAK') || CONFIG.PRINT.PAGE_BREAK.toString()) === 'true',
      calPrintCellHeight: parseFloat(props.getProperty('CAL_PRINT_CELL_HEIGHT') || '3.0'),

      // Inquilinos
      inquilinos: inquilinosFiltrados,

      // Textos de Ayuda
      ayudaTutoriales: props.getProperty('AYUDA_TUTORIALES') || '',

      // Contadores de Caja (Arqueo de Efectivo)
      contadoresCaja: obtenerContadoresCajaConfig(),

      // Módulos Extra (PIN y Envases)
      envasesVacios: envasesVacios
    };
    
    return {
      success: true,
      config: config
    };
  } catch (error) {
    Logger.log('Error en obtenerConfiguracionCompleta: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Guarda configuraciones generales del sistema
 * @param {Object} config - Configuraciones a guardar
 * @returns {Object} Resultado
 */
function guardarConfiguracionGeneral(config) {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // Guardar cada configuración si está presente
    if (config.nombreSistema !== undefined) {
      props.setProperty('SISTEMA_NOMBRE', config.nombreSistema.trim());
    }
    
    if (config.limiteCredito !== undefined) {
      const limite = parseFloat(config.limiteCredito);
      if (isNaN(limite) || limite < 0) {
        throw new Error('Límite de crédito debe ser un número mayor o igual a 0');
      }
      props.setProperty('LIMITE_CREDITO_DEFAULT', limite.toString());
    }
    
    if (config.saldoInicial !== undefined) {
      props.setProperty('SALDO_INICIAL_DEFAULT', config.saldoInicial.toString());
    }
    
    if (config.carpetaBackup !== undefined) {
      props.setProperty('CARPETA_BACKUP', config.carpetaBackup.trim());
    }
    
    if (config.logoUrl !== undefined) {
      props.setProperty('LOGO_URL', config.logoUrl.trim());
    }
    
    if (config.paginaTamano !== undefined) {
      const tamano = parseInt(config.paginaTamano);
      if (isNaN(tamano) || tamano < 1 || tamano > 100) {
        throw new Error('Tamaño de página debe estar entre 1 y 100');
      }
      props.setProperty('PAGINATION_DEFAULT_SIZE', tamano.toString());
    }
    
    if (config.paginaTamanoMax !== undefined) {
      const tamanoMax = parseInt(config.paginaTamanoMax);
      if (isNaN(tamanoMax) || tamanoMax < 1 || tamanoMax > 500) {
        throw new Error('Tamaño máximo de página inválido (1-500)');
      }
      props.setProperty('PAGINATION_MAX_SIZE', tamanoMax.toString());
    }

    // Limites de visualizacion: 0 = mostrar todos
    if (config.visorMovsDefault !== undefined) {
      const visorMovs = parseInt(config.visorMovsDefault);
      if (isNaN(visorMovs) || visorMovs < 0 || visorMovs > 100000) {
        throw new Error('Movimientos del Visor inválido (0 = todos, máximo 100000)');
      }
      props.setProperty('VISOR_MOVS_DEFAULT', visorMovs.toString());
    }

    // IVA
    if (config.ivaPorcentaje !== undefined) {
      const iva = parseFloat(config.ivaPorcentaje);
      if (isNaN(iva) || iva < 0 || iva > 100) {
        throw new Error('Porcentaje de IVA inválido (0-100)');
      }
      props.setProperty('IVA_PORCENTAJE', iva.toString());
      props.setProperty('IVA_MULTIPLICADOR', (iva / 100).toString());
    }
    
    if (config.ivaAlicuotaId !== undefined) {
      props.setProperty('IVA_ALICUOTA_ID', config.ivaAlicuotaId.toString());
    }
    
    // ── Formato de montos y fechas ──────────────────────────────────────────
    if (config.formatoMoneda !== undefined) {
      const simbolo = String(config.formatoMoneda).trim();
      if (!simbolo || simbolo.length > 5) {
        throw new Error('El símbolo de moneda debe tener entre 1 y 5 caracteres');
      }
      props.setProperty('FORMATO_MONEDA', simbolo);
    }

    if (config.formatoFecha !== undefined) {
      const fmt = String(config.formatoFecha).trim().toUpperCase();
      if (['DD/MM/AAAA', 'AAAA-MM-DD', 'DD-MM-AAAA'].indexOf(fmt) === -1) {
        throw new Error('Formato de fecha inválido');
      }
      props.setProperty('FORMATO_FECHA', fmt);
    }

    if (config.formatoDecimales !== undefined) {
      const dec = parseInt(config.formatoDecimales);
      if (isNaN(dec) || dec < 0 || dec > 2) {
        throw new Error('Los decimales deben ser 0, 1 o 2');
      }
      props.setProperty('FORMATO_DECIMALES', dec.toString());
    }

    // ── Interfaz ────────────────────────────────────────────────────────────
    if (config.uiDuracionAviso !== undefined) {
      const ms = parseInt(config.uiDuracionAviso);
      if (isNaN(ms) || ms < 500 || ms > 30000) {
        throw new Error('La duración de los avisos debe estar entre 500 y 30000 ms');
      }
      props.setProperty('UI_DURACION_AVISO', ms.toString());
    }

    if (config.uiFilasPorPagina !== undefined) {
      const filas = parseInt(config.uiFilasPorPagina);
      if (isNaN(filas) || filas < 5 || filas > 500) {
        throw new Error('Las filas por página deben estar entre 5 y 500');
      }
      props.setProperty('UI_FILAS_POR_PAGINA', filas.toString());
    }

    if (config.uiTamanioFuente !== undefined) {
      const fuente = parseInt(config.uiTamanioFuente);
      if (isNaN(fuente) || fuente < 70 || fuente > 150) {
        throw new Error('El tamaño de fuente debe estar entre 70% y 150%');
      }
      props.setProperty('UI_TAMANIO_FUENTE', fuente.toString());
    }

    if (config.uiTemaInicial !== undefined) {
      const tema = String(config.uiTemaInicial).trim().toLowerCase();
      if (tema !== 'light' && tema !== 'dark') {
        throw new Error('El tema inicial debe ser claro u oscuro');
      }
      props.setProperty('UI_TEMA_INICIAL', tema);
    }

    // ── Reglas del negocio ──────────────────────────────────────────────────
    if (config.negocioAlertaSaldo !== undefined) {
      const alerta = parseInt(config.negocioAlertaSaldo);
      if (isNaN(alerta) || alerta < 0) {
        throw new Error('El umbral de alerta de saldo no puede ser negativo (0 = usar el límite de cada cliente)');
      }
      props.setProperty('NEGOCIO_ALERTA_SALDO', alerta.toString());
    }

    if (config.negocioDiasInactivo !== undefined) {
      const dias = parseInt(config.negocioDiasInactivo);
      if (isNaN(dias) || dias < 1 || dias > 3650) {
        throw new Error('Los días de inactividad deben estar entre 1 y 3650');
      }
      props.setProperty('NEGOCIO_DIAS_INACTIVO', dias.toString());
    }

    if (config.negocioDiasBackup !== undefined) {
      const dias = parseInt(config.negocioDiasBackup);
      if (isNaN(dias) || dias < 1 || dias > 365) {
        throw new Error('La frecuencia de respaldo debe estar entre 1 y 365 días');
      }
      props.setProperty('NEGOCIO_DIAS_BACKUP', dias.toString());
    }

    if (config.negocioRetencionBackup !== undefined) {
      const dias = parseInt(config.negocioRetencionBackup);
      if (isNaN(dias) || dias < 1 || dias > 3650) {
        throw new Error('La retención de respaldos debe estar entre 1 y 3650 días');
      }
      props.setProperty('NEGOCIO_RETENCION_BACKUP', dias.toString());
    }

    // ── Denominaciones de billetes del arqueo ───────────────────────────────
    if (config.denominaciones !== undefined) {
      if (!Array.isArray(config.denominaciones) || config.denominaciones.length === 0) {
        throw new Error('Tiene que haber al menos una denominación de billete');
      }
      if (config.denominaciones.length > 30) {
        throw new Error('Demasiadas denominaciones (máximo 30)');
      }
      const vistos = {};
      const limpias = config.denominaciones.map(function(d) {
        const valor = Math.round(Number(d && d.valor));
        if (!isFinite(valor) || valor <= 0 || valor > 10000000) {
          throw new Error('Cada billete necesita un valor entre 1 y 10.000.000');
        }
        if (vistos[valor]) {
          throw new Error('Hay dos billetes con el mismo valor: ' + valor);
        }
        vistos[valor] = true;
        return {
          valor: valor,
          nombre: String((d && d.nombre) || ('Billete $' + valor)).trim().substring(0, 60)
        };
      });
      props.setProperty('DENOMINACIONES_BILLETES', JSON.stringify(limpias));
    }

    // OCR gratuito (reemplaza a la configuración de Claude AI, que ya no existe)
    if (config.ocrIdioma !== undefined) {
      const idioma = String(config.ocrIdioma).trim().toLowerCase();
      if (!/^[a-z]{2,3}(\+[a-z]{2,3})*$/.test(idioma)) {
        throw new Error('Idioma de OCR inválido. Usá códigos como "es" o "es+en".');
      }
      props.setProperty('OCR_IDIOMA', idioma);
    }

    if (config.ocrConfianzaMinima !== undefined) {
      const conf = parseInt(config.ocrConfianzaMinima);
      if (isNaN(conf) || conf < 0 || conf > 100) {
        throw new Error('La confianza mínima del OCR debe estar entre 0 y 100');
      }
      props.setProperty('OCR_CONFIANZA_MINIMA', conf.toString());
    }

    if (config.ocrBinarizacion !== undefined) {
      const bin = parseInt(config.ocrBinarizacion);
      if (isNaN(bin) || bin < 0 || bin > 50) {
        throw new Error('La binarización del OCR debe estar entre 0 y 50');
      }
      props.setProperty('OCR_BINARIZACION', bin.toString());
    }

    if (config.ocrAnchoMaximo !== undefined) {
      const ancho = parseInt(config.ocrAnchoMaximo);
      if (isNaN(ancho) || ancho < 600 || ancho > 5000) {
        throw new Error('El ancho máximo del OCR debe estar entre 600 y 5000 píxeles');
      }
      props.setProperty('OCR_ANCHO_MAXIMO', ancho.toString());
    }

    if (config.ocrMotorServidor !== undefined) {
      props.setProperty('OCR_MOTOR_SERVIDOR', config.ocrMotorServidor ? 'true' : 'false');
    }
    if (config.ocrMotorNavegador !== undefined) {
      props.setProperty('OCR_MOTOR_NAVEGADOR', config.ocrMotorNavegador ? 'true' : 'false');
    }
    if (config.ocrAutoRotar !== undefined) {
      props.setProperty('OCR_AUTO_ROTAR', config.ocrAutoRotar ? 'true' : 'false');
    }

    // Búsqueda Fuzzy
    if (config.fuzzyMinScore !== undefined) {
      props.setProperty('FUZZY_MIN_SCORE', config.fuzzyMinScore.toString());
    }
    
    if (config.fuzzyMaxSugerencias !== undefined) {
      props.setProperty('FUZZY_MAX_SUGERENCIAS', config.fuzzyMaxSugerencias.toString());
    }
    
    if (config.fuzzyPesoExacto !== undefined) {
      props.setProperty('FUZZY_PESO_EXACTO', config.fuzzyPesoExacto.toString());
    }
    
    if (config.fuzzyPesoComienza !== undefined) {
      props.setProperty('FUZZY_PESO_COMIENZA', config.fuzzyPesoComienza.toString());
    }
    
    if (config.fuzzyPesoContiene !== undefined) {
      props.setProperty('FUZZY_PESO_CONTIENE', config.fuzzyPesoContiene.toString());
    }
    
    if (config.fuzzyPesoLevenshtein !== undefined) {
      props.setProperty('FUZZY_PESO_LEVENSHTEIN', config.fuzzyPesoLevenshtein.toString());
    }
    
    // Impresión
    if (config.printFontSizeSaldos !== undefined) {
      const fontSize = parseInt(config.printFontSizeSaldos);
      if (isNaN(fontSize) || fontSize < 4 || fontSize > 24) {
        throw new Error('Tamaño de fuente de impresión debe estar entre 4 y 24 pt');
      }
      props.setProperty('PRINT_FONT_SIZE_SALDOS', fontSize.toString());
    }
    
    if (config.printFontSizeHeader !== undefined) {
      const fontSize = parseInt(config.printFontSizeHeader);
      if (isNaN(fontSize) || fontSize < 8 || fontSize > 28) {
        throw new Error('Tamaño de fuente de encabezado debe estar entre 8 y 28 pt');
      }
      props.setProperty('PRINT_FONT_SIZE_HEADER', fontSize.toString());
    }
    
    if (config.printOrientation !== undefined) {
      if (config.printOrientation !== 'portrait' && config.printOrientation !== 'landscape') {
        throw new Error('Orientación debe ser "portrait" o "landscape"');
      }
      props.setProperty('PRINT_ORIENTATION', config.printOrientation);
    }
    
    if (config.printScale !== undefined) {
      const scale = parseInt(config.printScale);
      if (isNaN(scale) || scale < 50 || scale > 150) {
        throw new Error('Escala de impresión debe estar entre 50 y 150%');
      }
      props.setProperty('PRINT_SCALE', scale.toString());
    }
    
    if (config.printMargin !== undefined) {
      const margin = parseFloat(config.printMargin);
      if (isNaN(margin) || margin < 0.3 || margin > 3) {
        throw new Error('Margen debe estar entre 0.3 y 3 cm');
      }
      props.setProperty('PRINT_MARGIN', margin.toString());
    }
    
    if (config.printFitToWidth !== undefined) {
      props.setProperty('PRINT_FIT_TO_WIDTH', config.printFitToWidth.toString());
    }

    if (config.printPageMode !== undefined) {
      const validModes = ['auto', 'single', 'multi'];
      if (validModes.includes(config.printPageMode)) {
        props.setProperty('PRINT_PAGE_MODE', config.printPageMode);
      }
    }

    if (config.printShowLogo !== undefined) {
      props.setProperty('PRINT_SHOW_LOGO', config.printShowLogo.toString());
    }

    if (config.printShowCompany !== undefined) {
      props.setProperty('PRINT_SHOW_COMPANY', config.printShowCompany.toString());
    }

    if (config.printFooter !== undefined) {
      props.setProperty('PRINT_FOOTER', (config.printFooter || '').substring(0, 200));
    }

    if (config.printPageBreak !== undefined) {
      props.setProperty('PRINT_PAGE_BREAK', config.printPageBreak.toString());
    }

    if (config.calPrintCellHeight !== undefined) {
      const cellHeight = parseFloat(config.calPrintCellHeight);
      if (!isNaN(cellHeight) && cellHeight >= 1.5 && cellHeight <= 6) {
        props.setProperty('CAL_PRINT_CELL_HEIGHT', cellHeight.toFixed(1));
      }
    }

    // Inquilinos
    if (config.inquilinos !== undefined) {
      if (Array.isArray(config.inquilinos)) {
        props.setProperty('INQUILINOS', config.inquilinos.join(','));
      } else if (typeof config.inquilinos === 'string') {
        props.setProperty('INQUILINOS', config.inquilinos);
      }
    }

    // Textos de Ayuda
    if (config.ayudaTutoriales !== undefined) {
      // ScriptProperties tiene un límite de ~9KB por valor; 5000 chars es suficiente para tutoriales
      props.setProperty('AYUDA_TUTORIALES', (config.ayudaTutoriales || '').substring(0, 5000));
    }

    // Contadores de Caja (Arqueo de Efectivo): siempre 3 slots (Diego/Oscar/Aldo
    // por defecto). "General" no se guarda acá, el frontend lo agrega fijo.
    if (config.contadoresCaja !== undefined) {
      if (!Array.isArray(config.contadoresCaja)) {
        throw new Error('Contadores de caja debe ser una lista');
      }
      const DEFAULT_NOMBRES = ['Diego', 'Oscar', 'Aldo'];
      const contadoresSanitizados = DEFAULT_NOMBRES.map(function(nombreDefault, i) {
        const c = config.contadoresCaja[i];
        const nombre = (c && c.nombre) ? String(c.nombre).trim().slice(0, 20) : '';
        return {
          nombre: nombre || nombreDefault,
          activo: !!(c && c.activo)
        };
      });
      props.setProperty('CONTADORES_CAJA', JSON.stringify(contadoresSanitizados));
    }

    // Validar primero los parámetros logísticos para no guardar una parte de ellos si el resto falla.
    let pinModulosExtraValidado;
    if (config.pinModulosExtra !== undefined) {
      pinModulosExtraValidado = String(config.pinModulosExtra).trim();
      if (!/^\d{4}$/.test(pinModulosExtraValidado)) {
        throw new Error('El PIN de módulos extra debe tener exactamente 4 dígitos');
      }
    }
    let envasesVaciosValidados;
    if (config.envasesVacios !== undefined) {
      if (!Array.isArray(config.envasesVacios)) throw new Error('Envases debe ser una lista');
      if (config.envasesVacios.length === 0 || config.envasesVacios.length > 50) {
        throw new Error('Debe haber entre 1 y 50 tipos de envase.');
      }
      const idsEnvases = new Set();
      const envasesSanitizados = config.envasesVacios.map(function(envase) {
        const id = String(envase && envase.id || '').trim();
        const nombre = String(envase && envase.nombre || '').trim();
        const valor = Number(envase && envase.valor);
        if (!/^[A-Za-z0-9_-]{1,50}$/.test(id) || idsEnvases.has(id)) {
          throw new Error('Los IDs de envase deben usar letras, números, guion o guion bajo, y ser únicos.');
        }
        if (!nombre || nombre.length > 100) {
          throw new Error('Cada envase necesita un nombre de hasta 100 caracteres.');
        }
        if (!Number.isFinite(valor) || valor < 0) {
          throw new Error('El valor de cada envase debe ser un número mayor o igual a cero.');
        }
        idsEnvases.add(id);
        return { id: id, nombre: nombre, valor: valor };
      });
      envasesVaciosValidados = JSON.stringify(envasesSanitizados);
      if (envasesVaciosValidados.length > 8000) throw new Error('La configuración de envases excede el tamaño permitido.');
    }
    if (pinModulosExtraValidado !== undefined) props.setProperty('PIN_MODULOS_EXTRA', pinModulosExtraValidado);
    if (envasesVaciosValidados !== undefined) props.setProperty('ENVASES_VACIOS', envasesVaciosValidados);
    
    Logger.log('Configuración general guardada correctamente');
    
    return {
      success: true,
      mensaje: 'Configuración guardada correctamente'
    };
  } catch (error) {
    Logger.log('Error en guardarConfiguracionGeneral: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restablece la configuración a valores por defecto
 * @returns {Object} Resultado
 */
function restaurarConfiguracionPorDefecto() {
  try {
    const props = PropertiesService.getScriptProperties();

    // Eliminar todas las configuraciones personalizadas (pero mantener credenciales)
    const keysToKeep = [
      'SPREADSHEET_ID',
      'EMISOR_CUIT', 'EMISOR_RAZON_SOCIAL',
      'EMISOR_DOMICILIO', 'EMISOR_IIBB', 'EMISOR_FECHA_INICIO', 'EMISOR_CONDICION_IVA',
      'AFIP_ACCESS_TOKEN', 'AFIP_PUNTO_VENTA', 'AFIP_CUIT',
      'AFIP_CERT', 'AFIP_KEY',
      // El token de la API REST es una credencial: perderlo cortaría cualquier
      // integración externa en el momento de restablecer la configuración.
      'API_TOKEN'
    ];
    
    const allProperties = props.getProperties();
    for (let key in allProperties) {
      if (!keysToKeep.includes(key)) {
        props.deleteProperty(key);
      }
    }
    
    Logger.log('Configuración restaurada a valores por defecto');

    return {
      success: true,
      mensaje: 'Configuración restaurada a valores por defecto. Se mantuvieron las credenciales.'
    };
  } catch (error) {
    Logger.log('Error en restaurarConfiguracionPorDefecto: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// M-07: HEALTH CHECK — Verificación de integridad del sistema
// ============================================================================

/**
 * Verifica la integridad del sistema Sol & Verde.
 * Ejecuta 4 chequeos críticos y retorna un reporte detallado.
 * Expuesta al frontend para diagnóstico desde la UI de administración.
 *
 * @returns {Object} { success, timestamp, chequeos, resumen }
 */
function verificarIntegridadSistema() {
  const inicio = Date.now();
  const chequeos = [];

  // ── Chequeo 1: Todas las hojas requeridas existen ──────────────────────
  try {
    const ss = getSpreadsheet();
    const hojasRequeridas = Object.values(CONFIG.HOJAS);
    const hojasFaltantes = [];

    hojasRequeridas.forEach(nombre => {
      if (!ss.getSheetByName(nombre)) hojasFaltantes.push(nombre);
    });

    chequeos.push({
      nombre:  'HOJAS_EXISTENTES',
      estado:  hojasFaltantes.length === 0 ? 'OK' : 'ERROR',
      detalle: hojasFaltantes.length === 0
        ? 'Todas las hojas requeridas existen'
        : 'Hojas faltantes: ' + hojasFaltantes.join(', ')
    });
  } catch (e) {
    chequeos.push({ nombre: 'HOJAS_EXISTENTES', estado: 'ERROR', detalle: e.message });
  }

  // ── Chequeo 2: Saldos en hoja CLIENTES vs. recálculo desde MOVIMIENTOS ──
  try {
    const clientes = ClientesRepository.obtenerTodos();
    const saldosRecalculados = MovimientosRepository.recalcularTodosSaldos
      ? MovimientosRepository.recalcularTodosSaldos()
      : null;

    if (!saldosRecalculados) {
      chequeos.push({ nombre: 'SALDOS_COHERENTES', estado: 'SKIP', detalle: 'recalcularTodosSaldos no disponible' });
    } else {
      const inconsistentes = [];
      clientes.forEach(c => {
        const saldoCalc = saldosRecalculados[c.nombre] || 0;
        const diff = Math.abs((c.saldo || 0) - saldoCalc);
        if (diff > 0.01) {
          inconsistentes.push({ cliente: c.nombre, saldoHoja: c.saldo, saldoCalc, diff });
        }
      });
      chequeos.push({
        nombre:  'SALDOS_COHERENTES',
        estado:  inconsistentes.length === 0 ? 'OK' : 'ADVERTENCIA',
        detalle: inconsistentes.length === 0
          ? 'Todos los saldos son coherentes (' + clientes.length + ' clientes)'
          : inconsistentes.length + ' saldo(s) inconsistente(s): ' + JSON.stringify(inconsistentes.slice(0, 5))
      });
    }
  } catch (e) {
    chequeos.push({ nombre: 'SALDOS_COHERENTES', estado: 'ERROR', detalle: e.message });
  }

  // ── Chequeo 3: servicio de Drive disponible para el OCR gratuito ─────────
  // Reemplaza al chequeo de la API key de Claude: el sistema ya no usa
  // ninguna clave de IA. Lo que el OCR necesita es el servicio de Drive.
  try {
    const driveOk = (typeof Drive !== 'undefined' && Drive.Files && !!Drive.Files.create);
    chequeos.push({
      nombre:  'OCR_DRIVE',
      estado:  driveOk ? 'OK' : 'ADVERTENCIA',
      detalle: driveOk
        ? 'Servicio avanzado de Drive disponible: el OCR gratuito puede funcionar'
        : 'Servicio avanzado de Drive NO habilitado. Activalo en Servicios → Drive API v3'
    });
  } catch (e) {
    chequeos.push({ nombre: 'OCR_DRIVE', estado: 'ERROR', detalle: e.message });
  }

  const hayErrores = chequeos.some(c => c.estado === 'ERROR');
  const hayAdvertencias = chequeos.some(c => c.estado === 'ADVERTENCIA');

  return {
    success:   true,
    timestamp: new Date().toISOString(),
    duracionMs: Date.now() - inicio,
    estadoGeneral: hayErrores ? 'ERROR' : hayAdvertencias ? 'ADVERTENCIA' : 'OK',
    chequeos,
    resumen: chequeos.map(c => c.nombre + ': ' + c.estado).join(' | ')
  };
}

// ============================================================================
// DIAGNÓSTICO DE INTEGRACIÓN ARCA/AFIP - CUIT
// ============================================================================

/**
 * Ejecuta diagnóstico de consulta de CUIT con 3 tests
 * @param {string} cuit1 - CUIT que históricamente funcionaba
 * @param {string} cuit2 - CUIT que devuelve "SIN DATOS PÚBLICOS"
 * @param {string} cuit3 - CUIT inválido para test de error
 * @returns {Object} Resultados del diagnóstico
 */
function diagnosticarConsultaCUIT(cuit1, cuit2, cuit3) {
  const inicio = Date.now();
  const cuitTests = [cuit1, cuit2, cuit3].filter(function(c) { return c && c.trim(); });

  if (cuitTests.length === 0) {
    // Valores por defecto para testing
    cuitTests.push('20149543407');  // CUIT emisor
    cuitTests.push('20409378472');  // CUIT test (solo para referencia)
    cuitTests.push('00000000000');  // CUIT inválido
  }

  try {
    // Usar nuevas funciones afip*
    var resultados = cuitTests.map(function(cuit) {
      try {
        var resultado = afipConsultarCUIT(cuit);
        return {
          cuit: cuit,
          timestamp: new Date().toISOString(),
          exito: true,
          resultado: resultado
        };
      } catch (error) {
        return {
          cuit: cuit,
          timestamp: new Date().toISOString(),
          exito: false,
          error: error.message
        };
      }
    });

    var estadoConfig = afipVerificarConfiguracion();

    return {
      success: true,
      timestamp: new Date().toISOString(),
      duracionMs: Date.now() - inicio,
      cuitTests: cuitTests,
      resultados: resultados,
      estadoConfiguracion: estadoConfig,
      instrucciones: 'Revisá los logs de ejecución para ver respuestas raw de AFIP.'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      duracionMs: Date.now() - inicio,
      instrucciones: 'Error durante el diagnóstico. Verificá la configuración de AFIP.'
    };
  }
}

/**
 * Verifica el estado de la configuración de ARCA/AFIP
 * @returns {Object} Estado de la configuración
 */
function verificarConfiguracionARCA() {
  try {
    const estado = afipVerificarConfiguracion();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      configuracion: estado
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * DIAGNÓSTICO — ejecutar una vez desde el editor de Apps Script (▶ Run)
 * Muestra en Logger qué encuentra _leerConfiguracionEmisor
 */
function diagnosticarConfiguracion() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = _leerConfiguracionEmisor();

  Logger.log('=== DIAGNÓSTICO CONFIGURACIÓN EMISOR ===');
  Logger.log('razonSocial:       ' + cfg.razonSocial);
  Logger.log('cuit:              ' + cfg.cuit);
  Logger.log('domicilio:         ' + cfg.domicilio);
  Logger.log('condicionIVA:      ' + cfg.condicionIVA);
  Logger.log('ingBrutos:         ' + cfg.ingBrutos);
  Logger.log('logoUrl:           ' + cfg.logoUrl);

  // Listar todas las hojas
  Logger.log('--- Hojas en el Spreadsheet ---');
  ss.getSheets().forEach(function(h) {
    Logger.log('  · ' + h.getName() + ' (' + h.getLastRow() + ' filas)');
  });

  // Si existe hoja Configuracion, mostrar sus primeras filas
  var hc = ss.getSheetByName('Configuracion') || ss.getSheetByName('CONFIGURACION')
         || ss.getSheetByName('Config') || ss.getSheetByName('Sistema');
  if (hc) {
    Logger.log('--- Primeras 10 filas de: ' + hc.getName() + ' ---');
    var d = hc.getRange(1, 1, Math.min(10, hc.getLastRow()), Math.min(5, hc.getLastColumn())).getValues();
    d.forEach(function(f, i) { Logger.log('  Fila ' + (i+1) + ': ' + JSON.stringify(f)); });
  } else {
    Logger.log('⚠️ No se encontró ninguna hoja de Configuracion');
  }

  // AFIP_CONFIG
  try {
    Logger.log('--- AFIP_CONFIG ---');
    Logger.log(JSON.stringify(AFIP_CONFIG).substring(0, 300));
  } catch(e) { Logger.log('AFIP_CONFIG no disponible'); }
}

/**
 * DIAGNÓSTICO PROPERTIES — ejecutar UNA VEZ para ver todas las Script Properties
 * Muestra en Logger qué claves y valores hay guardados en PropertiesService
 */
function verMisProperties() {
  var p = PropertiesService.getScriptProperties().getProperties();
  Logger.log('=== TODAS LAS SCRIPT PROPERTIES ===');
  Object.keys(p).sort().forEach(function(k) {
    Logger.log('  [' + k + '] = "' + String(p[k]).substring(0,80) + '"');
  });
}
