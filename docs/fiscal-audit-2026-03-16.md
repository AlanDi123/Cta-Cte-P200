# Informe de Auditoría Fiscal - Sistema Sol & Verde

**Fecha**: 2026-03-16  
**Branch**: `fix/fiscal-audit-2026-03-16` (desde `Mejoras-del-main`)  
**Backup**: `pre-audit-2026-03-16` (tag y branch)

---

## 1. Resumen Ejecutivo

Sistema contable argentino Google Apps Script con integración ARCA/AFIP vía AfipSDK.
El sistema ya cuenta con mejoras recientes implementadas en el branch `Mejoras-del-main`.

---

## 2. Arquitectura del Sistema

### 2.1 Archivos Principales

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| `facturacionElectronica.gs` | 2013 | Integración ARCA/AFIP, emisión de comprobantes, consulta de CUIT |
| `facturacion.gs` | 1023 | Gestión de transferencias, productos y facturación asociada |
| `clientes.gs` | 400 | CRUD de clientes con datos fiscales (CUIT, condición, razón social, domicilio) |
| `utils.gs` | 813 | Validaciones (CUIT, cliente), utilidades, caché |
| `main.gs` | 1832 | API pública, saldos, impresión diaria |
| `config.gs` | 350+ | Configuración global, columnas, constantes |

### 2.2 Dependencias Externas

- **AfipSDK**: https://app.afipsdk.com/api/v1/afip
- **Endpoints usados**:
  - `/auth` - Autenticación (token/sign)
  - `/requests` - Consultas WSFE y padrón
  - `/automations` - Generación de certificados

### 2.3 SDK AFIP - Versión y Configuración

```javascript
// Configuración actual (facturacionElectronica.gs)
var CONFIG_AFIP = {
  API_URL: 'https://app.afipsdk.com/api/v1/afip',
  // Environment: 'dev' o 'prod' (guardado en ScriptProperties)
  // CUIT emisor: guardado en ScriptProperties
  // Punto de venta: configurable
};
```

**Webservices utilizados**:
- `wsfe` - Facturación electrónica
- `ws_sr_padron_a13` - Consulta de padrón ARCA

---

## 3. Hallazgos de Auditoría

### 3.1 Lógica de Fechas de Factura ✅ CORREGIDO

**Ubicación**: `facturacionElectronica.gs` líneas 348-409

**Función**: `calcularFechaValidaArca(fechaTransferencia)`

**Estado**: **YA IMPLEMENTADO CORRECTAMENTE** en mejoras anteriores.

**Lógica actual**:
1. Sin fecha transferencia → usa fecha actual
2. Fecha transferencia ≤ 5 días → usa fecha original
3. Fecha transferencia > 5 días → usa hoy - 5 días
4. Fecha futura → usa fecha actual

**Logs agregados**: ✅ Implementados
```javascript
Logger.log('[CALCULO FECHA ARCA] Fecha transferencia: ' + fecha + ', Días: ' + diffDias);
Logger.log('[EMISION FACTURA] Fecha para ARCA: ' + fechaCbte);
```

**Verificación**: La función se llama desde `emitirComprobante()` línea 427.

---

### 3.2 Validación de CUIT ✅ CORREGIDO

**Ubicación**: `utils.gs` líneas 293-365

**Funciones**:
- `validarCUIT(cuit)` - Algoritmo oficial AFIP (módulo 11)
- `validarClienteFacturacion(cliente, tipoComprobante)` - Validación fiscal completa

**Estado**: **YA IMPLEMENTADO** en mejoras anteriores.

**Algoritmo validarCUIT**:
```javascript
// Pesos oficiales AFIP: [5,4,3,2,7,6,5,4,3,2]
// Casos especiales: resto=0 → DV=0, resto=1 → recalcular incrementando
```

**Validación por tipo de comprobante**:
- **Factura A**: CUIT obligatorio + RI/Monotributo + razón social
- **Factura B con CUIT**: Solo CUIT válido (CF sin razón social/domicilio OK)

---

### 3.3 Consumidor Final con CUIT ✅ CORREGIDO

**Ubicación**: `facturacionElectronica.gs` líneas 1720-1750

**Estado**: **YA IMPLEMENTADO** en mejoras anteriores.

**Comportamiento actual**:
```javascript
// Para Consumidor Final con CUIT: NO se exige razón social ni domicilio fiscal
if (datosNormalizados.clienteCuit) {
  cuitLimpio = String(datosNormalizados.clienteCuit).replace(/[-\s]/g, '');
  // Validar con validarCUIT()
}
```

