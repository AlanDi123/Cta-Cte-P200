/**
 * ============================================================================
 * OCR GRATUITO — SISTEMA SOL & VERDE
 * ============================================================================
 * Lectura de imágenes SIN depender de ninguna IA ni API de pago.
 *
 * Motor del servidor: OCR de Google Drive. Convierte la imagen en un
 * documento de Google con reconocimiento de texto y lee el resultado. Usa el
 * mismo motor que Google Docs, no tiene costo y no necesita ninguna clave:
 * el servicio avanzado de Drive v3 ya estaba habilitado en appsscript.json.
 *
 * En el navegador corre un segundo motor independiente (Tesseract.js) que,
 * además del texto, entrega la POSICIÓN de cada palabra. Eso permite separar
 * las columnas del libro por geometría en lugar de adivinar por el orden de
 * lectura. Los dos motores se cruzan y lo que no coincide queda marcado.
 *
 * La precisión real no la da el OCR sino el padrón: aunque se lea
 * "G0NZALES", el sistema ya sabe que el cliente se llama "GONZALEZ JUAN".
 * ============================================================================
 */

const OcrService = {

  /** Tipos de imagen aceptados por el OCR de Drive. */
  TIPOS_ACEPTADOS: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],

  /**
   * Lee el texto de una imagen con el OCR de Drive.
   *
   * Crea un documento temporal, lo exporta como texto plano y lo borra. La
   * exportación va por UrlFetchApp en lugar de DocumentApp porque este
   * proyecto no tiene el permiso de documentos, y pedirlo obligaría al
   * usuario a volver a autorizar todo el sistema.
   *
   * @param {string} imageBase64 - Imagen en base64, con o sin prefijo data:
   * @param {string} [idioma='es'] - Código de idioma para el OCR
   * @returns {{success: boolean, texto: string, motor: string, ms: number, error?: string}}
   */
  leerConDrive: function(imageBase64, idioma) {
    const inicio = Date.now();
    let archivoId = null;

    try {
      const partes = this._separarBase64(imageBase64);
      if (!partes.datos) {
        return { success: false, texto: '', motor: 'drive', ms: 0, error: 'Imagen vacía o ilegible.' };
      }

      const blob = Utilities.newBlob(
        Utilities.base64Decode(partes.datos),
        partes.mimeType,
        'ocr_temporal'
      );

      const creado = Drive.Files.create(
        { name: 'SV_OCR_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
        blob,
        { ocrLanguage: idioma || 'es', fields: 'id' }
      );
      archivoId = creado.id;

      const respuesta = UrlFetchApp.fetch(
        'https://www.googleapis.com/drive/v3/files/' + archivoId + '/export?mimeType=text/plain',
        {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        }
      );

      if (respuesta.getResponseCode() !== 200) {
        throw new Error('No se pudo exportar el texto (HTTP ' + respuesta.getResponseCode() + ')');
      }

      // El exportador antepone un BOM que rompe la primera línea
      const texto = respuesta.getContentText('UTF-8').replace(/^﻿/, '');

      return {
        success: true,
        texto: texto,
        motor: 'drive',
        ms: Date.now() - inicio
      };

    } catch (error) {
      Logger.log('[OCR] Drive falló: ' + error.message);
      return {
        success: false,
        texto: '',
        motor: 'drive',
        ms: Date.now() - inicio,
        error: this._mensajeAmigable(error)
      };
    } finally {
      // El documento temporal se borra siempre, incluso si la exportación falló
      if (archivoId) {
        try {
          Drive.Files.remove(archivoId);
        } catch (e) {
          Logger.log('[OCR] Quedó sin borrar el documento temporal ' + archivoId + ': ' + e.message);
        }
      }
    }
  },

  /**
   * Interpreta el texto de un libro de cuenta corriente.
   *
   * Cada línea puede traer uno o varios pares nombre+monto. El libro tiene dos
   * columnas: COBRANZAS a la izquierda (son PAGOS, tipo HABER) y FIADO a la
   * derecha (tipo DEBE). Cuando una línea trae dos pares, el primero es
   * cobranza y el segundo fiado. Cuando trae uno solo no se puede saber la
   * columna a partir del texto, así que queda marcado para revisión en lugar
   * de inventar un tipo.
   *
   * @param {string} texto - Texto devuelto por un motor de OCR
   * @param {string} fecha - Fecha a asignar a los movimientos
   * @returns {{movimientos: Array<Object>, lineasIgnoradas: Array<string>}}
   */
  interpretarLibro: function(texto, fecha) {
    const movimientos = [];
    const lineasIgnoradas = [];
    const lineas = String(texto || '').split(/\r?\n/);

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (!linea) continue;

      if (this._esLineaDeTotales(linea)) {
        lineasIgnoradas.push(linea);
        continue;
      }

      const pares = this._extraerParesNombreMonto(linea);
      if (pares.length === 0) {
        lineasIgnoradas.push(linea);
        continue;
      }

      for (let p = 0; p < pares.length; p++) {
        let tipo, confianzaTipo;
        if (pares.length >= 2) {
          // Dos o más pares en la misma línea: el primero es la columna
          // izquierda (cobranza) y el resto la derecha (fiado)
          tipo = (p === 0) ? CONFIG.TIPOS_MOVIMIENTO.HABER : CONFIG.TIPOS_MOVIMIENTO.DEBE;
          confianzaTipo = 'media';
        } else {
          // Un solo par: el texto no dice de qué columna viene
          tipo = CONFIG.TIPOS_MOVIMIENTO.DEBE;
          confianzaTipo = 'baja';
        }

        movimientos.push({
          cliente: pares[p].nombre,
          clienteOriginal: pares[p].nombre,
          monto: pares[p].monto,
          tipo: tipo,
          confianzaTipo: confianzaTipo,
          fecha: fecha,
          obs: tipo === CONFIG.TIPOS_MOVIMIENTO.HABER ? 'Cobranza' : 'Fiado',
          lineaOrigen: linea,
          motor: 'drive'
        });
      }
    }

    return { movimientos: movimientos, lineasIgnoradas: lineasIgnoradas };
  },

  /**
   * Corrige los nombres leídos contra el padrón real de clientes.
   *
   * Es el paso que más precisión aporta: el OCR puede leer "G0NZALES" y el
   * padrón resuelve "GONZALEZ JUAN". Reutiliza la búsqueda difusa que ya
   * existe, con los pesos configurables de CONFIG.getFuzzy().
   *
   * @param {Array<Object>} movimientos - Movimientos interpretados
   * @returns {{validos: Array<Object>, conSugerencias: Array<Object>}}
   */
  corregirContraPadron: function(movimientos) {
    const validos = [];
    const conSugerencias = [];

    for (let i = 0; i < movimientos.length; i++) {
      const mov = movimientos[i];
      if (!mov.cliente || !(mov.monto > 0)) continue;

      const busqueda = ClientesRepository.buscarConSugerencias(normalizarString(mov.cliente));

      if (busqueda.exacto) {
        validos.push(Object.assign({}, mov, {
          cliente: busqueda.exacto.nombre,
          clienteValidado: true,
          confianzaNombre: 'alta'
        }));
      } else if (busqueda.sugerencias && busqueda.sugerencias.length > 0) {
        conSugerencias.push(Object.assign({}, mov, {
          sugerencias: busqueda.sugerencias.map(function(s) { return s.nombre; }),
          clienteValidado: false,
          confianzaNombre: 'media'
        }));
      } else {
        conSugerencias.push(Object.assign({}, mov, {
          sugerencias: [],
          clienteValidado: false,
          esNuevo: true,
          confianzaNombre: 'baja'
        }));
      }
    }

    return { validos: validos, conSugerencias: conSugerencias };
  },

  /**
   * Lee un comprobante de transferencia (captura de homebanking).
   *
   * Este caso es mucho más favorable que el libro manuscrito: es texto
   * renderizado en pantalla, nítido y alineado, así que el OCR libre lo lee
   * con buena precisión. Se buscan importe, fecha, banco y titular por
   * etiquetas y por formato.
   *
   * @param {string} texto - Texto devuelto por el OCR
   * @returns {Object} Campos detectados
   */
  interpretarComprobante: function(texto) {
    const plano = String(texto || '');
    const lineas = plano.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);

    const resultado = {
      monto: 0,
      fecha: '',
      banco: '',
      titular: '',
      cbu: '',
      cuit: '',
      referencia: '',
      camposDetectados: []
    };

    // ── Importe: se prefiere el que esté junto a una etiqueta de monto ──────
    const etiquetasMonto = /(importe|monto|total|transferiste|enviaste|monto\s+transferido)/i;
    let montoEtiquetado = 0;
    let montoMayor = 0;

    for (let i = 0; i < lineas.length; i++) {
      const montos = this._extraerMontos(lineas[i]);
      if (montos.length === 0) continue;
      const maxLinea = Math.max.apply(null, montos);
      if (maxLinea > montoMayor) montoMayor = maxLinea;
      if (etiquetasMonto.test(lineas[i]) && maxLinea > montoEtiquetado) {
        montoEtiquetado = maxLinea;
      }
    }
    resultado.monto = montoEtiquetado || montoMayor;
    if (resultado.monto > 0) {
      resultado.camposDetectados.push(montoEtiquetado ? 'monto (por etiqueta)' : 'monto (el mayor de la imagen)');
    }

    // ── Fecha: dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd ─────────────────────────
    const mFecha = plano.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/) ||
                   plano.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (mFecha) {
      if (mFecha[1].length === 4) {
        resultado.fecha = mFecha[1] + '-' + mFecha[2] + '-' + mFecha[3];
      } else {
        const anio = mFecha[3].length === 2 ? '20' + mFecha[3] : mFecha[3];
        resultado.fecha = anio + '-' + this._dosDigitos(mFecha[2]) + '-' + this._dosDigitos(mFecha[1]);
      }
      resultado.camposDetectados.push('fecha');
    }

    // ── Banco: por nombre conocido ─────────────────────────────────────────
    const bancos = ['GALICIA', 'SANTANDER', 'BBVA', 'MACRO', 'NACION', 'PROVINCIA',
                    'CIUDAD', 'CREDICOOP', 'PATAGONIA', 'SUPERVIELLE', 'HSBC', 'ICBC',
                    'COMAFI', 'HIPOTECARIO', 'BRUBANK', 'UALA', 'MERCADO PAGO',
                    'NARANJA X', 'PERSONAL PAY', 'LEMON', 'BELO', 'PREX'];
    const planoUpper = normalizarString(plano);
    for (let b = 0; b < bancos.length; b++) {
      if (planoUpper.indexOf(bancos[b]) > -1) {
        resultado.banco = bancos[b];
        resultado.camposDetectados.push('banco');
        break;
      }
    }

    // ── CBU / CVU (22 dígitos) y CUIT (11 dígitos) ─────────────────────────
    //
    // Se busca línea por línea y se quitan solo los separadores DENTRO de la
    // línea. No sirve compactar todo el texto de una vez: los dígitos del
    // CUIT terminarían pegados a los del CBU. Y tampoco sirve `\b\d{22}\b`:
    // en "CBU 0070..." no hay frontera de palabra entre la «U» y el «0»,
    // porque ambos son caracteres de palabra.
    for (let i = 0; i < lineas.length && !resultado.cbu; i++) {
      const compacta = lineas[i].replace(/[\s.\-]/g, '');
      const grupos = compacta.match(/\d+/g) || [];
      for (let g = 0; g < grupos.length; g++) {
        if (grupos[g].length === 22) {
          resultado.cbu = grupos[g];
          resultado.camposDetectados.push('cbu');
          break;
        }
      }
    }
    const mCuit = plano.match(/\b(\d{2})[\-.\s]?(\d{8})[\-.\s]?(\d)\b/);
    if (mCuit) {
      resultado.cuit = mCuit[1] + '-' + mCuit[2] + '-' + mCuit[3];
      resultado.camposDetectados.push('cuit');
    }

    // ── Titular: línea siguiente a una etiqueta de destinatario ────────────
    const etiquetasTitular = /(destinatario|destino|titular|para|benefici|recibe|a nombre de)/i;
    for (let i = 0; i < lineas.length; i++) {
      if (!etiquetasTitular.test(lineas[i])) continue;
      // Puede venir en la misma línea tras dos puntos, o en la siguiente
      const mismaLinea = lineas[i].split(/[:\-–]\s*/).slice(1).join(' ').trim();
      let candidato = mismaLinea;
      if (!candidato || candidato.length < 3) {
        candidato = (lineas[i + 1] || '').trim();
      }
      candidato = candidato.replace(/\d{6,}/g, '').replace(/\s{2,}/g, ' ').trim();
      if (candidato.length >= 3 && /[A-Za-zÁÉÍÓÚÑ]/.test(candidato)) {
        resultado.titular = normalizarString(candidato);
        resultado.camposDetectados.push('titular');
        break;
      }
    }

    // ── Referencia / número de operación ───────────────────────────────────
    const mRef = plano.match(/(?:operaci[oó]n|comprobante|referencia|n[uú]mero|nro\.?|id)\s*[:#]?\s*([A-Za-z0-9\-]{4,24})/i);
    if (mRef) {
      resultado.referencia = mRef[1];
      resultado.camposDetectados.push('referencia');
    }

    return resultado;
  },

  /**
   * Interpreta una captura con VARIAS transferencias (listado de homebanking
   * o extracto). Cada fila suele traer nombre y monto, y a veces fecha.
   *
   * También es terreno favorable para el OCR libre: es texto de pantalla.
   *
   * @param {string} texto - Texto devuelto por el OCR
   * @returns {{fecha: string, items: Array<{nombre: string, monto: number, banco: string}>}}
   */
  interpretarExtracto: function(texto) {
    const plano = String(texto || '');
    const lineas = plano.split(/\r?\n/);
    const items = [];

    // Banco y fecha del documento: se buscan una vez, para toda la captura
    const general = this.interpretarComprobante(plano);

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (!linea || this._esLineaDeTotales(linea)) continue;
      // Las líneas de saldo o de encabezado de cuenta no son transferencias
      if (/saldo|cbu|alias|cuenta n|disponible/i.test(linea)) continue;

      const pares = this._extraerParesNombreMonto(linea);
      for (let p = 0; p < pares.length; p++) {
        // Un nombre debe tener al menos dos letras seguidas y no ser solo fecha
        if (!/[A-ZÑ]{2}/.test(pares[p].nombre)) continue;
        items.push({
          nombre: pares[p].nombre,
          monto:  pares[p].monto,
          banco:  general.banco || ''
        });
      }
    }

    return { fecha: general.fecha, items: items };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUXILIARES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Separa el prefijo data: del contenido base64 y detecta el tipo.
   * @param {string} imageBase64
   * @returns {{datos: string, mimeType: string}}
   */
  _separarBase64: function(imageBase64) {
    const crudo = String(imageBase64 || '');
    let mimeType = 'image/jpeg';
    let datos = crudo;

    const m = crudo.match(/^data:([a-zA-Z0-9\/+.\-]+);base64,/);
    if (m) {
      mimeType = m[1].toLowerCase();
      datos = crudo.substring(m[0].length);
    } else if (crudo.indexOf(',') > -1 && crudo.indexOf('data:') === 0) {
      datos = crudo.split(',')[1] || '';
    }

    if (this.TIPOS_ACEPTADOS.indexOf(mimeType) === -1) {
      mimeType = 'image/jpeg';
    }

    return { datos: datos.replace(/\s/g, ''), mimeType: mimeType };
  },

  /**
   * Convierte un texto de monto en formato argentino a número.
   * En Argentina el punto separa miles y la coma los decimales.
   * @param {string} texto
   * @returns {number} 0 si no es un monto válido
   */
  _parsearMonto: function(texto) {
    let limpio = String(texto || '').replace(/[$\s]/g, '');
    if (!limpio) return 0;

    const tieneComa = limpio.indexOf(',') > -1;
    const tienePunto = limpio.indexOf('.') > -1;

    if (tieneComa && tienePunto) {
      // 1.500,50 → el punto es de miles
      limpio = limpio.replace(/\./g, '').replace(',', '.');
    } else if (tieneComa) {
      // 1500,50 → la coma es decimal
      limpio = limpio.replace(',', '.');
    } else if (tienePunto) {
      const partes = limpio.split('.');
      const ultima = partes[partes.length - 1];
      // 15.000 o 1.500.000 son miles; 1500.50 es decimal
      if (partes.length === 2 && ultima.length <= 2) {
        // se deja como decimal
      } else {
        limpio = limpio.replace(/\./g, '');
      }
    }

    const n = parseFloat(limpio);
    return (isNaN(n) || n <= 0) ? 0 : Math.round(n * 100) / 100;
  },

  /**
   * Extrae todos los montos plausibles de una línea.
   * @param {string} linea
   * @returns {Array<number>}
   */
  _extraerMontos: function(linea) {
    const montos = [];
    const patron = /\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$?\s*\d{3,9}(?:[.,]\d{1,2})?/g;
    const encontrados = String(linea || '').match(patron) || [];
    for (let i = 0; i < encontrados.length; i++) {
      const n = this._parsearMonto(encontrados[i]);
      if (n > 0) montos.push(n);
    }
    return montos;
  },

  /**
   * Divide una línea en pares nombre+monto.
   * El nombre es el texto que precede a cada monto.
   * @param {string} linea
   * @returns {Array<{nombre: string, monto: number}>}
   */
  _extraerParesNombreMonto: function(linea) {
    const pares = [];
    const patron = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\s]{1,40}?)\s*[:\-]?\s*(\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$?\s*\d{3,9}(?:[.,]\d{1,2})?)/g;

    let m;
    while ((m = patron.exec(String(linea || ''))) !== null) {
      const nombre = normalizarString(m[1]);
      const monto = this._parsearMonto(m[2]);
      // Un nombre de una sola letra casi siempre es basura del OCR
      if (nombre.replace(/[^A-ZÑ]/g, '').length >= 2 && monto > 0) {
        pares.push({ nombre: nombre, monto: monto });
      }
    }
    return pares;
  },

  /**
   * True si la línea es un total, subtotal o encabezado, que no es un movimiento.
   * @param {string} linea
   * @returns {boolean}
   */
  _esLineaDeTotales: function(linea) {
    const norm = normalizarString(linea);
    const descartables = ['TOTAL', 'TOTALES', 'SUBTOTAL', 'SUMA', 'SALDO', 'COBRANZAS',
                          'COBRANZA', 'FIADO', 'FIADOS', 'FECHA', 'CLIENTE', 'DETALLE',
                          'ARRASTRE', 'TRANSPORTE', 'PAGINA', 'HOJA'];
    for (let i = 0; i < descartables.length; i++) {
      // Encabezado o total: la palabra sola, o al principio de la línea
      if (norm === descartables[i] || norm.indexOf(descartables[i] + ' ') === 0) return true;
    }
    return false;
  },

  /** Rellena un número a dos dígitos. */
  _dosDigitos: function(n) {
    return String(n).length === 1 ? '0' + n : String(n);
  },

  /**
   * Traduce fallos técnicos del OCR a algo que el usuario pueda accionar.
   * @param {Error} error
   * @returns {string}
   */
  _mensajeAmigable: function(error) {
    const msg = String((error && error.message) || error || '').toLowerCase();

    if (msg.indexOf('drive') > -1 && msg.indexOf('not defined') > -1) {
      return 'El servicio avanzado de Drive no está habilitado en el proyecto de Apps Script. ' +
             'Hay que activarlo en Servicios → Drive API v3.';
    }
    if (msg.indexOf('too large') > -1 || msg.indexOf('request too large') > -1) {
      return 'La imagen es demasiado grande para procesarla. Sacá la foto con menos resolución ' +
             'o recortá solo la parte del libro que interesa.';
    }
    if (msg.indexOf('quota') > -1 || msg.indexOf('limit') > -1) {
      return 'Se alcanzó el límite diario de Google para este tipo de operación. ' +
             'Volvé a intentar más tarde.';
    }
    if (msg.indexOf('timed out') > -1 || msg.indexOf('timeout') > -1) {
      return 'El reconocimiento tardó demasiado. Probá con una imagen más chica.';
    }
    if (msg.indexOf('permission') > -1 || msg.indexOf('authoriz') > -1) {
      return 'Faltan permisos de Drive. Volvé a autorizar el sistema desde el editor de Apps Script.';
    }
    return 'No se pudo leer la imagen: ' + ((error && error.message) || error);
  }
};


