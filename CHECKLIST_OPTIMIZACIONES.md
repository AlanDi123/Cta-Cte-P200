# Checklist — Optimizaciones Sol & Verde

Marcar tras verificar en copia de desarrollo / Web App desplegada.

## Backend — rendimiento y fiabilidad

- [x] **1** `TransferenciasRepository.agregarMultiples`: inserción en lote (`setValues`) + un `getSiguienteId`
- [x] **2** `CajaRepository.guardarSesion`: un `setValues` con `conRetry` (sin bucle `appendRow`)
- [x] **12** `MovimientosRepository.obtenerRecientes(limite>0)`: lectura estricta últimas N filas
- [x] **13** `limpiarAuditoriaAntigua()` en hoja `AUDITORIA` (trigger manual en Apps Script)
- [x] **14** `crearBackupDiario()` en [backups.gs](backups.gs) + scope `drive` en [appsscript.json](appsscript.json)
- [x] **11** Reintentos AFIP: HTTP 5xx como reintentable en `afipFetchConRetry`; **6** caché `afipGetAuth` por WS (10 h)
- [x] **Fecha comprobante**: `fechaCbte` desde `_calcularFechaValidaArca` pasada a `afipEmitirFactura`
- [x] **10** Claude: regex ASCII, retry 429, montos/cliente filtrados tras parseo
- [x] **17** `registrarErrorCritico` → `AuditLogger` (módulo FRONTEND)
- [x] **8** `ajustarSaldoCliente` (delta) en [clientes.gs](clientes.gs) — movimientos ya ajustan saldo en editar/eliminar
- [x] **34** `validarCuitModulo11` en Factura A ([utils.gs](utils.gs), [facturacionElectronica.gs](facturacionElectronica.gs))
- [x] **36** `encolarFacturaPendienteARCA` ([facturacion.gs](facturacion.gs)) — hook automático no cableado (opcional)
- [x] **utils** `generarRespuesta`, `formatoPesos`, `calcularFechaFacturaPermitida`

## API arranque

- [x] **7** `obtenerDatosArranqueDashboard()` + [SistemaSolVerde.html](SistemaSolVerde.html) `cargarDatosDesdeServidor` + fallback `cargarDatosDesdeServidorLegacy`

## Frontend — librerías e infra

- [x] CDN: jQuery, DataTables, SweetAlert2, Day.js, DOMPurify, Toastify, Chart.js, Cleave, Font Awesome
- [x] `debounce` (ya existía); `DOM` / `initDomCache`; `mapaClientesGlobal` + `indexarClientes`
- [x] `llamarBackend` (Promise + `generarRespuesta` cuando el backend lo use)
- [x] `comprimirImagenParaIA`: Visual Reasoning + Escanear IA (comprobantes)
- [x] `window.onerror` → `registrarErrorCritico`; listener `offline` → Swal
- [x] DataTables: `#tablaMovimientos`, `#tablaGestionClientes` (destruir antes de redibujar)
- [x] `alert` → Swal (facturas B/A, detalle transferencia); Toastify vía `mostrarToast` si está cargado
- [x] Cleave en `#clienteCuit` al abrir modal cliente
- [x] Filtro clientes: `trim` + `toLowerCase` + `includes` (espacios)
- [x] Autoguardado caja: carga borrador sin toast (`_restaurarEstadoCaja(..., true)`)
- [x] `facturarIndividualAsync` / `procesarFacturasEnLote` para uso futuro o llamadas manuales
- [x] `trim` en guardado cliente (tel, email, obs)
- [x] Vibración breve al éxito emisión Factura A/B (si el dispositivo lo permite)

## Pendiente / N/A (documentado)

- [ ] **21** Caché ZIP clientes >100KB — no implementado (medir necesidad)
- [ ] **28** Soft delete global — fuera de alcance
- [ ] **29** Drive API avanzada para backup — usa `DriveApp`
- [ ] **39** `doGet` ya usa `ALLOWALL`; cambiar a `DENY` solo si no embebés la app
- [ ] **40** Auto-desconexión 30 min — no implementado
- [ ] **41** Arqueo ciego — no implementado
- [ ] **42** Bloqueo mes cerrado — no implementado
- [ ] **43** `createdRow` DataTables colores — parcial (CSS existente en tablas)
- [ ] **45** Fechas ISO en Sheets — ya parcialmente usado; Day.js solo cargado para uso futuro
- [ ] **50** Export jsPDF/DataTables buttons — no implementado
- [ ] **Corrección 5 PDF plantilla** — no hay `HtmlService.createTemplateFromFile` de PDF en repo; PDF vía SDK/URL si aplica

## Triggers sugeridos (Apps Script → Reloj)

1. Diario 02:00–03:00 — `limpiarAuditoriaAntigua`
2. Diario 02:30 — `crearBackupDiario`

Tras cambiar `appsscript.json`, **volver a autorizar** el proyecto (Drive).

## Pruebas manuales mínimas

1. Abrir Web App: splash, clientes, movimientos, config y estado API en un viaje.
2. Dashboard: tabla movimientos con paginación DataTables; editar/eliminar movimiento.
3. Gestión clientes: filtro con nombre con espacios; DataTables; Cleave en CUIT.
4. Cierre caja con muchas líneas: una escritura fluida.
5. Importar varias transferencias (IA/lote): IDs secuenciales y una escritura.
6. Emitir Factura B o A: Swal éxito, botón deshabilitado mientras emite, fecha retro ≤5 días.
7. (Opcional) Ejecutar `crearBackupDiario` y `limpiarAuditoriaAntigua` una vez en copia de prueba.
