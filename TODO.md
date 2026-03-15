# ✅ TODO LIST - PLAN DE IMPLEMENTACIÓN

## ESTADO GENERAL
- **plan-implementacion:** 🔄 IN PROGRESS → ✅ DONE

---

## FASE 1: CRÍTICO (Semana 1)
### 1.1 Configuración y Validación de Claude

- [ ] **1.1.1** Corregir validación CONFIG.CLAUDE
  - Archivo: `config.gs`, `claude.gs`
  - Descripción: Validar que MODEL, API_URL, VERSION, MAX_TOKENS existan
  - Estimado: 1 hora
  - Dependencias: Ninguna
  
- [ ] **1.1.2** Agregar MAX_TOKENS y campos de timeout
  - Archivo: `config.gs`
  - Descripción: Agregar TIMEOUT_SECONDS, RETRY_ATTEMPTS
  - Estimado: 30 min
  - Dependencias: 1.1.1
  
- [ ] **1.1.3** Implementar manejo de timeout en Claude API
  - Archivo: `claude.gs` línea 44-220
  - Descripción: Validar tamaño imagen, retry con backoff exponencial
  - Estimado: 2 horas
  - Dependencias: 1.1.2, utils.conRetry()
  
- [ ] **1.1.4** Remover y proteger secrets
  - Archivos: Todos los .gs
  - Descripción: Auditar hardcoded credentials, usar PropertiesService
  - Estimado: 30 min
  - Dependencias: Ninguna
  
- [ ] **1.1.5** Mejorar manejo de errores HTTP (401/429/503)
  - Archivo: `claude.gs` línea 178-188
  - Descripción: Tabla de errores personalizados, retry automático
  - Estimado: 1 hora
  - Dependencias: 1.1.3

---

## FASE 2: DATOS (Semana 2)
### 2.1 Integridad y Validación de Datos

- [ ] **2.1.1** Validar y reparar saldos incoherentes
  - Archivo: `utils.gs` (nueva función), `main.gs`
  - Descripción: Función validarYRepararSaldos(), integrar en inicializarSistema()
  - Estimado: 2 horas
  - Dependencias: validarFecha()
  
- [ ] **2.1.2** Validación completa en agregarMovimientosAPI
  - Archivo: `main.gs` línea 260-300
  - Descripción: Usar validarMovimiento() para cada movimiento
  - Estimado: 1.5 horas
  - Dependencias: utils.validarMovimiento()
  
- [ ] **2.1.3** Generación de IDs únicos
  - Archivo: `utils.gs` (nueva función), `main.gs`
  - Descripción: Función generarIdMovimiento(), usar en agregarMovimientosAPI
  - Estimado: 1 hora
  - Dependencias: Ninguna
  
- [ ] **2.1.4** Sanitización de nombres clientes
  - Archivo: `utils.gs` (nueva función), `clientes.gs`
  - Descripción: Función sanitizarNombreCliente(), aplicar en crearCliente
  - Estimado: 1 hora
  - Dependencias: Ninguna
  
- [ ] **2.1.5** Validación de fechas mejorada
  - Archivo: `utils.gs` línea 115 (mejorar)
  - Descripción: Agregar opciones permitidaDiasSiguientes, permitidaDiasAnteriores
  - Estimado: 1 hora
  - Dependencias: Ninguna

---

## FASE 3: PERFORMANCE (Semana 3)
### 3.1 Optimización y Escalabilidad

- [ ] **3.1.1** Eliminar getDataRange() en loops
  - Archivos: `movimientos.gs`, `caja.gs`, `contabilidad.gs`
  - Descripción: Una lectura previa, procesamiento post
  - Estimado: 2 horas
  - Dependencias: Ninguna
  - Criterio: 1000+ movimientos < 2s
  
- [ ] **3.1.2** Implementar paginación en frontend
  - Archivo: `main.gs` función obtenerDatosParaHTML()
  - Descripción: Agregar parámetros pagina, porPagina, frontend scroll infinite
  - Estimado: 2 horas
  - Dependencias: Ninguna
  - Criterio: 5000+ clientes responsive
  
- [ ] **3.1.3** Usar RequestCache para lectura frecuente
  - Archivo: `utils.gs` (implementado), aplicaciones en main.gs
  - Descripción: Cache de búsquedas de clientes, invalidar post-escritura
  - Estimado: 1 hora
  - Dependencias: 2.1.x (operaciones de escritura)
  
- [ ] **3.1.4** Logging mejorado con contexto
  - Archivo: `utils.gs` (nueva función logError()), `main.gs` APIs
  - Descripción: Función logError(), incluir timestamp, email, action, stack
  - Estimado: 1.5 horas
  - Dependencias: Ninguna

