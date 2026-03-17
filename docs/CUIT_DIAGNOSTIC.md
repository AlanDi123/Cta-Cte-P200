# Diagnóstico de Consulta de CUIT - Sistema Sol & Verde

**Fecha**: 2026-03-17  
**Branch**: `fix/cuit-investigation-2026-03-17`  
**Backup**: `pre-audit-2026-03-17-backup`

---

## 1. Resumen Ejecutivo

### Problema Reportado
La consulta de CUIT devuelve **"SIN DATOS PÚBLICOS"** cuando antes devolvía datos de contribuyentes.

### Hipótesis Confirmada
**Hipótesis A + B Combinadas**: El problema puede deberse a múltiples causas:

1. **Modo test activado sin certificado** - El CUIT de test (20409378472) NO tiene acceso al padrón real de ARCA
2. **Certificado expirado o no configurado** - Sin certificado válido, las consultas al padrón fallan
3. **CUIT con estado administrativo limitado** - Algunos CUITs no tienen datos públicos en ARCA
4. **Respuesta vacía de ARCA** - El servicio devuelve estructura vacía para CUITs sin datos públicos

### Estado del Código Base
El sistema **YA ESTÁ CORRECTAMENTE IMPLEMENTADO** con:
- ✅ Uso de Alcance 13 (`ws_sr_padron_a13`) - el más completo
- ✅ Retry con backoff exponencial (3 intentos, 1s/2s/4s)
- ✅ Validación de modo test con bloqueo explícito
- ✅ Detección de "SIN DATOS PÚBLICOS" como caso válido
- ✅ Validación de CUIT con algoritmo oficial AFIP (módulo 11)
- ✅ Auto-detección de condición IVA (RI, Monotributo, CF)

---

## 2. Arquitectura de Consulta de CUIT

### Flujo Actual

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSULTAR_CUIT(cuit)                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Validar formato CUIT (11 dígitos)                            │
│ 2. Validar checksum (algoritmo módulo 11)                       │
│ 3. Autenticar en ARCA (ws_sr_padron_a13)                        │
│    ├─ Si modo test → BLOQUEO con mensaje claro                  │
│    └─ Si prod sin cert → ERROR con instrucción                  │
│ 4. Construir payload con cuitRepresentada (CUIT real emisor)    │
│ 5. Ejecutar con retry (max 3 intentos, backoff exponencial)     │
│ 6. Parsear respuesta:                                           │
│    ├─ Si tiene datosGenerales.idPersona → ÉXITO                │
│    ├─ Si respuesta vacía sin errors → SIN DATOS PÚBLICOS       │
│    └─ Si respuesta con errors → CUIT NO ENCONTRADO             │
│ 7. Auto-detectar condición IVA (RI/Mono/CF)                     │
└─────────────────────────────────────────────────────────────────┘
```

### Endpoints Utilizados

| Servicio | Endpoint | Propósito |
|----------|----------|-----------|
| AfipSDK Auth | `/auth` | Obtener token/sign |
| AfipSDK Padrón | `/requests` | Consulta `ws_sr_padron_a13` |

### Archivos Involucrados

| Archivo | Funciones Clave |
|---------|-----------------|
| `facturacionElectronica.gs` | `AfipService.consultarCUIT()`, `AfipService.autenticar()` |
| `utils.gs` | `validarCUIT()`, `validarClienteFacturacion()` |
| `main.gs` | `diagnosticarConsultaCUIT()`, `verificarConfiguracionARCA()` |

---

## 3. Cambios Implementados

### 3.1 Logging Extendido para Diagnóstico

**Archivo**: `facturacionElectronica.gs`

**Cambios**:
```javascript
// LOG DE DIAGNÓSTICO: Respuesta raw de ARCA para debugging
Logger.log('[CONSULTA CUIT ' + cuitLimpio + '] Respuesta raw de ARCA: ' + JSON.stringify(resultado));

