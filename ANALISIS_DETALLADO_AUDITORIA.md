# AUDITORÍA DE CÓDIGO - ANÁLISIS DETALLADO
**Generado:** 2025
**Sistema:** Sol & Verde v2.0.0

---

## 1️⃣ ANÁLISIS DE ÍNDICES (0-BASED vs 1-BASED)

### CONFIG.gs - CORRECTO ✓
- **Líneas 29-95**: Define índices 0-BASED (0,1,2,3,4,5,6,7...)
- **Uso correcto** en: movimientos.gs, clientes.gs, caja.gs, alquileres.gs
- ✓ NO REQUIERE CAMBIOS

### CONFIG_VN (ventaNocturna.gs) - PROBLEMA CRÍTICO ⚠️
**Líneas 8-62**: Define índices 1-BASED (1,2,3,4,5...)

#### INCONSISTENCIAS ENCONTRADAS:

**✓ Correcto**: getRange() usa 1-based directamente
- ventaNocturna.gs línea 204: `hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.HORA_CIERRE)`
- ventaNocturna.gs línea 260: `hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.ESTADO)`

**✓ Correcto**: array access resta 1
- ventaNocturna.gs línea 236: `fila[CONFIG_VN.COLS_SESIONES.ESTADO - 1]`
- ventaNocturna.gs línea 366: `datos[i][CONFIG_VN.COLS_PRODUCTOS.ACTIVO - 1]`
- ventaNocturna.gs línea 418-435: Función `_mapearSesion()` resta 1 en todos los campos
- ventaNocturna.gs línea 437-446: Función `_mapearProducto()` resta 1 en todos los campos
- ventaNocturna.gs línea 457-464: Función `_calcularTotalesSesion()` resta 1 en todos los campos

**❌ ERROR CRÍTICO DETECTADO**:
```javascript
// main.gs línea 1751-1752
const estado = f[CONFIG_VN.COLS_SESIONES.ESTADO - 1];              // ✓ Correcto
const fechaApertura = f[CONFIG_VN.COLS_SESIONES.APERTURA - 1];     // ❌ FALTA
```

**PROBLEMA**: 
- `CONFIG_VN.COLS_SESIONES.APERTURA` NO existe en la definición
- Debería ser `HORA_APERTURA` (índice 3 en 1-based)
- **UBICACIÓN EXACTA**: main.gs línea 1752
- **IMPACTO**: chequeo de sesiones fantasma falla silenciosamente

**RECOMENDACIÓN**:
```javascript
// Cambiar línea 1752 en main.gs
const fechaApertura = f[CONFIG_VN.COLS_SESIONES.HORA_APERTURA - 1];
```

---

## 2️⃣ VALIDACIÓN DE SALDOS

### ESTADO ACTUAL: ❌ NO EXISTE VALIDACIÓN

**Ubicación**: movimientos.gs línea 57-139, función `registrar()`

**Validaciones que EXISTEN**:
- ✓ Cliente existe (línea 72-74)
- ✓ Monto válido (utils.gs línea 144-145)
- ✓ Tipo válido (utils.gs línea 140-141)

**Validaciones que FALTAN**:
- ❌ Saldo resultante no supera LÍMITE DE CRÉDITO (para DEBE)
- ❌ Saldo resultante no es negativo (para HABER)
- ❌ Validación coherente con histórico

### CÓDIGO ACTUAL (SIN VALIDACIÓN):
```javascript
// movimientos.gs línea 77-87
const saldoAnterior = cliente.saldo;
let nuevoSaldo;

if (movimientoData.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
  nuevoSaldo = sumaFinanciera(saldoAnterior, movimientoData.monto);
} else {
  nuevoSaldo = restaFinanciera(saldoAnterior, movimientoData.monto);
}
// ❌ NO VALIDA: if (nuevoSaldo > cliente.limite)
// ❌ NO VALIDA: if (nuevoSaldo < 0)
```