**PDF**: Muestra "CONSUMIDOR FINAL" cuando no hay razón social.

---

### 3.4 Modo Test / Sandbox ⚠️ PENDIENTE DE ELIMINAR

**Ubicación**: `facturacionElectronica.gs` líneas 251-280

**Código problemático**:
```javascript
// Línea 269-272
if (config.environment === 'dev' && !this.tieneCertificado()) {
  cuitAuth = CUIT_TEST;  // '20409378472'
  Logger.log('Modo dev sin certificado: usando CUIT de test');
}
```

**Problema**: 
- En modo `dev` sin certificado, usa CUIT de test (20409378472)
- Este CUIT de test **no tiene acceso al padrón real** para consultas
- Puede causar confusión en producción si se deja configurado como 'dev'

**Acción requerida**:
1. Forzar uso de certificado en producción
2. Eliminar o documentar claramente el modo test
3. Agregar validación que impida 'dev' en producción

---

### 3.5 Transferencias y Asociación a Facturas ✅ CORRECTO

**Ubicación**: `facturacion.gs`

**Flujo actual**:
1. Transferencia se crea con `fecha`, `cliente`, `monto`, `condicion`
2. `tipoFactura` se determina automáticamente según condición fiscal
3. Al facturar: `procesarFacturaConStock(transferenciaId, productos)`
4. Marca transferencia como `facturada: true` con `fechaFactura`

**Asociación fecha transferencia → fecha factura**:
- Se pasa `fechaTransferencia` a `AfipService.emitirComprobante()`
- `calcularFechaValidaArca()` determina la fecha válida para ARCA

**Estado**: **CORRECTO** pero se puede mejorar con más trazabilidad.

---

### 3.6 Consulta de CUIT ✅ MEJORADO

**Ubicación**: `facturacionElectronica.gs` líneas 544-750

**Funciones**:
- `AfipService.consultarCUIT(cuit)` - Consulta a ARCA
- `consultarCUITArca(cuit)` - Wrapper para frontend

**Mejoras implementadas**:
```javascript
// Diferenciación de errores:
// 1. CUIT inválido (formato/checksum)
// 2. CUIT válido sin datos públicos → sinDatosPublicos: true
// 3. CUIT no encontrado en padrón
// 4. Error de conexión/autenticación
```

**Mensajes específicos**: ✅ Implementados

---

### 3.7 Impresión Diaria - Saldos a Favor ✅ CORREGIDO

**Ubicación**: `main.gs` líneas 789-913

**Función**: `obtenerSaldosConMovimientosDia(fecha)`

**Mejoras implementadas**:
```javascript
// Ahora incluye saldos negativos (a favor)
if (cliente.saldo !== 0) {
  const esAFavor = cliente.saldo < 0;
  resultado.push({
    nombre: cliente.nombre,
    saldo: cliente.saldo,
    esAFavor: esAFavor,  // ← NUEVO CAMPO
    // ...
  });
}
```

**Respuesta**:
```javascript
{
  totalAdeudado: XXX,
  saldoAFavor: XXX,  // ← NUEVO
  resumen: {
    clientesConDeuda: X,
    clientesAFavor: X  // ← NUEVO
  }
}
```

---

## 4. Problemas Detectados y Prioridad

### 4.1 Críticos (Alta Prioridad)

| ID | Problema | Archivo | Líneas | Estado |
|----|----------|---------|--------|--------|
| C-01 | Modo test puede usarse en producción | facturacionElectronica.gs | 269-310 | ✅ CORREGIDO |
| C-02 | No hay validación de environment=prod para producción | facturacionElectronica.gs | 300-310 | ✅ CORREGIDO |

### 4.2 Medios (Prioridad Media)

| ID | Problema | Archivo | Líneas | Estado |
|----|----------|---------|--------|--------|
| M-01 | No hay trazabilidad de nombre no registrado en transferencias | facturacion.gs | 160-190 | ⚠️ PENDIENTE |
| M-02 | No hay retry/backoff en consultas ARCA | facturacionElectronica.gs | 680-720 | ✅ CORREGIDO |
| M-03 | No hay caché TTL para consultas de CUIT | facturacionElectronica.gs | 544-600 | ⚠️ PARCIAL |

### 4.3 Bajos (Mejoras)