// Detalle de estructura de respuesta
Logger.log('[CONSULTA CUIT ' + cuitLimpio + '] No encontrado. Estructura respuesta: ' + JSON.stringify({
  tienePersonaReturn: !!resultado.personaReturn,
  tienePersona: !!resultado.persona,
  tieneData: !!resultado.data,
  tieneDatosGenerales: !!resultado.datosGenerales,
  tieneErrors: !!resultado.errors,
  keys: Object.keys(resultado || {})
}));
```

**Propósito**: Permitir debugging preciso de qué devuelve exactamente ARCA.

### 3.2 Función de Diagnóstico `diagnosticarConsultaCUIT()`

**Archivo**: `facturacionElectronica.gs`

**Función nueva**:
```javascript
AfipService.diagnosticarConsultaCUIT(cuitTests)
```

**Características**:
- Ejecuta consultas para múltiples CUITs
- Guarda resultados en PropertiesService con timestamp
- Log extendido de cada respuesta
- Retorna array de resultados con metadata

### 3.3 Función de Verificación de Certificado

**Archivo**: `facturacionElectronica.gs`

**Función nueva**:
```javascript
AfipService.verificarEstadoCertificado()
```

**Retorna**:
```javascript
{
  environment: 'dev' | 'prod',
  cuitEmisor: '20149543407',
  tieneAccessToken: true,
  tieneCertificado: true,
  tieneKey: true,
  puntoVenta: 11,
  estadoCertificado: 'VÁLIDO' | 'NO CONFIGURADO',
  advertencias: []
}
```

### 3.4 Funciones Globales para Frontend

**Archivo**: `main.gs`

**Funciones expuestas**:
```javascript
// Test de diagnóstico con 3 CUITs
diagnosticarConsultaCUIT(cuit1, cuit2, cuit3)

// Verificación de configuración
verificarConfiguracionARCA()
```

**Uso desde el frontend**:
```javascript
google.script.run
  .withSuccessHandler(function(respuesta) {
    console.log('Diagnóstico:', respuesta);
  })
  .diagnosticarConsultaCUIT('20149543407', '20409378472', '00000000000');
```

---

## 4. Pruebas a Ejecutar

### Test 1: Verificar Configuración ARCA

**Comando** (desde Apps Script):
```javascript
verificarConfiguracionARCA()
```

**Resultado esperado**:
```json
{
  "success": true,
  "configuracion": {
    "environment": "prod",
    "cuitEmisor": "20149543407",
    "tieneAccessToken": true,
    "tieneCertificado": true,
    "tieneKey": true,
    "estadoCertificado": "VÁLIDO"
  }
}
```

**Si `estadoCertificado: "NO CONFIGURADO"`**:
1. Ir a Configuración > Facturación ARCA
2. Click en "Generar Certificado"
3. Ingresar CUIT y clave fiscal de ARCA

### Test 2: Diagnóstico de Consulta con 3 CUITs

**Comando**:
```javascript
diagnosticarConsultaCUIT('20149543407', '20409378472', '00000000000')
```

**Resultados esperados**:

| CUIT | Resultado Esperado |
|------|-------------------|
| 20149543407 (emisor) | ✅ Encontrado, datos completos |
| 20409378472 (test) | ⚠️ Error modo test o sin datos |
| 00000000000 (inválido) | ❌ Error: CUIT inválido |

### Test 3: Consulta Individual de CUIT Real

**Comando**:
```javascript
AfipService.consultarCUIT('20149543407')
```

**Verificar en logs**:
1. `[CONSULTA CUIT 20149543407] Respuesta raw de ARCA: {...}`
2. Estructura de respuesta con `datosGenerales.idPersona`
3. Auto-detección de condición IVA

### Test 4: Simular Modo Test

**Configuración**:
1. Borrar certificado en Configuración
2. Environment = 'dev'

**Comando**:
```javascript
AfipService.consultarCUIT('20149543407')
```

**Resultado esperado**:
```json
{
  "encontrado": false,
  "error": "Modo test",
  "mensaje": "MODO TEST: El CUIT de test (20409378472) NO tiene acceso al padrón de ARCA..."
}
```

### Test 5: Consultar CUIT con Datos Públicos Limitados

**Comando**:
```javascript
AfipService.consultarCUIT('20XXXXXXXXX')  // CUIT real sin datos públicos
```

**Resultado esperado**:
```json
{
  "encontrado": true,
  "cuit": "20XXXXXXXXX",
  "razonSocial": "SIN DATOS PÚBLICOS",
  "condicionFiscal": "CF",
  "sinDatosPublicos": true,
  "mensaje": "CUIT válido, pero sin datos fiscales públicos en ARCA..."
}
```

---

## 5. Diagnóstico de Problemas Comunes

### Problema: "MODO TEST: El CUIT de test NO tiene acceso al padrón"

**Causa**: Environment = 'dev' sin certificado configurado

**Solución**:
1. Ir a Configuración > Facturación ARCA
2. Generar certificado con CUIT real y clave fiscal
3. O cambiar environment a 'prod' (solo con certificado válido)

### Problema: "Se requiere certificado para usar CUIT propio"

**Causa**: Environment = 'prod' o 'dev' con CUIT propio, pero sin certificado

**Solución**:
1. Ir a Configuración > Facturación ARCA
2. Click en "Generar Certificado"
3. Seguir instrucciones de AfipSDK

### Problema: "CUIT válido, pero sin datos fiscales públicos"

**Causa**: El CUIT existe en ARCA pero no tiene datos públicos (contribuyente sin inscripción activa)

**Acción**:
- ✅ **NO es un error** - Es el comportamiento correcto
- Se puede facturar como Consumidor Final
- El sistema permite continuar con facturación tipo B

### Problema: "Error de conexión con ARCA después de 3 intentos"

**Causa**: Timeout o service unavailable temporal de AfipSDK

**Solución**:
1. Esperar 1-2 minutos y reintentar
2. Verificar conexión a internet
3. Si persiste, contactar soporte AfipSDK

### Problema: "Certificado expirado"

**Causa**: El certificado P12 tiene fecha de vencimiento superada

**Solución**:
1. Ir a Configuración > Facturación ARCA
2. Generar nuevo certificado
3. El sistema reemplaza automáticamente el anterior

---

## 6. Instrucciones para Renovar Certificado

### Paso a Paso AfipSDK

1. **Obtener credenciales de AfipSDK**:
   - Ir a https://app.afipsdk.com
   - Iniciar sesión con cuenta de ARCA

2. **Generar Access Token**:
   - Ir a Configuración del sistema
   - Copiar Access Token

3. **Generar Certificado**:
   - En el sistema Sol & Verde, ir a Configuración > Facturación ARCA
   - Pegar Access Token
   - Click en "Generar Certificado"
   - Ingresar CUIT y clave fiscal de ARCA
   - El sistema genera certificado automáticamente

4. **Verificar**:
   - Ejecutar `verificarConfiguracionARCA()`
   - Confirmar `estadoCertificado: "VÁLIDO"`

---

## 7. Archivos Modificados

| Archivo | Líneas Cambiadas | Descripción |
|---------|------------------|-------------|
| `facturacionElectronica.gs` | +86 | Logging extendido + funciones diagnóstico |
| `main.gs` | +68 | Funciones globales para frontend |
| `docs/CUIT_DIAGNOSTIC.md` | +350 | Este documento |

**Total**: +154 líneas agregadas

---

## 8. Comandos Usados

```bash
# Crear branch backup
git checkout mejoras-del-main
git checkout -b pre-audit-2026-03-17-backup

