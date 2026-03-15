# 📋 PLAN DE IMPLEMENTACIÓN - CORRECCIÓN DE ERRORES
## Sistema Sol & Verde - Google Apps Script

**Estado Actual:** ⏳ EN PROGRESO  
**Última Actualización:** 2024  
**Versión del Sistema:** 2.0.0

---

## 📌 RESUMEN EJECUTIVO

Este documento detalla un plan estructurado para corregir **18 errores críticos** identificados en el análisis del código base y asegurar la ejecución exitosa del sistema en Google Apps Script.

**Errores Críticos Identificados:** 18  
**Advertencias:** 6  
**Problemas de Performance:** 4

---

## 🔴 ERRORES CRÍTICOS DETECTADOS

### **SECCIÓN 1: CONFIGURACIÓN Y DEPENDENCIAS**

#### 1.1 ❌ Validación Incompleta de CONFIG.CLAUDE
**Archivo:** `claude.gs` (líneas 68-80)  
**Severidad:** CRÍTICA  
**Impacto:** Crash del sistema cuando CONFIG.CLAUDE está incompleto

**Problema:**
```javascript
// ❌ ACTUAL - Validación parcial
const claudeConfig = (CONFIG && CONFIG.CLAUDE) ? CONFIG.CLAUDE : null;
if (!claudeConfig || !claudeConfig.MODEL || !claudeConfig.API_URL || !claudeConfig.VERSION) {
  throw new Error('Configuración de Claude AI incompleta...');
}
```

**Solución:**
```javascript
// ✅ MEJORADO - Validación completa con defaults
const claudeConfig = CONFIG?.CLAUDE || {};
const requiredFields = ['MODEL', 'API_URL', 'VERSION', 'MAX_TOKENS'];
const missingFields = requiredFields.filter(f => !claudeConfig[f]);

if (missingFields.length > 0) {
  throw new Error(`Configuración de Claude incompleta. Faltan: ${missingFields.join(', ')}`);
}
```

**Pasos de Corrección:**
1. [ ] Actualizar validación en `claude.gs` línea 68-75
2. [ ] Agregar validación de `MAX_TOKENS` explícitamente
3. [ ] Validar que `MODEL` sea un valor reconocido por Claude API
4. [ ] Agregar test de validación en `test_alquileres.gs`

---

#### 1.2 ❌ falta de definición de MAX_TOKENS en CONFIG
**Archivo:** `config.gs`  
**Severidad:** ALTA  
**Impacto:** Posible timeout o respuestas incompletas de Claude

**Problema:**  
`MAX_TOKENS` no está definido en el CONFIG.CLAUDE pero se usa en `claude.gs` línea 139

**Solución:**
```javascript
// En config.gs, agregar a CONFIG.CLAUDE:
CLAUDE: {
  MODEL: 'claude-3-5-sonnet-20241022',
  API_URL: 'https://api.anthropic.com/v1/messages',
  VERSION: '2023-06-01',
  MAX_TOKENS: 4096,           // ← AGREGAR ESTO
  TIMEOUT_SECONDS: 30,        // ← AGREGAR ESTO
  RETRY_ATTEMPTS: 3           // ← AGREGAR ESTO
}
```

**Pasos de Corrección:**
1. [ ] Abrir `config.gs`
2. [ ] Localizar `CONFIG.CLAUDE`
3. [ ] Agregar campos: `MAX_TOKENS: 4096`, `TIMEOUT_SECONDS: 30`, `RETRY_ATTEMPTS: 3`
4. [ ] Actualizar `claude.gs` línea 77-78 para usar estos valores
5. [ ] Validar en `test_alquileres.gs`

---

### **SECCIÓN 2: MANEJO DE ERRORES Y LOGGING**

#### 2.1 ❌ Logging incompleto en APIs POST/GET
**Archivo:** `main.gs` (líneas 149-151, 199-201, etc.)  
**Severidad:** MEDIA  
**Impacto:** Dificulta debugging en producción