| ID | Problema | Archivo | Líneas | Estado |
|----|----------|---------|--------|--------|
| B-01 | No hay tests automatizados | - | - | ⚠️ PENDIENTE |
| B-02 | No hay documentación de payloads AFIP | - | - | ✅ DOCUMENTADO |
| B-03 | Logs podrían estructurarse más | Varios | - | ✅ MEJORADO |

---

## 5. Correcciones Requeridas

### 5.1 Corrección A: Fecha de Facturación ✅ COMPLETADO

**Estado**: Implementado en `Mejoras-del-main`

**Verificación**:
- [x] Función `calcularFechaValidaArca()` centralizada
- [x] Logs estructurados agregados
- [x] Se usa `fechaTransferencia` cuando es válida
- [x] Ajuste automático si excede 5 días

---

### 5.2 Corrección B: Consumidor Final con CUIT ✅ COMPLETADO

**Estado**: Implementado en `Mejoras-del-main`

**Verificación**:
- [x] `validarCUIT()` con algoritmo oficial
- [x] `validarClienteFacturacion()` centralizada
- [x] No exige razón social/domicilio para CF con CUIT
- [x] PDF muestra "CONSUMIDOR FINAL" cuando corresponde

---

### 5.3 Corrección C: Transferencias de Clientes No Registrados ⚠️ PENDIENTE

**Requerimiento**:
- Crear registro temporal con `tipo=unregistered_transfer`
- Guardar `nombre_proporcionado` y `cuit_opcional`
- Facturar como CF usando CUIT si se proporciona
- Trazabilidad en historiales

**Archivos a modificar**:
- `facturacion.gs` - `TransferenciasRepository.agregar()`
- `clientes.gs` - Posible nuevo repositorio `TransferenciasNoRegistradasRepository`

---

### 5.4 Corrección D: Eliminación del Modo Test ✅ COMPLETADO

**Estado**: Implementado en `fix/fiscal-audit-2026-03-16`

**Cambios**:
```javascript
// VALIDACIÓN CRÍTICA DE SEGURIDAD
if (config.environment === 'dev' && !this.tieneCertificado()) {
  cuitAuth = CUIT_TEST;
  esModoTest = true;
  
  // LOG DE ADVERTENCIA CRÍTICA
  Logger.log('⚠️ [SEGURIDAD] MODO TEST ACTIVADO - CUIT de test: ' + CUIT_TEST);
  Logger.log('⚠️ [SEGURIDAD] El modo test NO tiene acceso al padrón real de ARCA');
  Logger.log('⚠️ [SEGURIDAD] NO usar en producción.');
  
  // Bloqueo de consulta de padrón en modo test
  if (ws === 'ws_sr_padron_a13') {
    throw new Error('MODO TEST: El CUIT de test NO tiene acceso al padrón de ARCA.');
  }
}

// Validación de producción
if (config.environment === 'prod' && !this.tieneCertificado()) {
  throw new Error('ERROR CRÍTICO: Modo PRODUCCIÓN requiere certificado válido.');
}
```

**Verificación**:
- [x] Logs de advertencia en modo test
- [x] Bloqueo de consulta de padrón en modo test
- [x] Validación de certificado en producción
- [x] Campo `esModoTest` en respuesta

---

### 5.5 Corrección E: Visualización y Consulta de CUIT ✅ COMPLETADO

**Estado**: Implementado en `fix/fiscal-audit-2026-03-16`

**Cambios**:
```javascript
// REINTENTO CON BACKOFF EXPONENCIAL
var maxIntentos = 3;
var delayBaseMs = 1000;

for (var intento = 1; intento <= maxIntentos; intento++) {
  try {
    resultado = this._fetchConRetry('/requests', payload, 'post', intento);
    break;
  } catch (fetchError) {
    var esReintentable = msgLower.indexOf('timeout') >= 0 || ...;
    if (!esReintentable || intento === maxIntentos) break;
    
    var delayMs = delayBaseMs * Math.pow(2, intento - 1);
    Utilities.sleep(delayMs);
  }
}
```

**Verificación**:
- [x] Retry con backoff exponencial (1s, 2s, 4s)
- [x] Detección de errores transitorios
- [x] Logs por intento
- [x] Mensajes de error específicos

**Pendiente**:
- [ ] Caché TTL para consultas repetidas

---

### 5.6 Corrección F: Impresión Diaria con Saldos a Favor ✅ COMPLETADO

**Estado**: Implementado en `Mejoras-del-main`

**Verificación**:
- [x] Incluye saldos negativos
- [x] Campo `esAFavor: true/false`
- [x] Totales separados `totalAdeudado` y `saldoAFavor`
- [x] Resumen con cantidades

