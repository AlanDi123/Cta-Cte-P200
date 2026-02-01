/**
 * ============================================================================
 * SERVICIO CLAUDE AI - SISTEMA SOL & VERDE
 * ============================================================================
 * Integracion con Claude AI para Visual Reasoning
 * Analisis de imagenes de libros contables
 * ============================================================================
 */

const ClaudeService = {
  /**
   * Obtiene la API Key de Claude desde las propiedades del script
   * @returns {string|null} API Key o null
   */
  getApiKey: function() {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty('CLAUDE_API_KEY');
  },

  /**
   * Guarda la API Key de Claude
   * @param {string} apiKey - API Key
   */
  setApiKey: function(apiKey) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('CLAUDE_API_KEY', apiKey);
  },

  /**
   * Verifica si la API Key esta configurada
   * @returns {boolean} True si esta configurada
   */
  tieneApiKey: function() {
    const key = this.getApiKey();
    return key && key.length > 0;
  },

  /**
   * Analiza una imagen de libro contable con Claude Vision
   * @param {string} imageBase64 - Imagen en base64
   * @param {string} fecha - Fecha del dia (opcional)
   * @returns {Object} Movimientos extraidos
   */
  analizarImagen: function(imageBase64, fecha) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('API Key de Claude no configurada. Ve a Configuracion para agregarla.');
    }

    // Limpiar base64 si tiene prefijo
    let base64Limpio = imageBase64;
    if (imageBase64.includes(',')) {
      base64Limpio = imageBase64.split(',')[1];
    }

    // Detectar tipo de imagen
    let mediaType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) {
      mediaType = 'image/png';
    } else if (imageBase64.includes('data:image/gif')) {
      mediaType = 'image/gif';
    } else if (imageBase64.includes('data:image/webp')) {
      mediaType = 'image/webp';
    }

    const fechaHoy = fecha || obtenerFechaHoy();

    // Construir el prompt
    const prompt = `Analiza esta imagen de un libro contable de cuenta corriente.

La imagen muestra una hoja con dos columnas:
- COBRANZAS (izquierda): Son PAGOS de clientes - tipo "HABER" - disminuyen el saldo del cliente
- FIADO (derecha): Son FIADOS a clientes - tipo "DEBE" - aumentan el saldo del cliente

IMPORTANTE:
- Extrae TODOS los nombres y montos que puedas leer
- Los nombres pueden estar escritos a mano, intenta leerlos lo mejor posible
- Los montos son numeros, pueden tener puntos como separadores de miles
- Ignora totales o sumas parciales
- La fecha para todos los movimientos es: ${fechaHoy}

Responde UNICAMENTE con un JSON valido con esta estructura exacta:
{
  "movimientos": [
    {
      "cliente": "NOMBRE DEL CLIENTE EN MAYUSCULAS",
      "tipo": "DEBE o HABER",
      "monto": 12345,
      "obs": "Cobranza" o "Fiado"
    }
  ],
  "observaciones": "Cualquier nota sobre la lectura"
}

Si no puedes leer algun nombre o monto, omitelo.
NO incluyas texto adicional, SOLO el JSON.`;

    // Construir payload para Claude API
    const payload = {
      model: CONFIG.CLAUDE.MODEL,
      max_tokens: CONFIG.CLAUDE.MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Limpio
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    };

    // Llamar a la API de Claude
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': CONFIG.CLAUDE.VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(CONFIG.CLAUDE.API_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (responseCode !== 200) {
        Logger.log('Error de Claude API: ' + responseCode + ' - ' + responseText);

        if (responseCode === 401) {
          throw new Error('API Key invalida. Verifica la configuracion.');
        } else if (responseCode === 429) {
          throw new Error('Limite de solicitudes excedido. Intenta en unos minutos.');
        } else {
          throw new Error('Error al conectar con Claude: ' + responseCode);
        }
      }

      // Parsear respuesta
      const respuestaJson = JSON.parse(responseText);

      if (!respuestaJson.content || !respuestaJson.content[0]) {
        throw new Error('Respuesta de Claude vacia o invalida');
      }

      const contenido = respuestaJson.content[0].text;

      // Extraer JSON de la respuesta
      const resultado = this.extraerJsonDeRespuesta(contenido);

      // Agregar fecha a todos los movimientos
      if (resultado.movimientos) {
        resultado.movimientos = resultado.movimientos.map(mov => ({
          ...mov,
          fecha: fechaHoy,
          monto: typeof mov.monto === 'string' ? parseFloat(mov.monto.replace(/\./g, '').replace(',', '.')) : mov.monto
        }));
      }

      return resultado;

    } catch (error) {
      Logger.log('Error en ClaudeService.analizarImagen: ' + error.message);
      throw error;
    }
  },

  /**
   * Extrae JSON valido de una respuesta de texto
   * @param {string} texto - Texto de respuesta
   * @returns {Object} JSON parseado
   */
  extraerJsonDeRespuesta: function(texto) {
    // Intentar parsear directamente
    try {
      return JSON.parse(texto);
    } catch (e) {
      // Buscar JSON en el texto
    }

    // Buscar patron de JSON
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Intentar limpiar
      }
    }

    // Intentar limpiar caracteres problematicos
    let limpio = texto
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      return JSON.parse(limpio);
    } catch (e) {
      Logger.log('No se pudo parsear JSON de Claude: ' + texto.substring(0, 500));
      throw new Error('No se pudo interpretar la respuesta de Claude. Intenta con otra imagen.');
    }
  },

  /**
   * Valida los movimientos extraidos contra la lista de clientes
   * @param {Array} movimientos - Movimientos extraidos
   * @returns {Object} {validos: Array, sugerencias: Array}
   */
  validarMovimientos: function(movimientos) {
    const resultado = {
      validos: [],
      conSugerencias: []
    };

    for (const mov of movimientos) {
      if (!mov.cliente || !mov.monto) continue;

      const clienteNorm = normalizarString(mov.cliente);
      const busqueda = ClientesRepository.buscarConSugerencias(clienteNorm);

      if (busqueda.exacto) {
        // Cliente encontrado exactamente
        resultado.validos.push({
          ...mov,
          cliente: busqueda.exacto.nombre,
          clienteValidado: true
        });
      } else if (busqueda.sugerencias.length > 0) {
        // Hay sugerencias
        resultado.conSugerencias.push({
          ...mov,
          clienteOriginal: mov.cliente,
          sugerencias: busqueda.sugerencias.map(s => s.nombre),
          clienteValidado: false
        });
      } else {
        // Sin sugerencias - cliente nuevo?
        resultado.conSugerencias.push({
          ...mov,
          clienteOriginal: mov.cliente,
          sugerencias: [],
          clienteValidado: false,
          esNuevo: true
        });
      }
    }

    return resultado;
  }
};

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