### FUNCIÓN ACTUAL DE VALIDACIÓN (movimientos.gs NO valida saldos):
```javascript
// utils.gs línea 133-151
function validarMovimiento(mov) {
  const errors = [];
  
  if (!mov.cliente || typeof mov.cliente !== 'string' || mov.cliente.trim() === '') {
    errors.push('Cliente es requerido');
  }
  
  if (!esTipoMovimientoValido(mov.tipo)) {
    errors.push('Tipo de movimiento invalido (debe ser DEBE o HABER)');
  }
  
  if (!esMontoValido(mov.monto)) {
    errors.push('Monto invalido (debe ser un numero positivo)');
  }
  
  // ❌ NO VALIDA SALDO RESULTANTE
  return { valid: errors.length === 0, errors: errors };
}
```

### RECOMENDACIÓN: Agregar validación

**Crear nueva función en utils.gs (después de línea 151)**:
```javascript
/**
 * Valida un movimiento incluyendo saldos
 * @param {Object} mov - Movimiento a validar
 * @param {Object} cliente - Cliente asociado
 * @returns {Object} {valid: boolean, errors: Array}
 */
function validarMovimientoConSaldos(mov, cliente) {
  const errors = [];
  
  // Validaciones básicas (reutilizar)
  const validacionBasica = validarMovimiento(mov);
  errors.push(...validacionBasica.errors);
  
  if (cliente && validacionBasica.valid) {
    // Validar saldos resultantes
    let nuevoSaldo;
    if (mov.tipo === CONFIG.TIPOS_MOVIMIENTO.DEBE) {
      nuevoSaldo = sumaFinanciera(cliente.saldo, mov.monto);
      // Validar límite de crédito
      if (nuevoSaldo > cliente.limite) {
        errors.push(
          `Saldo resultante ($${nuevoSaldo}) superaría límite ($${cliente.limite})`
        );
      }
    } else {
      nuevoSaldo = restaFinanciera(cliente.saldo, mov.monto);
      // Validar que no pague más de lo adeudado
      if (nuevoSaldo < 0) {
        errors.push(
          `No puede pagar $${mov.monto}. Saldo actual: $${cliente.saldo}`
        );
      }
    }
  }
  
  return { valid: errors.length === 0, errors: errors };
}
```

**Modificar movimientos.gs línea 64-67**:
```javascript
// ANTES
const validacion = validarMovimiento(movimientoData);

// DESPUÉS
const validacion = validarMovimientoConSaldos(movimientoData, cliente);
```

---

## 3️⃣ VALIDACIÓN DE MOVIMIENTOS API

### FUNCIÓN: agregarMovimientosAPI (main.gs línea 260-297)

**Validaciones que EXISTEN**:
- ✓ Array no vacío (línea 262)

**Validaciones que FALTAN**:
- ❌ FECHA presente y válida
- ❌ CLIENTE presente y trimmed
- ❌ TIPO válido (DEBE/HABER)
- ❌ MONTO positivo y válido
- ❌ Detalles de error por índice

### CÓDIGO ACTUAL CON PROBLEMAS:
```javascript
// main.gs línea 267-274
const movimientosAdaptados = movimientos.map(m => ({
  fecha: m.FECHA,                           // ❌ No valida
  cliente: (m.CLIENTE || '').toUpperCase(), // ⚠️ Falta trim() y normalización
  tipo: m.TIPO,                             // ❌ No valida DEBE/HABER
  monto: Number(m.MONTO) || 0,              // ❌ Silencia 0 si inválido
  obs: m.OBS || '',
  usuario: m.USUARIO || 'API_EXTERNA'
}));
```

### PROBLEMAS ESPECÍFICOS:

| Línea | Campo | Problema | Ejemplo |
|-------|-------|----------|---------|
| 268 | FECHA | Sin validación | `FECHA: undefined` → error silencioso |
| 269 | CLIENTE | Sin trim ni normalización | `CLIENTE: " juan "` → " JUAN " |
| 270 | TIPO | Sin validación | `TIPO: "debe"` → no coincide "DEBE" |
| 271 | MONTO | `Number() \|\| 0` | `MONTO: "abc"` → `NaN \|\| 0` → `0` |