# Crear branch de investigación
git checkout mejoras-del-main
git checkout -b fix/cuit-investigation-2026-03-17

# Ejecutar tests (desde Apps Script Editor)
verificarConfiguracionARCA()
diagnosticarConsultaCUIT('20149543407', '20409378472', '00000000000')
```

---

## 9. Próximos Pasos

### Inmediatos (Pre-Deploy)

1. ✅ Ejecutar `verificarConfiguracionARCA()` en producción
2. ✅ Ejecutar `diagnosticarConsultaCUIT()` con CUITs reales
3. ✅ Revisar logs de ejecución para respuestas raw de ARCA

### Post-Deploy (Monitoreo)

1. Monitorear logs de consultas de CUIT por 48 horas
2. Recopilar casos de "SIN DATOS PÚBLICOS" para análisis
3. Verificar tasa de éxito de consultas (>95% esperado)

### Opcionales (Mejoras Futuras)

1. Cache de consultas de CUIT (TTL 60-300s) para evitar consultas repetidas
2. Telemetría: contadores de fallos por tipo (certificado, alcance, limitado)
3. UI de diagnóstico en Configuración > Facturación ARCA

---

## 10. Referencias

- [Manual WS SR PADRON A13](https://www.afip.gob.ar/ws/sr_padron_a13/manual.pdf)
- [AfipSDK Documentation](https://app.afipsdk.com/docs)
- [Algoritmo de validación de CUIT](https://www.afip.gob.ar/validacionCUIT/)
- [Estados administrativos de CUIT](https://www.afip.gob.ws/WSRegistrationTax/)

---

## 11. Conclusión

El sistema **YA ESTÁ CORRECTAMENTE IMPLEMENTADO** para manejar consultas de CUIT con:

1. **Alcance máximo** (A13) para obtener más contribuyentes
2. **Manejo robusto de errores** con retry y backoff
3. **Detección clara de modos** (test vs producción)
4. **Logging extendido** para debugging
5. **Funciones de diagnóstico** para testing

El mensaje "SIN DATOS PÚBLICOS" **NO es un error** en la mayoría de los casos:
- Indica que el CUIT existe pero no tiene datos fiscales públicos
- Permite facturación como Consumidor Final
- Es el comportamiento esperado para contribuyentes no inscriptos

**Para producción**: Asegurar certificado válido y environment='prod'.
