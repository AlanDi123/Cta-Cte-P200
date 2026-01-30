/**
 * ============================================================================
 * CLAUDE SERVICE - SISTEMA SOL & VERDE
 * ============================================================================
 *
 * Archivo: claude.js
 * Descripción: Integración con Claude AI para Visual Reasoning
 *
 * ============================================================================
 */

const ClaudeService = {
  /**
   * Obtiene la API Key de Claude desde PropertiesService
   * @returns {string|null} API Key o null si no está configurada
   */
  getApiKey: function() {
    const props = PropertiesService.getUserProperties();
    return props.getProperty(CONFIG.PROPS.API_KEY);
  },

  /**
   * Analiza una imagen usando Claude Vision API
   * @param {string} imageBase64 - Imagen en formato Base64
   * @returns {Object} Resultado del análisis
   */
  analizarImagen: function(imageBase64) {
    Logger.log('🔍 INICIO: analizarImagen - Diagnóstico Visual Reasoning');

    // PASO 1: Verificar API Key
    Logger.log('📋 Paso 1: Verificando API Key...');
    const apiKey = this.getApiKey();
    Logger.log('✓ API Key presente: ' + !!apiKey);
    Logger.log('✓ Longitud API Key: ' + (apiKey ? apiKey.length : 0) + ' caracteres');

    if (!apiKey) {
      const error = 'API Key de Claude no configurada. Por favor, configure la API Key en el módulo de Configuración.';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    // PASO 2: Validar imagen Base64 - FIX: Validar que no sea undefined primero
    Logger.log('📋 Paso 2: Validando imagen Base64...');
    Logger.log('✓ imageBase64 tipo: ' + typeof imageBase64);
    Logger.log('✓ imageBase64 === undefined: ' + (imageBase64 === undefined));
    Logger.log('✓ imageBase64 === null: ' + (imageBase64 === null));
    Logger.log('✓ imageBase64 === "": ' + (imageBase64 === ""));

    if (imageBase64 === undefined || imageBase64 === null || imageBase64 === '') {
      const error = 'Image Base64 no fue recibida (undefined/null/empty). Esto puede ocurrir si: 1) El archivo es muy grande (>5MB), 2) La conexión fue interrumpida, 3) Browser bloqueó el acceso a FileReader. Por favor, recarga la página e intenta de nuevo.';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    Logger.log('✓ Longitud imagen: ' + imageBase64.length + ' caracteres');
    if (imageBase64.length < 100) {
      const error = 'Imagen demasiado pequeña o inválida (< 100 caracteres Base64)';
      Logger.log('❌ ' + error);
      throw new Error(error);
    }

    // PASO 3: Detectar tipo de imagen desde el prefijo Base64
    Logger.log('📋 Paso 3: Detectando tipo de imagen...');
    let mediaType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) {
      mediaType = 'image/png';
    } else if (imageBase64.includes('data:image/webp')) {
      mediaType = 'image/webp';
    } else if (imageBase64.includes('data:image/gif')) {
      mediaType = 'image/gif';
    }
    Logger.log('✓ Tipo de imagen detectado: ' + mediaType);

    // PASO 4: Limpiar prefijo Base64
    Logger.log('📋 Paso 4: Limpiando prefijo Base64...');
    const base64Clean = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    Logger.log('✓ Base64 limpio, longitud: ' + base64Clean.length + ' caracteres');

    // PASO 5: Construir payload para Claude API
    Logger.log('📋 Paso 5: Construyendo payload para Claude API...');
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
                data: base64Clean
              }
            },
            {
              type: 'text',
              text: `Analiza esta imagen de una cuenta corriente o planilla de movimientos financieros.

Extrae TODOS los movimientos visibles en formato JSON con la siguiente estructura:

{
  "movimientos": [
    {
      "cliente": "NOMBRE COMPLETO DEL CLIENTE (en mayúsculas)",
      "tipo": "DEBE o HABER",
      "monto": número positivo,
      "obs": "descripción del movimiento",
      "fecha": "YYYY-MM-DD" (si está visible, sino usar fecha actual)
    }
  ]
}

INSTRUCCIONES CRÍTICAS:
1. El campo "tipo" DEBE ser exactamente "DEBE" o "HABER" (mayúsculas)
2. El campo "cliente" debe estar en MAYÚSCULAS
3. El campo "monto" debe ser un número positivo (sin símbolos $)
4. Extrae TODOS los movimientos visibles, no solo algunos
5. Si no hay movimientos visibles, devuelve array vacío

Responde SOLO con el JSON, sin explicaciones adicionales.`
            }
          ]
        }
      ]
    };
    Logger.log('✓ Payload construido, modelo: ' + CONFIG.CLAUDE.MODEL);

    // PASO 6: Preparar options de fetch
    Logger.log('📋 Paso 6: Preparando opciones de UrlFetch...');
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CONFIG.CLAUDE.VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    Logger.log('✓ Headers configurados, URL: ' + CONFIG.CLAUDE.API_URL);

    try {
      // PASO 7: Hacer request a Claude API
      Logger.log('📋 Paso 7: Enviando request a Claude API...');
      const response = UrlFetchApp.fetch(CONFIG.CLAUDE.API_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      Logger.log('✓ Response recibida, código: ' + responseCode);
      Logger.log('✓ Response longitud: ' + responseText.length + ' caracteres');

      // PASO 8: Validar código de respuesta
      Logger.log('📋 Paso 8: Validando código de respuesta...');
      if (responseCode !== 200) {
        Logger.log('❌ Error de Claude API (código ' + responseCode + ')');
        Logger.log('❌ Respuesta: ' + responseText.substring(0, 500));
        throw new Error(`Error de Claude API (${responseCode}): ${responseText.substring(0, 200)}`);
      }
      Logger.log('✓ Código 200 OK');

      // PASO 9: Parsear respuesta JSON
      Logger.log('📋 Paso 9: Parseando respuesta JSON...');
      const resultado = JSON.parse(responseText);
      Logger.log('✓ JSON parseado correctamente');

      // PASO 10: Extraer texto de la respuesta
      Logger.log('📋 Paso 10: Extrayendo texto de contenido...');
      if (!resultado.content || !resultado.content[0] || !resultado.content[0].text) {
        Logger.log('❌ Estructura de respuesta inválida');
        Logger.log('❌ Response content: ' + JSON.stringify(resultado).substring(0, 300));
        throw new Error('Respuesta de Claude API inválida: falta content.text');
      }

      const textoRespuesta = resultado.content[0].text;
      Logger.log('✓ Texto extraído, longitud: ' + textoRespuesta.length + ' caracteres');

      // PASO 11: Limpiar JSON de la respuesta
      Logger.log('📋 Paso 11: Limpiando JSON de markdown...');
      let jsonLimpio = textoRespuesta.trim();
      const originalLength = jsonLimpio.length;
      jsonLimpio = jsonLimpio.replace(/^```json\n?/i, '').replace(/\n?```$/i, '');
      Logger.log('✓ JSON limpio, tamaño: ' + originalLength + ' → ' + jsonLimpio.length + ' caracteres');

      // PASO 12: Parsear JSON extraído
      Logger.log('📋 Paso 12: Parseando JSON de movimientos...');
      const datosExtraidos = JSON.parse(jsonLimpio);
      Logger.log('✓ JSON de movimientos parseado correctamente');

      // PASO 13: Validar estructura de datos
      Logger.log('📋 Paso 13: Validando estructura de datos...');
      if (!datosExtraidos.movimientos || !Array.isArray(datosExtraidos.movimientos)) {
        Logger.log('❌ Falta array "movimientos" en respuesta');
        Logger.log('❌ Estructura recibida: ' + JSON.stringify(datosExtraidos).substring(0, 300));
        throw new Error('Formato de respuesta inválido: falta array "movimientos"');
      }

      const totalMovimientos = datosExtraidos.movimientos.length;
      Logger.log('✓ Estructura válida, movimientos extraídos: ' + totalMovimientos);

      // PASO 14: Retornar resultado
      Logger.log('📋 Paso 14: Preparando respuesta final...');
      const resultado_final = {
        success: true,
        movimientos: datosExtraidos.movimientos,
        totalExtraidos: totalMovimientos
      };
      Logger.log('✅ ÉXITO: Visual Reasoning completado - ' + totalMovimientos + ' movimientos extraídos');

      return resultado_final;

    } catch (error) {
      Logger.log('❌ ERROR EN PASO ANTERIOR: ' + error.message);
      Logger.log('❌ Stack: ' + error.stack);
      throw new Error('Error al analizar imagen: ' + error.message);
    }
  }
};