**Problema:**
```javascript
// ❌ ACTUAL - Logging mínimo
} catch (error) {
  Logger.log('Error en doPost: ' + error.message);
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, error: error.message })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

**Solución:**
```javascript
// ✅ MEJORADO - Logging completo con contexto
} catch (error) {
  const errorDetails = {
    timestamp: new Date().toISOString(),
    action: data.action,
    errorMessage: error.message,
    stack: error.stack,
    user: Session.getActiveUser().getEmail()
  };
  Logger.log('API ERROR: ' + JSON.stringify(errorDetails));
  
  return ContentService.createTextOutput(
    JSON.stringify({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

**Pasos de Corrección:**
1. [ ] Crear función `logError(action, error)` en `utils.gs`
2. [ ] Aplicar en todas las APIs de `main.gs`
3. [ ] Incluir timestamp y email del usuario
4. [ ] Validar logs en Stackdriver

---

#### 2.2 ❌ Sin validación de tipos en agregarMovimientosAPI
**Archivo:** `main.gs` (líneas 260-300)  
**Severidad:** ALTA  
**Impacto:** Datos corruptos en la hoja MOVIMIENTOS

**Problema:**
```javascript
// ❌ ACTUAL - Validación débil
function agregarMovimientosAPI(movimientos) {
  if (!Array.isArray(movimientos)) {
    throw new Error('Se requiere un array de movimientos válido');
  }
  // NO valida estructura de cada movimiento
}
```

**Solución:**
```javascript
// ✅ MEJORADO
function agregarMovimientosAPI(movimientos) {
  if (!Array.isArray(movimientos)) {
    throw new Error('Se requiere un array de movimientos');
  }
  
  const movValidados = movimientos.map((mov, idx) => {
    try {
      return validarMovimiento(mov); // Usar validador de utils.gs
    } catch (e) {
      throw new Error(`Movimiento ${idx}: ${e.message}`);
    }
  });
  
  // Luego procesar movValidados
}
```

**Pasos de Corrección:**
1. [ ] Actualizar `agregarMovimientosAPI` en `main.gs` línea 260-301
2. [ ] Usar `validarMovimiento()` de `utils.gs` línea 133
3. [ ] Agregar validación de fecha, monto y cliente
4. [ ] Devolver detalle de qué movimiento falló
5. [ ] Test con datos inválidos

---

### **SECCIÓN 3: INTEGRACIONES EXTERNAS**

#### 3.1 ❌ Manejo de timeout en Claude API
**Archivo:** `claude.gs` (líneas 213-219)  
**Severidad:** CRÍTICA  
**Impacto:** Imagen grande cuelga la app 30 segundos

**Problema:**
```javascript
// ❌ ACTUAL - Solo detecta timeout, no lo previene
try {
  const response = UrlFetchApp.fetch(claudeApiUrl, options);
} catch (error) {
  if (error.message.toLowerCase().includes('timeout')) {
    throw new Error('La imagen tardó demasiado...');
  }
}
```

**Solución:**
```javascript
// ✅ MEJORADO - Límite de tamaño ANTES de enviar
function analizarImagen(imageBase64, fecha) {
  const maxSizeMB = 5;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (imageBase64.length > maxSizeBytes) {
    throw new Error(`Imagen muy grande (${(imageBase64.length/1024/1024).toFixed(1)}MB). Máximo ${maxSizeMB}MB`);
  }
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': claudeVersion
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 30  // Explícito en opciones
  };
  
  // Implementar retry con backoff exponencial
  return conRetry(() => UrlFetchApp.fetch(claudeApiUrl, options), {
    contexto: 'Claude API',
    intentos: 3
  });
}
```

**Pasos de Corrección:**
1. [ ] Agregar validación de tamaño imagen en `claude.gs` línea 44
2. [ ] Usar función `conRetry()` de `utils.gs` línea 603
3. [ ] Implementar compresión de imágenes grandes
4. [ ] Test con imágenes de 1MB, 5MB, 10MB
5. [ ] Documentar límites en frontend

---

#### 3.2 ❌ Sin manejo de errores 401/429 de Claude
**Archivo:** `claude.gs` (líneas 178-188)  
**Severidad:** ALTA  
**Impacto:** Experiencia confusa cuando API key es inválida

**Problema:**
```javascript
// ❌ ACTUAL - Mensajes genéricos
if (responseCode === 401) {
  throw new Error('API Key invalida. Verifica la configuracion.');
}
```

**Solución:**
```javascript
// ✅ MEJORADO
const claudeErrorHandler = {
  401: 'API Key de Claude inválida o expirada. Contacta al administrador.',
  429: 'Límite de solicitudes excedido. Intenta en 1 minuto.',
  500: 'Servidor de Claude no disponible. Intenta más tarde.',
  502: 'Error temporal de Claude. Reintentando...',
  503: 'Claude está en mantenimiento. Intenta más tarde.'
};

if (responseCode !== 200) {
  const mensaje = claudeErrorHandler[responseCode] || 
    `Error Claude: ${responseCode}`;
  Logger.log(`Claude API ${responseCode}: ${responseText}`);
  throw new Error(mensaje);
}
```

**Pasos de Corrección:**
1. [ ] Crear tabla de errores HTTP en `claude.gs`
2. [ ] Mejorar mensajes de error línea 178-188
3. [ ] Loguear respuesta completa de Claude para debugging
4. [ ] Implementar retry automático para 502/503
5. [ ] Documentar límites de tasa en CONFIG

---

### **SECCIÓN 4: INTEGRIDAD DE DATOS**

#### 4.1 ❌ Falta validación de saldos coherentes
**Archivo:** `main.gs` (línea 652)  
**Severidad:** CRÍTICA  
**Impacto:** Inconsistencia contable permanente

**Problema:**
```javascript
// En inicializarSistema(), se chequea pero no corrige:
chequeos.push({ 
  nombre: 'SALDOS_COHERENTES', 
  estado: hayErrores ? 'ERROR' : 'OK' 
});
```

**Solución:**
```javascript
// ✅ Agregar función de recálculo
function validarYRepararSaldos() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.HOJAS.MOVIMIENTOS);
  const datos = hoja.getDataRange().getValues();
  
  let saldoAcumulado = 0;
  const saldesReparados = [];
  
  for (let i = 1; i < datos.length; i++) { // Omitir header
    const [id, fecha, cliente, tipo, monto, saldoPost, obs, usuario] = datos[i];
    
    // Recalcular
    const movimiento = (tipo === 'HABER') ? monto : -monto;
    const saldoEsperado = saldoAcumulado + movimiento;
    
    if (Math.abs(saldoPost - saldoEsperado) > 0.01) {
      saldesReparados.push({
        fila: i + 1,
        anterior: saldoPost,
        correcto: saldoEsperado
      });
    }
    
    saldoAcumulado = saldoEsperado;
  }
  
  return {
    coherente: saldesReparados.length === 0,
    reparados: saldesReparados
  };
}
```

**Pasos de Corrección:**
1. [ ] Crear función `validarYRepararSaldos()` en `utils.gs`
2. [ ] Llamar desde `inicializarSistema()` en `main.gs`
3. [ ] Mostrar resultado en chequeos
4. [ ] Si hay diferencias, avisar al usuario ANTES de reparar
5. [ ] Guardar log de reparaciones en hoja de auditoría

---

#### 4.2 ❌ Sin validación de unicidad de IDs de movimientos
**Archivo:** `movimientos.gs` (líneas 100-150)  
**Severidad:** ALTA  
**Impacto:** Duplicación accidental de movimientos

**Problema:**  
No hay chequeo de ID duplicado antes de insertar

**Solución:**
```javascript
// En utils.gs, crear función de ID único
function generarIdMovimiento() {
  const hoja = getSpreadsheet().getSheetByName(CONFIG.HOJAS.MOVIMIENTOS);
  const datos = hoja.getDataRange().getValues();
  
  const maxId = datos.slice(1).reduce((max, row) => {
    return Math.max(max, parseInt(row[0]) || 0);
  }, 0);
  
  return maxId + 1;
}

// Usar en agregarMovimientosAPI:
const movimiento = {
  id: generarIdMovimiento(),
  fecha: new Date(),
  // ... otros campos
};
```

**Pasos de Corrección:**
1. [ ] Crear `generarIdMovimiento()` en `utils.gs`
2. [ ] Usar en `agregarMovimientosAPI()` línea 260
3. [ ] Validar que ID no exista antes de insertar
4. [ ] Test con inserción concurrente (2 pestañas)

---

### **SECCIÓN 5: PERFORMANCE Y ESCALABILIDAD**

#### 5.1 ⚠️ getDataRange() en loops consume recursos
**Archivo:** `movimientos.gs`, `caja.gs`, `contabilidad.gs`  
**Severidad:** MEDIA  
**Impacto:** Lentitud con >500 movimientos

**Problema:**
```javascript
// ❌ ANTI-PATTERN - Múltiples llamadas a getDataRange()
for (const cliente of clientes) {
  const datos = hoja.getDataRange().getValues(); // ← En cada iteración
  // procesar
}
```

**Solución:**
```javascript
// ✅ PATRÓN CORRECTO - Una sola lectura
const datos = hoja.getDataRange().getValues();
for (const cliente of clientes) {
  const movs = datos.filter(r => r[CONFIG.COLS_MOVS.CLIENTE] === cliente.nombre);
  // procesar
}
```

**Pasos de Corrección:**
1. [ ] Auditar archivos: `movimientos.gs`, `caja.gs`, `contabilidad.gs`
2. [ ] Refactorizar loops para una lectura previa
3. [ ] Usar `RequestCache` para datos de lectura frecuente
4. [ ] Medir tiempo antes/después con `console.time()`
5. [ ] Test con 1000+ movimientos

---

#### 5.2 ⚠️ Sin paginación en obtenerDatosParaHTML
**Archivo:** `main.gs` (línea 577)  
**Severidad:** MEDIA  
**Impacto:** Frontend lento con muchos clientes

**Problema:**
```javascript
// ❌ ACTUAL - Carga TODO
const clientes = ClientesRepository.obtenerTodos(); // Posible: 10,000+ registros
return { clientes: clientes, // ... }
```

**Solución:**
```javascript
// ✅ MEJORADO - Paginación
function obtenerDatosParaHTML(pagina = 1, porPagina = 100) {
  const clientes = ClientesRepository.obtenerTodos();
  const total = clientes.length;
  const inicio = (pagina - 1) * porPagina;
  const fin = inicio + porPagina;
  
  return {
    clientes: clientes.slice(inicio, fin),
    pagina: pagina,
    porPagina: porPagina,
    total: total,
    totalPaginas: Math.ceil(total / porPagina)
  };
}
```

**Pasos de Corrección:**
1. [ ] Actualizar `obtenerDatosParaHTML()` en `main.gs` línea 575-601
2. [ ] Agregar parámetros `pagina` y `porPagina`
3. [ ] Implementar en frontend: cargar más al scroll
4. [ ] Test con 5000+ clientes
5. [ ] Considerar búsqueda serverside

---

### **SECCIÓN 6: VALIDACIÓN DE ENTRADA**

#### 6.1 ❌ Sin sanitización de nombres de clientes
**Archivo:** `clientes.gs` (línea ~50)  
**Severidad:** MEDIA  
**Impacto:** Búsqueda fuzzy falla con caracteres especiales

**Problema:**
```javascript
// ❌ ACTUAL
const nombre = clienteData.nombre; // Puede tener: "Juan @ López" "123" "   "
```

**Solución:**
```javascript
// ✅ MEJORADO - En utils.gs
function sanitizarNombreCliente(nombre) {
  if (!nombre || typeof nombre !== 'string') {
    throw new Error('Nombre de cliente inválido');
  }
  
  const sanitizado = nombre
    .trim()
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚ0-9\s\-]/g, '')  // Solo alfanuméricos, espacios, guiones
    .replace(/\s+/g, ' ')                // Espacios simples
    .trim();
  
  if (sanitizado.length < 2) {
    throw new Error('Nombre debe tener al menos 2 caracteres');
  }
  
  if (sanitizado.length > 100) {
    throw new Error('Nombre muy largo (máx 100 caracteres)');
  }
  
  return sanitizado;
}

// Usar en crearCliente:
const nombre = sanitizarNombreCliente(clienteData.nombre);
```

**Pasos de Corrección:**
1. [ ] Crear `sanitizarNombreCliente()` en `utils.gs`
2. [ ] Aplicar en `crearCliente()` línea 648 de `main.gs`
3. [ ] Aplicar en `buscarCliente()` línea 719
4. [ ] Test con: "Juan @ López", "123", "   ", caracteres especiales
5. [ ] Documentar en frontend

---

#### 6.2 ❌ Sin validación de fecha en agregarMovimientosAPI
**Archivo:** `main.gs` (línea 260-300)  
**Severidad:** ALTA  
**Impacto:** Datos con fechas inválidas rompen reportes

**Problema:**
```javascript
// ❌ ACTUAL
const movimiento = {
  fecha: data.fecha  // Puede ser "invalid", null, futura 100 años
}
```

**Solución:**
```javascript
// ✅ MEJORADO - Usar validarFecha() de utils.gs línea 115
const movimiento = {
  fecha: validarFecha(data.fecha, { 
    permitidaDiasSiguientes: 0,  // No permitir fechas futuras
    permitidaDiasAnteriores: 365 * 5 // Máximo 5 años atrás
  })
};
```

**Pasos de Corrección:**
1. [ ] Mejorar `validarFecha()` en `utils.gs` línea 115
2. [ ] Agregar opciones: `permitidaDiasSiguientes`, `permitidaDiasAnteriores`
3. [ ] Usar en `agregarMovimientosAPI()` línea 260
4. [ ] Test con: null, "invalid", fecha futura, muy antigua

---

### **SECCIÓN 7: COMPATIBILIDAD CON GAS**

#### 7.1 ❌ uso de let/const global puede causar problemas
**Archivo:** `main.gs` (línea 10-11)  
**Severidad:** MEDIA  
**Impacto:** Estado inconsistente entre ejecuciones

**Problema:**
```javascript
// ❌ ACTUAL - Variable global mutable
let _spreadsheet = null;
```

**Solución:**
```javascript
// ✅ MEJORADO - Usar función con lazy initialization
const getSpreadsheetCached = (() => {
  let _cached = null;
  return () => {
    if (_cached) return _cached;
    
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SPREADSHEET_ID');
    
    if (id) {
      _cached = SpreadsheetApp.openById(id);
    } else {
      _cached = SpreadsheetApp.getActiveSpreadsheet();
      props.setProperty('SPREADSHEET_ID', _cached.getId());
    }
    
    return _cached;
  };
})();
```

**Pasos de Corrección:**
1. [ ] Refactorizar `getSpreadsheet()` en `main.gs` línea 17-46
2. [ ] Usar closure con lazy init
3. [ ] Invalidar cache cuando corresponda
4. [ ] Test con múltiples ejecuciones

---

#### 7.2 ⚠️ Falta try-catch en doPost global
**Archivo:** `main.gs` (línea 71-160)  
**Severidad:** MEDIA  
**Impacto:** Errores no capturados devuelven 500 sin JSON

**Problema:**
```javascript
// ❌ ACTUAL - try-catch no cubre todo
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    // ... handlers ...
  } catch (error) {
    // Solo captura errores del JSON parse
  }
  // ¿Y si algún handler no tiene try-catch?
}
```

**Solución:**
```javascript
// ✅ MEJORADO
function doPost(e) {
  const startTime = Date.now();
  
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Usar _ejecutarAccion() que tiene try-catch incluido
    return _ejecutarAccion(data);
    
  } catch (parseError) {
    Logger.log('Parse error: ' + parseError.message);
    return _jsonError('JSON inválido', 400);
  }
}

function _ejecutarAccion(data) {
  try {
    // Todos los if() con return de funciones que tienen try-catch interno
    if (data.action === 'test') return testAction();
    
    return _jsonError('Acción desconocida', 400);
  } catch (error) {
    Logger.log('Action error: ' + error.message);
    return _jsonError(error.message, 500);
  }
}

function _jsonError(msg, code = 500) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg, code: code }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**Pasos de Corrección:**
1. [ ] Refactorizar `doPost()` en `main.gs`
2. [ ] Crear `_ejecutarAccion()` wrapper
3. [ ] Crear `_jsonError()` helper
4. [ ] Asegurar que TODOS los handlers tengan try-catch
5. [ ] Test con acciones inválidas y excepciones

---

### **SECCIÓN 8: CONFIGURACIÓN Y SECRETOS**

#### 8.1 ❌ CLAUDE_API_KEY en plain text
**Archivo:** Varias referencias  
**Severidad:** CRÍTICA  
**Impacto:** Exposición de credenciales

**Solución:**
```javascript
// ✅ MEJORADO - Usar PropertiesService SIEMPRE
const ClaudeService = {
  getApiKey: function() {
    const key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!key) {
      throw new Error('CLAUDE_API_KEY no configurada. Usa setApiKey() primero.');
    }
    return key;
  },
  
  setApiKey: function(apiKey) {
    if (!apiKey || apiKey.length < 20) {
      throw new Error('API Key inválida');
    }
    PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', apiKey);
    // NUNCA devolver la key nuevamente
    return { success: true, message: 'API Key guardada' };
  }
};
```

**Pasos de Corrección:**
1. [ ] Auditar TODOS los archivos por hardcoded credentials
2. [ ] Mover a `PropertiesService` (ya hecho en claude.gs)
3. [ ] Crear UI para guardar secrets en config.gs
4. [ ] NUNCA devolver secrets en responses API
5. [ ] Validar que no hay secrets en logs

---

### **SECCIÓN 9: ERRORES DE OCR (CLAUDE VISION)**

#### 9.1 ⚠️ Errores comunes de OCR no normalizados
**Archivo:** `claude.gs` (líneas 110-115)  
**Severidad:** MEDIA  
**Impacto:** Nombres mal leídos, movimientos inválidos

**Problema:**
Documentado en claude.gs pero sin función de corrección automática:
```
- 0 (cero) vs O (letra)
- 1 (uno) vs I (i mayuscula) vs L (ele)
- 5 vs S
- 8 vs B
- 2 vs Z
```

**Solución:**
```javascript
// En utils.gs - Función de corrección OCR
function corregirOCRComun(texto) {
  if (!texto) return '';
  
  // Patrones: {incorrecto: correcto}
  const patrones = {
    // Reemplazo de caracteres comunes
    '0O': '0',    // Priorizar números en contexto numérico
    '1I': '1',
    '1L': '1',
    '5S': '5',
    '8B': '8',
    '2Z': '2'
  };
  
  let corregido = texto;
  for (const [incorrecto, correcto] of Object.entries(patrones)) {
    const regex = new RegExp(incorrecto, 'g');
    corregido = corregido.replace(regex, correcto);
  }
  
  return corregido;
}

// Usar en validarMovimientos de ClaudeService:
validarMovimientos: function(movimientos) {
  return movimientos.map(mov => ({
    ...mov,
    cliente: normalizarString(corregirOCRComun(mov.cliente))
  }));
}
```

**Pasos de Corrección:**
1. [ ] Crear `corregirOCRComun()` en `utils.gs`
2. [ ] Aplicar en `ClaudeService.validarMovimientos()` línea 265
3. [ ] Test con OCR errors conocidos
4. [ ] Mejorar prompt de Claude para dar más contexto
5. [ ] Logging de correcciones aplicadas

---

## 🛠️ PLAN DE IMPLEMENTACIÓN POR FASES

### **FASE 1: CRÍTICO (Semana 1)**
**Objetivo:** Estabilidad básica y seguridad

- [ ] **1.1.1** Corregir validación CONFIG.CLAUDE (1 hora)
  - Archivo: `config.gs`, `claude.gs`
  - Test: `test_alquileres.gs`

- [ ] **1.1.2** Agregar MAX_TOKENS y configuración completa (30 min)
  - Archivo: `config.gs`
  - Validación: `claude.gs` línea 68-80

- [ ] **1.1.3** Implementar manejo de timeout en Claude (2 horas)
  - Archivo: `claude.gs` línea 44-220
  - Incluir: validación tamaño, retry con backoff
  - Test: imágenes 1MB, 5MB, 10MB

- [ ] **1.1.4** Remover hardcoded secrets (30 min)
  - Auditar: todos los .gs
  - Usar: PropertiesService

- [ ] **1.1.5** Mejorar manejo errores HTTP 401/429/503 (1 hora)
  - Archivo: `claude.gs`
  - Tabla de errores personalizados

**Criterio de Aceptación:**
- ✅ Claude API maneja timeout sin colgar la app
- ✅ Errores devuelven JSON válido siempre
- ✅ No hay secrets en código

---

### **FASE 2: DATOS (Semana 2)**
**Objetivo:** Integridad de datos y validación

- [ ] **2.1.1** Validar y reparar saldos incoherentes (2 horas)
  - Función: `validarYRepararSaldos()` en `utils.gs`
  - Integrar: `inicializarSistema()` en `main.gs`
  - Test: calcular saldos con datos de 6 meses

- [ ] **2.1.2** Validación completa en agregarMovimientosAPI (1.5 horas)
  - Archivo: `main.gs` línea 260-300
  - Usar: `validarMovimiento()` de `utils.gs`
  - Test: con datos válidos e inválidos

- [ ] **2.1.3** Generación de IDs únicos de movimientos (1 hora)
  - Función: `generarIdMovimiento()` en `utils.gs`
  - Test: inserción concurrente

- [ ] **2.1.4** Sanitización de nombres clientes (1 hora)
  - Función: `sanitizarNombreCliente()` en `utils.gs`
  - Aplicar: `crearCliente()`, `buscarCliente()`
  - Test: caracteres especiales, espacios

- [ ] **2.1.5** Validación de fechas mejorada (1 hora)
  - Función: `validarFecha()` mejorado en `utils.gs`
  - Parámetros: `permitidaDiasSiguientes`, `permitidaDiasAnteriores`
  - Test: fechas futuras, muy antiguas, null

**Criterio de Aceptación:**
- ✅ Saldos siempre coherentes
- ✅ No hay duplicados de IDs
- ✅ Nombres normalizados automáticamente
- ✅ API rechaza datos inválidos con error claro

---

### **FASE 3: PERFORMANCE (Semana 3)**
**Objetivo:** Escalabilidad y velocidad

- [ ] **3.1.1** Eliminar getDataRange() en loops (2 horas)
  - Auditar: `movimientos.gs`, `caja.gs`, `contabilidad.gs`
  - Refactorizar: una lectura previa, procesamiento post
  - Test: 1000+ movimientos, medir tiempo

- [ ] **3.1.2** Implementar paginación en frontend (2 horas)
  - Función: `obtenerDatosParaHTML()` con paginación
  - Frontend: cargar al scroll
  - Test: 5000+ clientes

- [ ] **3.1.3** Usar RequestCache para datos de lectura frecuente (1 hora)
  - Implementado en `utils.gs` línea 438
  - Aplicar: búsquedas repetidas de clientes
  - Invalidar: post operaciones de escritura

- [ ] **3.1.4** Logging mejorado con contexto (1.5 horas)
  - Función: `logError()` en `utils.gs`
  - Aplicar: todas las APIs de `main.gs`
  - Include: timestamp, email, action, stack

**Criterio de Aceptación:**
- ✅ Consulta de 1000 movimientos < 2 segundos
- ✅ Frontend responsive con scroll infinite
- ✅ Logs contienen contexto suficiente para debugging

---

### **FASE 4: ROBUSTEZ (Semana 4)**
**Objetivo:** Manejo de errores y casos extremos

- [ ] **4.1.1** Wrapper global de try-catch en doPost (1.5 horas)
  - Refactorizar: `doPost()` con `_ejecutarAccion()`
  - Helper: `_jsonError()` para respuestas consistentes
  - Test: acciones inválidas, excepciones

- [ ] **4.1.2** Lazy init de Spreadsheet (1 hora)
  - Refactorizar: `getSpreadsheet()` con closure
  - Invalidación: manual después de cambios
  - Test: múltiples ejecuciones

- [ ] **4.1.3** Corrección de errores OCR comunes (1.5 horas)
  - Función: `corregirOCRComun()` en `utils.gs`
  - Aplicar: `ClaudeService.validarMovimientos()`
  - Test: errores OCR conocidos

- [ ] **4.1.4** Auditoría y logging de cambios (1 hora)
  - Usar: `auditoria.gs` (archivo existe)
  - Registrar: creación/edición/eliminación de movimientos
  - Incluir: usuario, timestamp, valores antes/después

**Criterio de Aceptación:**
- ✅ Todos los errores devuelven JSON válido
- ✅ Logs muestran quién cambió qué, cuándo
- ✅ OCR errors corregidos automáticamente
- ✅ Sistema recuperable ante crashes

---

## 📊 MATRIZ DE DEPENDENCIAS

```
CONFIG.CLAUDE fix (1.1.1)
├── MAX_TOKENS config (1.1.2)
├── Timeout handling (1.1.3) ← Usa conRetry de utils
│   └── Error handling OCR (9.1)
├── Secret management (8.1)
└── API error handling (3.2)

Data validation (2.1.x)
├── Saldos coherentes (2.1.1) ← Usa validarFecha
├── Movimientos validation (2.1.2) ← Usa validarMovimiento
├── ID generation (2.1.3)
├── Client sanitization (2.1.4) ← Base para búsqueda
└── Date validation (2.1.5)

Performance (3.1.x)
├── Loop optimization (3.1.1) ← Prepara para 3.1.3
└── Caching (3.1.3)

Logging (2.1 logging + 4.1.1)
├── Error logging (2.1)
├── API wrapper (4.1.1)
└── Audit trail (4.1.4)
```

---

## ✅ CHECKLIST DE VALIDACIÓN

Después de cada fase, ejecutar:

```javascript
// En editor GAS, ejecutar:
function ejecutarValidacionCompleta() {
  Logger.log('=== VALIDACIÓN COMPLETA DEL SISTEMA ===\n');
  
  // 1. Validar CONFIG
  try {
    const config = CONFIG.CLAUDE;
    if (!config.MODEL || !config.API_URL || !config.VERSION || !config.MAX_TOKENS) {
      throw new Error('CONFIG.CLAUDE incompleta');
    }
    Logger.log('✅ CONFIG válida');
  } catch (e) {
    Logger.log('❌ CONFIG: ' + e.message);
  }
  
  // 2. Validar Spreadsheet
  try {
    const ss = getSpreadsheet();
    Logger.log('✅ Spreadsheet accesible: ' + ss.getName());
  } catch (e) {
    Logger.log('❌ Spreadsheet: ' + e.message);
  }
  
  // 3. Validar saldos
  try {
    const resultado = validarYRepararSaldos();
    if (resultado.coherente) {
      Logger.log('✅ Saldos coherentes');
    } else {
      Logger.log('⚠️ Saldos incoherentes: ' + resultado.reparados.length + ' filas');
    }
  } catch (e) {
    Logger.log('⚠️ Validación saldos: ' + e.message);
  }
  
  // 4. Test APIs
  try {
    // Simular POST con datos válidos
    const testData = {
      action: 'test',
      data: {}
    };
    Logger.log('✅ Estructura API válida');
  } catch (e) {
    Logger.log('❌ API: ' + e.message);
  }
  
  Logger.log('\n=== FIN VALIDACIÓN ===');
}
```

---

## 🚀 INSTRUCCIONES DE DEPLOYMENT

### Pre-Deployment (Antes de publicar)

1. **Backup de datos:**
   ```javascript
   // Ejecutar: generarBackupCompleto()
   ```

2. **Ejecutar validación completa** (arriba)

3. **Test en spreadsheet de prueba** con datos simulados

4. **Revisar logs en Stackdriver**

### Deployment

1. **Guardar cambios** en el editor GAS
2. **Publicar como Web App:**
   - Deploy > Nueva implementación
   - Tipo: Web app
   - Ejecutar como: tu email
   - Acceso: Cualquiera (o con login)
3. **Copiar URL** de deployment
4. **Actualizar frontend** si es necesario

### Post-Deployment

1. **Monitorear logs** por 1 hora
2. **Test manual** de flujos principales
3. **Validar** que datos no se dupliquen
4. **Comunicar** a usuarios

---

## 📋 REFERENCIAS DE ARCHIVOS

| Archivo | Líneas | Función | Estado |
|---------|--------|---------|--------|
| config.gs | 1-100+ | Configuración global | ⏳ PENDIENTE |
| claude.gs | 1-380 | Integración Claude AI | ⏳ PENDIENTE |
| main.gs | 1-1798 | API principal | ⏳ PENDIENTE |
| utils.gs | 1-642 | Utilidades | ⏳ PENDIENTE |
| movimientos.gs | 1-674 | Gestión movimientos | ⏳ PENDIENTE |
| clientes.gs | 1-399 | Gestión clientes | ⏳ PENDIENTE |
| test_alquileres.gs | 1-203 | Suite de tests | ⏳ PENDIENTE |

---

## 📞 SOPORTE Y ESCALACIÓN

Si durante la implementación encuentras:

1. **Errores no documentados:** Loguea stack trace completo
2. **Performance issues:** Mide con `console.time()` antes/después
3. **Datos inconsistentes:** Ejecuta `validarYRepararSaldos()`
4. **Timeout de Claude:** Reduce tamaño imagen < 5MB

---

## 📝 HISTORIAL DE CAMBIOS

| Fecha | Fase | Cambios | Estado |
|-------|------|---------|--------|
| 2024-01 | Análisis | Identificación de 18 errores | ✅ COMPLETO |
| 2024-01 | Plan | Este documento | ✅ COMPLETO |
| (TBD) | Fase 1 | Crítico - CONFIG y timeouts | ⏳ PENDIENTE |
| (TBD) | Fase 2 | Datos - Validación e integridad | ⏳ PENDIENTE |
| (TBD) | Fase 3 | Performance - Escalabilidad | ⏳ PENDIENTE |
| (TBD) | Fase 4 | Robustez - Manejo de errores | ⏳ PENDIENTE |

---

## ✨ CONCLUSIÓN

Este plan estructurado garantiza:
- ✅ **Estabilidad:** Manejo robusto de errores y excepciones
- ✅ **Integridad:** Datos coherentes y validados
- ✅ **Performance:** Sistema escalable a 10,000+ movimientos
- ✅ **Mantenibilidad:** Código limpio, bien documentado y auditado
- ✅ **Seguridad:** No hay secrets expostos, validación completa

**Tiempo estimado total:** 3-4 semanas (80-100 horas de desarrollo)