---

## FASE 4: ROBUSTEZ (Semana 4)
### 4.1 Manejo de Errores y Casos Extremos

- [ ] **4.1.1** Wrapper global try-catch en doPost
  - Archivo: `main.gs` línea 71-160
  - Descripción: Función _ejecutarAccion(), helper _jsonError()
  - Estimado: 1.5 horas
  - Dependencias: 3.1.4
  
- [ ] **4.1.2** Lazy init de Spreadsheet
  - Archivo: `main.gs` línea 17-46
  - Descripción: Refactorizar getSpreadsheet() con closure
  - Estimado: 1 hora
  - Dependencias: Ninguna
  
- [ ] **4.1.3** Corrección de errores OCR comunes
  - Archivo: `utils.gs` (nueva función), `claude.gs`
  - Descripción: Función corregirOCRComun(), aplicar en validarMovimientos
  - Estimado: 1.5 horas
  - Dependencias: Ninguna
  
- [ ] **4.1.4** Auditoría y logging de cambios
  - Archivo: `auditoria.gs` (ya existe)
  - Descripción: Registrar creación/edición/eliminación, usuario, timestamp
  - Estimado: 1 hora
  - Dependencias: 3.1.4

---

## TESTING Y VALIDACIÓN

- [ ] **TEST-1** Validación CONFIG
  - Ejecutar: `test_alquileres.gs` chequeo CONFIG
  - Resultado esperado: CONFIG completo, sin errores
  
- [ ] **TEST-2** APIs con datos válidos
  - Ejecutar: agregarMovimientosAPI() con 100 movimientos válidos
  - Resultado esperado: Todos insertados, saldos coherentes
  
- [ ] **TEST-3** Validación de entrada
  - Ejecutar: APIs con datos inválidos (nombres especiales, fechas futuras)
  - Resultado esperado: Rechazado con error claro
  
- [ ] **TEST-4** Performance
  - Ejecutar: Consulta con 1000+ movimientos
  - Resultado esperado: < 2 segundos respuesta
  
- [ ] **TEST-5** Claude API timeout
  - Ejecutar: analizarImagen() con imagen 10MB
  - Resultado esperado: Rechazado antes de enviar, sin colgar
  
- [ ] **TEST-6** Recuperación de errores
  - Ejecutar: doPost() con JSON inválido
  - Resultado esperado: JSON error válido, código HTTP correcto

---

## DEPLOYMENT

- [ ] **DEPLOY-1** Backup completo
  - Ejecutar: generarBackupCompleto()
  - Validar: Archivo en Drive
  
- [ ] **DEPLOY-2** Validación antes de publicar
  - Ejecutar: ejecutarValidacionCompleta()
  - Validar: Todos ✅
  
- [ ] **DEPLOY-3** Publicar Web App
  - Acción: Deploy > Nueva implementación
  - Verificar: Acceso configurado correctamente
  
- [ ] **DEPLOY-4** Monitoreo post-deployment
  - Validar: Logs en Stackdriver por 1 hora
  - Buscar: Errores, timeouts, anomalías
  
- [ ] **DEPLOY-5** Test manual
  - Realizar: Flujos principales (crear movimiento, cliente, etc.)
  - Validar: Datos no duplicados, saldos correctos

---

## NOTAS Y OBSERVACIONES

### Dependencias Externas
- ✅ Google Apps Script V8 Runtime
- ✅ Anthropic Claude API (requiere API Key)
- ✅ Google Sheets API
- ✅ PropertiesService para secrets

### Riesgos Conocidos
1. **Timeout de Claude:** Imágenes > 5MB pueden fallar
   - Mitigación: Validar tamaño antes de enviar, reducir a JPEG
   
2. **Límite de rate Claude:** 429 si se exceden solicitudes
   - Mitigación: Implementar retry con backoff, logging

3. **Inconsistencia de datos:** Ediciones concurrentes
   - Mitigación: Validar saldos post-operación, usar IDs únicos

4. **Performance:** Spreadsheet con 10,000+ filas
   - Mitigación: Paginación, caching, índices

### Documentación Generada
- ✅ PLAN_IMPLEMENTACION.md - Plan detallado
- ✅ TODO.md - Este archivo
- ✅ Código comentado en cada función mejorada

---

## ESTADO FINAL

**Cuando TODAS las tareas estén completas:**
- ✅ Sistema estable en producción
- ✅ Datos íntegros y validados
- ✅ Performance escalable
- ✅ Errores manejados robustamente
- ✅ Documentado y auditado

**Cambiar estado:**
```
plan-implementacion: ✅ DONE
```