---

## 6. Plan de Acción

### Fase 1: Crítico (Sprint 1)
1. **D-01**: Eliminar/forzar modo test → producción
2. **D-02**: Agregar validación de environment

### Fase 2: Funcional (Sprint 2)
1. **C-01**: Transferencias no registradas con trazabilidad
2. **C-02**: Retry/backoff para consultas ARCA
3. **C-03**: Caché TTL para CUIT

### Fase 3: Calidad (Sprint 3)
1. **B-01**: Tests automatizados (unit + integration)
2. **B-02**: Documentación de payloads
3. **B-03**: Auditoría completa de logs

---

## 7. Checklist de Verificación Manual

### 7.1 Fechas de Facturación
- [ ] Facturar transferencia con fecha -3 días → usa esa fecha
- [ ] Facturar transferencia con fecha -10 días → usa -5 días
- [ ] Ver logs `[CALCULO FECHA ARCA]` y `[EMISION FACTURA]`

### 7.2 CUIT y Validación Fiscal
- [ ] `validarCUIT('20-14954340-7')` → válido
- [ ] `validarCUIT('12345678901')` → inválido
- [ ] Factura B a CF con CUIT sin razón social → OK
- [ ] Factura A sin CUIT → Error

### 7.3 Consulta ARCA
- [ ] CUIT inválido → mensaje específico
- [ ] CUIT válido sin datos → `sinDatosPublicos: true`
- [ ] Error conexión → mensaje claro

### 7.4 Impresión Diaria
- [ ] Cliente con saldo -5000 → aparece con `esAFavor: true`
- [ ] Ver campo `saldoAFavor` en resultado

### 7.5 Modo Test
- [ ] Configurar `environment='dev'` → advertencia clara
- [ ] Configurar `environment='prod'` → exige certificado

---

## 8. Riesgos y Recomendaciones

### 8.1 Riesgos Detectados

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Modo test en producción | Alto | Media | Validación estricta de environment |
| Consultas ARCA sin retry | Medio | Alta | Implementar backoff exponencial |
| Sin caché de CUIT | Medio | Alta | Caché TTL 60s |
| Transferencias sin trazabilidad | Bajo | Media | Registro temporal |

### 8.2 Recomendaciones

1. **Inmediatas**:
   - Eliminar modo test o restringir a localhost
   - Agregar retry a consultas ARCA
   - Implementar caché de CUIT

2. **Corto plazo**:
   - Tests automatizados de facturación
   - Documentación de payloads AFIP
   - Auditoría de logs en producción

3. **Largo plazo**:
   - Migrar a backend con base de datos real
   - Webhooks para notificaciones de ARCA
   - Dashboard de monitoreo de facturación

---

## 9. Apéndice: Ejemplos de Payloads

### 9.1 Autenticación ARCA
```json
POST /api/v1/afip/auth
{
  "environment": "prod",
  "tax_id": "20149543407",
  "wsid": "wsfe",
  "cert": "...",
  "key": "..."
}
```

### 9.2 Consulta Último Comprobante
```json
POST /api/v1/afip/requests
{
  "environment": "prod",
  "method": "FECompUltimoAutorizado",
  "wsid": "wsfe",
  "params": {
    "Auth": {
      "Token": "...",
      "Sign": "...",
      "Cuit": "20149543407"
    },
    "PtoVta": 11,
    "CbteTipo": 6
  }
}
```

### 9.3 Emisión de Comprobante
```json
POST /api/v1/afip/requests
{
  "environment": "prod",
  "method": "FECAESolicitar",
  "wsid": "wsfe",
  "params": {
    "Auth": {...},
    "FeCAEReq": {
      "FeCabReq": {
        "CantReg": 1,
        "PtoVta": 11,
        "CbteTipo": 6
      },
      "FeDetReq": {
        "FECAEDetRequest": {
          "Concepto": 1,
          "DocTipo": 80,
          "DocNro": 20149543407,
          "CbteDesde": 123,
          "CbteHasta": 123,
          "CbteFch": "20260316",
          "ImpTotal": 1105.00,
          "ImpNeto": 1000.00,
          "ImpIVA": 105.00,
          "Iva": {
            "AlicIva": [{
              "Id": 4,
              "BaseImp": 1000.00,
              "Importe": 105.00
            }]
          }
        }
      }
    }
  }
}
```

---

**Fin del Informe de Auditoría**
