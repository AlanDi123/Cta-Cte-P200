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
    // Protege secrets: nunca loguear ni exponer la API Key
    if (key && key.length > 0) {
      // Nunca loguear ni devolver la clave
      return true;
    }
    return false;
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

    // Validación de CONFIG.CLAUDE antes de construir payload
    const claudeConfig = (CONFIG && CONFIG.CLAUDE) ? CONFIG.CLAUDE : null;
    if (!claudeConfig || !claudeConfig.MODEL || !claudeConfig.API_URL || !claudeConfig.VERSION || !claudeConfig.MAX_TOKENS) {
      throw new Error(
        'Configuración de Claude AI incompleta o ausente en config.gs. ' +
        'Verificá que CONFIG.CLAUDE tenga: MODEL, API_URL, MAX_TOKENS y VERSION.'
      );
    }
    const claudeModel    = claudeConfig.MODEL;
    const claudeMaxTokens = claudeConfig.MAX_TOKENS;
    const claudeVersion  = claudeConfig.VERSION;
    const claudeApiUrl   = claudeConfig.API_URL;
    // FIN BLOQUE NUEVO (completo)

    // Construir el prompt optimizado para español/Argentina
    const prompt = `Analiza esta imagen de un libro contable argentino de cuenta corriente.

CONTEXTO:
- Libro contable escrito a mano en español (Argentina)
- Los nombres son APELLIDOS y/o NOMBRES en español
- Acentos pueden estar omitidos en la escritura a mano
- Apellidos argentinos comunes: GONZALEZ, RODRIGUEZ, MARTINEZ, LOPEZ, GARCIA, FERNANDEZ, PEREZ, SANCHEZ, ROMERO, DIAZ, GUTIERREZ, FLORES, TORRES, ALVAREZ, RUIZ, RAMIREZ, MORALES, JIMENEZ, ORTIZ, CASTRO
- Nombres comunes: JUAN, JOSE, MARIA, CARLOS, LUIS, ANA, JORGE, PEDRO, MIGUEL, FERNANDO, ROBERTO, DANIEL, RICARDO, ANDRES, PABLO, ANTONIO, SERGIO, MARCELO, OSCAR, EDUARDO
- Particulas frecuentes: DE, DEL, LA, LOS, DE LA, DE LOS

FORMATO DE MONTOS:
- PUNTO como separador de miles (15.000 = quince mil pesos)
- COMA como separador decimal (raro en libros contables de efectivo)
- Ejemplos: 5.000, 12.500, 150.000, 45.000

COLUMNAS DEL LIBRO:
- COBRANZAS (izquierda): Son PAGOS de clientes - tipo "HABER" - el cliente nos paga
- FIADO (derecha): Son FIADOS a clientes - tipo "DEBE" - le damos mercaderia a cuenta

INSTRUCCIONES:
1. Lee cada nombre con cuidado, caracter por caracter
2. Normaliza acentos: MARTÍNEZ -> MARTINEZ, GARCÍA -> GARCIA
3. Convierte todo a MAYUSCULAS SIN ACENTOS
4. Los montos siempre deben ser numeros enteros positivos
5. Ignora lineas de totales, subtotales o sumas
6. Fecha para todos: ${fechaHoy}

ERRORES COMUNES DE OCR A CORREGIR:
- 0 (cero) vs O (letra)
- 1 (uno) vs I (i mayuscula) vs L (ele)
- 5 vs S
- 8 vs B
- 2 vs Z

Responde SOLO con JSON valido (sin markdown ni explicaciones):
{
  "movimientos": [
    {
      "cliente": "APELLIDO NOMBRE",
      "tipo": "DEBE",
      "monto": 15000,
      "obs": "Fiado"
    },
    {
      "cliente": "APELLIDO",
      "tipo": "HABER",
      "monto": 5000,
      "obs": "Cobranza"
    }
  ],
  "observaciones": "notas sobre nombres dificiles de leer"
}`;

    // Construir payload para Claude API
    const payload = {
      model: claudeModel,        // antes: CONFIG.CLAUDE.MODEL
      max_tokens: claudeMaxTokens, // timeout mejorado
      stop: ["\n"], // Mejora timeout: detiene en salto de línea
      temperature: 0.2,
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
        'anthropic-version': claudeVersion  // antes: CONFIG.CLAUDE.VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      var response;
      var responseCode;
      var responseText;
      var intentoClaude = 0;
      var maxClaude = 2;
      while (intentoClaude < maxClaude) {
        response = UrlFetchApp.fetch(claudeApiUrl, options);
        responseCode = response.getResponseCode();
        responseText = response.getContentText();
        if (responseCode === 429 && intentoClaude < maxClaude - 1) {
          Utilities.sleep(5000);
          intentoClaude++;
          continue;
        }
        break;
      }

      if (responseCode !== 200) {
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

      // Agregar fecha y normalizar montos (tipos seguros)
      if (resultado.movimientos && Array.isArray(resultado.movimientos)) {
        resultado.movimientos = resultado.movimientos.map(mov => {
          var m = mov.monto;
          if (typeof m === 'string') {
            m = parseFloat(String(m).replace(/\./g, '').replace(',', '.')) || 0;
          } else {
            m = parseFloat(m) || 0;
          }
          return {
            ...mov,
            cliente: String(mov.cliente || '').trim().toUpperCase(),
            tipo: String(mov.tipo || '').trim().toUpperCase(),
            fecha: fechaHoy,
            monto: m
          };
        }).filter(mov => mov.cliente && mov.monto > 0);
      }

      return resultado;

    } catch (error) {
      Logger.log('Error en ClaudeService.analizarImagen: ' + error.message);
      // Detectar timeout de UrlFetchApp
      if (error.message && (error.message.toLowerCase().includes('timed out') || error.message.toLowerCase().includes('timeout'))) {
        throw new Error('La imagen tardó demasiado en procesarse (timeout de 30s). Intentá con una imagen de menor resolución o tamaño.');
      }
      if (error.message && error.message.toLowerCase().includes('http')) {
        throw new Error('Error HTTP al conectar con Claude: ' + error.message);
      }
      // Personalización de errores HTTP
      if (error.message && error.message.match(/\b(401|403|404|429|500|502|503|504)\b/)) {
        throw new Error('Error HTTP ' + error.message.match(/\b(401|403|404|429|500|502|503|504)\b/)[0] + ' al conectar con Claude.');
      }
      throw error;
    }
  },

  /**
   * Extrae JSON valido de una respuesta de texto
   * @param {string} texto - Texto de respuesta
   * @returns {Object} JSON parseado
   */
  extraerJsonDeRespuesta: function(texto) {
    if (!texto) throw new Error('Respuesta vacía de Claude.');
    texto = String(texto).replace(/[^\x20-\x7E\n\r\t]/g, '');

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