// ============================================================================
// FUNCIONES EXPUESTAS AL FRONTEND
// ============================================================================

/**
 * Lee una imagen guardada en la caché temporal y devuelve su texto crudo.
 * El navegador la usa para cruzar su propio motor con el del servidor.
 *
 * @param {string} token - Token devuelto por guardarImagenTemporal
 * @param {string} [idioma] - Idioma del OCR (por defecto el configurado)
 * @returns {{success: boolean, texto?: string, ms?: number, error?: string}}
 */
function ocrLeerTextoDeImagen(token, idioma) {
  try {
    const imagen = ImageCache.recuperar(token);
    if (!imagen) {
      return { success: false, error: 'La imagen expiró. Volvé a cargarla.' };
    }
    const cfg = CONFIG.getOcr();
    const res = OcrService.leerConDrive(imagen, idioma || cfg.IDIOMA);
    return res.success
      ? { success: true, texto: res.texto, ms: res.ms }
      : { success: false, error: res.error };
  } catch (error) {
    Logger.log('Error en ocrLeerTextoDeImagen: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Interpreta como libro de cuenta corriente un texto ya reconocido.
 *
 * Se expone por separado del reconocimiento para que el navegador pueda
 * mandar lo que leyó su propio motor y aprovechar la misma interpretación y
 * la misma corrección contra el padrón.
 *
 * @param {string} texto - Texto reconocido
 * @param {string} fecha - Fecha a asignar
 * @returns {Object} Movimientos validados y con sugerencias
 */
function ocrInterpretarTextoLibro(texto, fecha) {
  try {
    const fechaUso = fecha || obtenerFechaHoy();
    const interpretado = OcrService.interpretarLibro(texto, fechaUso);
    const corregido = OcrService.corregirContraPadron(interpretado.movimientos);

    return {
      success: true,
      movimientosValidos: serializarParaWeb(corregido.validos),
      movimientosConSugerencias: serializarParaWeb(corregido.conSugerencias),
      lineasIgnoradas: interpretado.lineasIgnoradas,
      totalDetectado: interpretado.movimientos.length
    };
  } catch (error) {
    Logger.log('Error en ocrInterpretarTextoLibro: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Corrige contra el padrón una lista de movimientos armada en el navegador
 * (por ejemplo, con las posiciones de palabra que da Tesseract).
 *
 * @param {Array<Object>} movimientos - [{cliente, monto, tipo}]
 * @param {string} fecha
 * @returns {Object} Movimientos validados y con sugerencias
 */
function ocrCorregirMovimientos(movimientos, fecha) {
  try {
    if (!Array.isArray(movimientos)) {
      return { success: false, error: 'Se esperaba una lista de movimientos.' };
    }
    const fechaUso = fecha || obtenerFechaHoy();
    const normalizados = movimientos.map(function(m) {
      return {
        cliente: String(m.cliente || '').trim(),
        clienteOriginal: String(m.clienteOriginal || m.cliente || '').trim(),
        monto: Number(m.monto) || 0,
        tipo: (m.tipo === CONFIG.TIPOS_MOVIMIENTO.HABER)
          ? CONFIG.TIPOS_MOVIMIENTO.HABER
          : CONFIG.TIPOS_MOVIMIENTO.DEBE,
        confianzaTipo: m.confianzaTipo || 'media',
        confianzaOcr: m.confianzaOcr,
        fecha: fechaUso,
        obs: m.obs || ((m.tipo === CONFIG.TIPOS_MOVIMIENTO.HABER) ? 'Cobranza' : 'Fiado'),
        motor: m.motor || 'navegador'
      };
    });

    const corregido = OcrService.corregirContraPadron(normalizados);
    return {
      success: true,
      movimientosValidos: serializarParaWeb(corregido.validos),
      movimientosConSugerencias: serializarParaWeb(corregido.conSugerencias),
      totalDetectado: normalizados.length
    };
  } catch (error) {
    Logger.log('Error en ocrCorregirMovimientos: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Banco de pruebas del OCR.
 *
 * Devuelve el texto crudo del motor del servidor y la interpretación completa,
 * para comparar lado a lado con lo que leyó el motor del navegador y ajustar
 * los umbrales con libros reales. No guarda nada.
 *
 * @param {string} token - Token de la imagen en caché
 * @param {string} [fecha]
 * @returns {Object} Diagnóstico detallado
 */
function ocrDiagnosticar(token, fecha) {
  try {
    const imagen = ImageCache.recuperar(token);
    if (!imagen) {
      return { success: false, error: 'La imagen expiró. Volvé a cargarla.' };
    }

    const cfg = CONFIG.getOcr();
    const lectura = OcrService.leerConDrive(imagen, cfg.IDIOMA);
    if (!lectura.success) {
      return { success: false, error: lectura.error, motor: 'drive' };
    }

    const fechaUso = fecha || obtenerFechaHoy();
    const interpretado = OcrService.interpretarLibro(lectura.texto, fechaUso);
    const corregido = OcrService.corregirContraPadron(interpretado.movimientos);

    return {
      success: true,
      motor: 'drive',
      ms: lectura.ms,
      textoCrudo: lectura.texto,
      lineasTotales: String(lectura.texto || '').split(/\r?\n/).filter(function(l) { return l.trim(); }).length,
      lineasIgnoradas: interpretado.lineasIgnoradas,
      movimientos: serializarParaWeb(interpretado.movimientos),
      resumen: {
        detectados: interpretado.movimientos.length,
        reconocidosEnPadron: corregido.validos.length,
        conSugerencias: corregido.conSugerencias.filter(function(m) { return !m.esNuevo; }).length,
        sinCoincidencia: corregido.conSugerencias.filter(function(m) { return m.esNuevo; }).length
      },
      configuracion: cfg
    };
  } catch (error) {
    Logger.log('Error en ocrDiagnosticar: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lee un comprobante de transferencia con OCR gratuito.
 * Reemplaza el escaneo que antes dependía de Claude.
 *
 * @param {string} imageBase64 - Imagen en base64
 * @returns {Object} Campos detectados del comprobante
 */
function ocrLeerComprobante(imageBase64) {
  try {
    const cfg = CONFIG.getOcr();
    const lectura = OcrService.leerConDrive(imageBase64, cfg.IDIOMA);
    if (!lectura.success) {
      return { success: false, error: lectura.error };
    }

    const datos = OcrService.interpretarComprobante(lectura.texto);

    // Si se detectó un titular, se intenta casar con el padrón
    let clienteSugerido = '';
    let sugerencias = [];
    if (datos.titular) {
      const busqueda = ClientesRepository.buscarConSugerencias(normalizarString(datos.titular));
      if (busqueda.exacto) {
        clienteSugerido = busqueda.exacto.nombre;
      } else if (busqueda.sugerencias && busqueda.sugerencias.length > 0) {
        sugerencias = busqueda.sugerencias.map(function(s) { return s.nombre; });
      }
    }

    return {
      success: true,
      transferencia: {
        fecha:   datos.fecha,
        monto:   datos.monto,
        banco:   datos.banco,
        cliente: clienteSugerido || datos.titular,
        cuit:    datos.cuit,
        cbu:     datos.cbu,
        referencia: datos.referencia
      },
      sugerenciasCliente: sugerencias,
      camposDetectados: datos.camposDetectados,
      textoCrudo: lectura.texto,
      ms: lectura.ms,
      // El usuario tiene que confirmar: el OCR libre no es infalible
      requiereRevision: !datos.monto || !datos.fecha || !clienteSugerido
    };
  } catch (error) {
    Logger.log('Error en ocrLeerComprobante: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Palabras para alimentar el diccionario del motor del navegador.
 *
 * Sembrar Tesseract con los nombres REALES del padrón sube mucho el acierto:
 * el motor deja de proponer cualquier cadena y se inclina por las que existen.
 *
 * @returns {{success: boolean, palabras: Array<string>}}
 */
function ocrObtenerPalabrasDelPadron() {
  try {
    const clientes = ClientesRepository.obtenerTodos();
    const palabras = {};

    for (let i = 0; i < clientes.length; i++) {
      const nombre = String(clientes[i].nombre || '').trim();
      if (!nombre) continue;
      palabras[nombre] = true;
      // También cada palabra suelta: los libros rara vez traen el nombre completo
      const partes = nombre.split(/\s+/);
      for (let p = 0; p < partes.length; p++) {
        if (partes[p].length >= 3) palabras[partes[p]] = true;
      }
    }

    return { success: true, palabras: Object.keys(palabras) };
  } catch (error) {
    Logger.log('Error en ocrObtenerPalabrasDelPadron: ' + error.message);
    return { success: false, palabras: [], error: error.message };
  }
}


// ============================================================================
// CACHE TEMPORAL DE IMAGENES
//
// Movido textualmente desde el antiguo claude.gs: funcionaba bien y no tenia
// nada que ver con la IA. Trocea la imagen porque CacheService admite ~100 KB
// por valor, y evita el limite de tamanio de parametros de google.script.run.
// ============================================================================

// Cache temporal para imagenes (evita limite de parametros en google.script.run)
const ImageCache = {
  /**
   * Guarda una imagen temporalmente
   * @param {string} imageBase64 - Imagen en base64
   * @returns {string} Token para recuperar la imagen
   */
  guardar: function(imageBase64) {
    const cache = CacheService.getScriptCache();
    const token = 'VR_' + Utilities.getUuid();

    // Guardar en chunks si es muy grande
    const maxChunkSize = 90000; // Limite de CacheService es ~100KB por valor
    const chunks = [];

    for (let i = 0; i < imageBase64.length; i += maxChunkSize) {
      chunks.push(imageBase64.substring(i, i + maxChunkSize));
    }

    // Guardar metadata
    cache.put(token + '_meta', JSON.stringify({ chunks: chunks.length }), 300);

    // Guardar chunks
    for (let i = 0; i < chunks.length; i++) {
      cache.put(token + '_' + i, chunks[i], 300);
    }

    return token;
  },

  /**
   * Recupera una imagen
   * @param {string} token - Token de la imagen
   * @returns {string|null} Imagen en base64 o null
   */
  recuperar: function(token) {
    const cache = CacheService.getScriptCache();

    // Obtener metadata
    const metaStr = cache.get(token + '_meta');
    if (!metaStr) return null;

    const meta = JSON.parse(metaStr);

    // Reconstruir imagen
    let imageBase64 = '';
    for (let i = 0; i < meta.chunks; i++) {
      const chunk = cache.get(token + '_' + i);
      if (!chunk) return null;
      imageBase64 += chunk;
    }

    return imageBase64;
  },

  /**
   * Elimina una imagen del cache
   * @param {string} token - Token de la imagen
   */
  eliminar: function(token) {
    const cache = CacheService.getScriptCache();

    const metaStr = cache.get(token + '_meta');
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      for (let i = 0; i < meta.chunks; i++) {
        cache.remove(token + '_' + i);
      }
      cache.remove(token + '_meta');
    }
  }
};