### RECOMENDACIÓN: Agregar validación exhaustiva

**Crear función en main.gs (antes de agregarMovimientosAPI)**:
```javascript
function validarMovimientoAPI(m, indice) {
  const errors = [];
  
  // FECHA
  if (!m.FECHA) {
    errors.push(`[índice ${indice}] FECHA requerida`);
  } else {
    const fechaObj = validarFecha(m.FECHA);
    if (!fechaObj) {
      errors.push(`[índice ${indice}] FECHA inválida: "${m.FECHA}"`);
    }
  }
  
  // CLIENTE
  const clienteStr = String(m.CLIENTE || '').trim();
  if (!clienteStr) {
    errors.push(`[índice ${indice}] CLIENTE requerido`);
  } else if (clienteStr.length < 2) {
    errors.push(`[índice ${indice}] CLIENTE muy corto: "${clienteStr}"`);
  }
  
  // TIPO
  const tipoStr = String(m.TIPO || '').toUpperCase();
  if (!esTipoMovimientoValido(tipoStr)) {
    errors.push(`[índice ${indice}] TIPO inválido: "${m.TIPO}" (use DEBE o HABER)`);
  }
  
  // MONTO
  const monto = Number(m.MONTO);
  if (isNaN(monto) || monto <= 0) {
    errors.push(`[índice ${indice}] MONTO inválido: "${m.MONTO}" (número positivo requerido)`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Reemplazar agregarMovimientosAPI (línea 260-297)**:
```javascript
function agregarMovimientosAPI(movimientos) {
  try {
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      throw new Error('Se requiere un array de movimientos válido');
    }
    
    // Validar TODOS los movimientos primero
    const erroresValidacion = [];
    const movimientosValidos = [];
    
    for (let i = 0; i < movimientos.length; i++) {
      const validacion = validarMovimientoAPI(movimientos[i], i);
      
      if (!validacion.valid) {
        erroresValidacion.push({ indice: i, errores: validacion.errors });
      } else {
        movimientosValidos.push({
          fecha: validarFecha(movimientos[i].FECHA),
          cliente: normalizarString(movimientos[i].CLIENTE),
          tipo: String(movimientos[i].TIPO).toUpperCase(),
          monto: Number(movimientos[i].MONTO),
          obs: movimientos[i].OBS || '',
          usuario: movimientos[i].USUARIO || 'API_EXTERNA'
        });
      }
    }
    
    // Si hay errores, reportar ANTES de procesar
    if (erroresValidacion.length > 0) {
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          error: `${erroresValidacion.length} movimiento(s) inválido(s)`,
          detalles: erroresValidacion,
          procesados: 0
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Procesar movimientos válidos
    const resultado = MovimientosRepository.registrarLote(movimientosValidos);
    
    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        procesados: resultado.exitosos.length,
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
```

---

## 4️⃣ GENERACIÓN Y UNICIDAD DE IDs

### FUNCIÓN: generarNuevoID (movimientos.gs línea 33-48)

**Status**: ✓ Genera secuencial, ❌ Sin protección de concurrencia

### CÓDIGO ACTUAL:
```javascript
generarNuevoID: function() {
  const hoja = this.getHoja();
  const datos = hoja.getDataRange().getValues();
  
  if (datos.length <= 1) return 1;
  
  let maxId = 0;
  for (let i = 1; i < datos.length; i++) {
    const id = datos[i][CONFIG.COLS_MOVS.ID];
    if (typeof id === 'number' && id > maxId) {
      maxId = id;
    }
  }
  
  return maxId + 1;  // ❌ SIN VALIDACIÓN POST-GENERACIÓN
}
```

### PROBLEMAS:

1. **Race Condition**: Sin LockService
   - Script A: Lee datos, calcula maxId = 100
   - Script B: Lee datos, calcula maxId = 100 (en paralelo)
   - Ambos retornan ID = 101 → **Colisión**

2. **Sin validación de duplicados**: Después de calcular ID, no verifica que no exista

3. **Reutilización de IDs borrados**: Si fila 50 se borra, ID 50 se puede reutilizar

### RECOMENDACIÓN: Agregar protección de concurrencia

**Reemplazar función generarNuevoID (línea 33-48)**:
```javascript
generarNuevoID: function() {
  const lock = LockService.getScriptLock();
  
  try {
    // Esperar hasta obtener lock (máximo 30 segundos)
    lock.waitLock(30000);
    
    const hoja = this.getHoja();
    const datos = hoja.getDataRange().getValues();
    
    if (datos.length <= 1) return 1;
    
    let maxId = 0;
    const idsExistentes = new Set();
    
    for (let i = 1; i < datos.length; i++) {
      const id = datos[i][CONFIG.COLS_MOVS.ID];
      if (typeof id === 'number' && id > 0) {
        maxId = Math.max(maxId, id);
        idsExistentes.add(id);
      }
    }
    
    const nuevoId = maxId + 1;
    
    // Validar que no exista (double-check)
    if (idsExistentes.has(nuevoId)) {
      throw new Error(`[BUG] ID generado ${nuevoId} ya existe. maxId=${maxId}, idsExistentes=${idsExistentes.size}`);
    }
    
    return nuevoId;
    
  } finally {
    lock.releaseLock();
  }
}
```

**UBICACIÓN**: Cambiar línea 33-48 en movimientos.gs

**BENEFICIOS**:
- ✓ Previene race conditions
- ✓ Valida duplicados
- ✓ Thread-safe para ejecuciones paralelas

---

## 5️⃣ SANITIZACIÓN DE NOMBRES Y VALIDACIÓN DE FECHAS

### 5.1 SANITIZACIÓN DE NOMBRES - ✓ CORRECTO

**Función normalizar String (utils.gs línea 19-32)**:
```javascript
function normalizarString(str) {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')     // Espacios múltiples → uno
    .replace(/[ÁÀÂÃ]/g, 'A')  // Acentos
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/Ñ/g, 'N')
    .replace(/Ç/g, 'C');
}
```

**USO CORRECTO**:
- movimientos.gs línea 69: `normalizarString(movimientoData.cliente)` ✓
- clientes.gs línea 185: `normalizarString(datos[i][CONFIG.COLS_CLIENTES.NOMBRE])` ✓

**USO INCORRECTO**:
- main.gs línea 269: `(m.CLIENTE || '').toUpperCase()` ❌ Falta normalizar acentos

### 5.2 VALIDACIÓN DE FECHAS - ✓ CORRECTO

**Función validarFecha (utils.gs línea 115-126)**:
```javascript
function validarFecha(fecha) {
  if (!fecha) return null;
  try {
    const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(fechaObj.getTime())) return null;
    const year = fechaObj.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return fechaObj;
  } catch (error) {
    return null;
  }
}
```

**Función parsearFechaLocal (utils.gs línea 338-357)**:
```javascript
function parsearFechaLocal(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha;
  
  if (typeof fecha === 'string' && fecha.includes('T')) {
    const d = new Date(fecha);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  
  if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 0, 0, 0, 0);
  }
  
  return new Date(fecha);
}
```

**USO CORRECTO**:
- movimientos.gs línea 92: `parsearFechaLocal(movimientoData.fecha)` ✓

### 5.3 FALTAS DE SANITIZACIÓN DETECTADAS

| Ubicación | Campo | Status | Problema | Solución |
|-----------|-------|--------|----------|----------|
| main.gs:269 | CLIENTE (API) | ❌ | Solo `.toUpperCase()`, sin acentos | Usar `normalizarString()` |
| main.gs:272 | obs | ❌ | Sin sanitización de HTML/XSS | Escapar caracteres |
| ventaNocturna.gs:262 | razonReapertura | ⚠️ | Solo `.trim()` | Usar `normalizarString()` |

### 5.4 RECOMENDACIÓN: Sanitización centralizada para OBS

**Crear función en utils.gs (después de normalizarString)**:
```javascript
/**
 * Sanitiza campos de observación/descripción
 * Previene XSS escapando caracteres HTML
 * @param {string} texto - Texto a sanitizar
 * @returns {string} Texto sanitizado
 */
function sanitizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

**Aplicar en main.gs línea 272**:
```javascript
// ANTES
obs: m.OBS || ''

// DESPUÉS
obs: sanitizarTexto(m.OBS || '')
```

**Aplicar en main.gs línea 269**:
```javascript
// ANTES
cliente: (m.CLIENTE || '').toUpperCase()

// DESPUÉS
cliente: normalizarString(m.CLIENTE || '')
```

**Aplicar en ventaNocturna.gs línea 262**:
```javascript
// ANTES
hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.RAZON_REAPERTURA)
  .setValue(data.razon.trim());

// DESPUÉS
hoja.getRange(filaIdx, CONFIG_VN.COLS_SESIONES.RAZON_REAPERTURA)
  .setValue(normalizarString(data.razon || ''));
```

---

## 📋 RESUMEN DE UBICACIONES EXACTAS Y ACCIONES

| # | Archivo | Línea | Función | Severidad | Acción |
|---|---------|-------|---------|-----------|--------|
| 1 | main.gs | 1752 | chequeo de sesiones | 🔴 CRÍTICA | Cambiar `APERTURA` → `HORA_APERTURA` |
| 2 | main.gs | 269 | agregarMovimientosAPI | 🟠 ALTA | Usar `normalizarString()` en lugar de `toUpperCase()` |
| 3 | main.gs | 268-271 | agregarMovimientosAPI | 🔴 CRÍTICA | Agregar validación de FECHA/TIPO/MONTO por índice |
| 4 | main.gs | 272 | agregarMovimientosAPI | 🟠 MEDIA | Sanitizar `obs` con `sanitizarTexto()` |
| 5 | movimientos.gs | 64-67 | registrar() | 🔴 CRÍTICA | Usar `validarMovimientoConSaldos()` en lugar de `validarMovimiento()` |
| 6 | movimientos.gs | 33-48 | generarNuevoID() | 🟠 ALTA | Agregar LockService para evitar race conditions |
| 7 | ventaNocturna.gs | 262 | vnReabrirSesion() | 🟠 MEDIA | Usar `normalizarString()` en razonReapertura |
| 8 | utils.gs | 151+ | (después) | 🔴 CRÍTICA | Crear función `validarMovimientoConSaldos()` |
| 9 | utils.gs | 32+ | (después) | 🟠 MEDIA | Crear función `sanitizarTexto()` |

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Corregir línea 1752 en main.gs (APERTURA → HORA_APERTURA)
- [ ] Agregar función `validarMovimientoConSaldos()` en utils.gs
- [ ] Modificar función `registrar()` en movimientos.gs para usar nueva validación
- [ ] Agregar función `sanitizarTexto()` en utils.gs
- [ ] Agregar función `validarMovimientoAPI()` en main.gs
- [ ] Reemplazar función `agregarMovimientosAPI()` en main.gs
- [ ] Modificar función `generarNuevoID()` en movimientos.gs para usar LockService
- [ ] Actualizar línea 269 en main.gs: `normalizarString()` en cliente
- [ ] Actualizar línea 272 en main.gs: `sanitizarTexto()` en obs
- [ ] Actualizar línea 262 en ventaNocturna.gs: `normalizarString()` en razonReapertura
- [ ] Realizar pruebas de concurrencia (ID generation)
- [ ] Realizar pruebas de API con datos inválidos

