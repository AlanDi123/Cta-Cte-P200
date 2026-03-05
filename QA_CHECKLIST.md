# QA Checklist - Sistema Sol & Verde V18.0

## Checklist de Pruebas Manuales

### 1. Pruebas de Carga e Inicialización

- [ ] **Splash Screen Dual**
  - [ ] Animación de logo (2.5s) se reproduce correctamente
  - [ ] Botones "Venta Nocturna" 🌙 y "Sistema Puesto 200" 🏪 visibles
  - [ ] Hover effects en botones funcionan
  - [ ] Selección guarda en sessionStorage
  - [ ] Recargar página skip splash (si ya hay selección)

- [ ] **Carga Inicial**
  - [ ] Dashboard carga en <3 segundos
  - [ ] No hay errores en consola (F12)
  - [ ] Logo e iconos se muestran correctamente
  - [ ] Tema claro/oscuro funciona

### 2. Pruebas de Funcionalidades Principales

- [ ] **Dashboard**
  - [ ] Movimientos recientes se muestran
  - [ ] Saldos son correctos
  - [ ] Gráficos cargan correctamente
  - [ ] Botón "Probar Optimización" funciona

- [ ] **Visor de Clientes**
  - [ ] Lista de clientes carga
  - [ ] Búsqueda funciona (con debounce)
  - [ ] Al seleccionar cliente, muestra historial
  - [ ] Saludos son correctos

- [ ] **Estadísticas**
  - [ ] Gráficos cargan
  - [ ] Datos son correctos
  - [ ] Filtros de fecha funcionan

- [ ] **Impresión Diaria**
  - [ ] Vista previa de impresión se muestra
  - [ ] window.print() funciona
  - [ ] Ventana de impresión se cierra después

- [ ] **Gestión de Clientes**
  - [ ] Formulario de nuevo cliente funciona
  - [ ] Validaciones de campos funcionan
  - [ ] Cliente se guarda correctamente
  - [ ] Cliente aparece en la lista

### 3. Pruebas de Edición y Eliminación

- [ ] **Editar Movimiento**
  - [ ] Modal de edición se abre
  - [ ] Campos se pre-llenanan correctamente
  - [ ] Overlay de carga aparece durante actualización
  - [ ] No se pueden hacer dos ediciones simultáneas
  - [ ] Dashboard refleja cambios después de editar
  - [ ] Visor de Clientes muestra nuevo saldo
  - [ ] Impresión Diaria muestra saldos correctos

- [ ] **Eliminar Movimiento**
  - [ ] Confirmación de eliminación aparece
  - [ ] Overlay de carga aparece durante eliminación
  - [ ] No se pueden hacer dos eliminaciones simultáneas
  - [ ] Dashboard refleja cambios después de eliminar
  - [ ] Visor de Clientes muestra nuevo saldo
  - [ ] Recálculo en cascada funciona

### 4. Pruebas de Venta Nocturna (si aplica)

- [ ] **Carga del Módulo**
  - [ ] Módulo carga correctamente al seleccionar
  - [ ] Loading spinner visible durante carga
  - [ ] Sidebar de Venta Nocturna se muestra

- [ ] **Menús de Venta Nocturna**
  - [ ] Menú Ventas funciona
  - [ ] Menú Reportes funciona
  - [ ] Menú Cierre funciona
  - [ ] Menú Consultas funciona
  - [ ] Menú Parametrización funciona
  - [ ] Navegación entre menús funciona
  - [ ] "Volver al Inicio" funciona

### 5. Pruebas de Autocomplete de Proveedores

- [ ] **Búsqueda**
  - [ ] Búsqueda case-insensitive funciona
  - [ ] Sin duplicados en sugerencias
  - [ ] Resaltado de coincidencias funciona
  - [ ] Debounce de 250ms aplicado
  - [ ] Respuesta <200ms

- [ ] **Selección**
  - [ ] Click en sugerencia selecciona proveedor
  - [ ] Click fuera cierra sugerencias
  - [ ] Opción "Agregar nuevo" si no existe

### 6. Pruebas de Tests Unitarios

- [ ] **Ejecución desde Editor**
  - [ ] `ejecutarTestsUnitarios()` se ejecuta sin errores
  - [ ] Todos los tests pasan (>90% success rate)
  - [ ] Tests de utilitarios OK (normalizeName, debounce, fuzzySearch, capitalize, uniqueArray)
  - [ ] Tests de balances OK (cálculo DEBE/HABER)
  - [ ] Tests de integración OK

### 7. Pruebas de Carga y Rendimiento

- [ ] **Dataset Grande (>1000 movimientos)**
  - [ ] Dashboard carga en <5 segundos
  - [ ] No hay truncamiento de datos
  - [ ] Scroll funciona correctamente
  - [ ] Memoria no excede 100MB (DevTools)

- [ ] **Edición con Muchos Datos**
  - [ ] Editar movimiento con 1000+ filas funciona
  - [ ] Recálculo de saldos completa en <10 segundos
  - [ ] Overlay de carga se muestra durante todo el proceso

### 8. Pruebas de Consistencia de Datos

- [ ] **Saldos**
  - [ ] Saldos en Dashboard son correctos
  - [ ] Saldos en Visor de Clientes son correctos
  - [ ] Saldos en Impresión Diaria son correctos
  - [ ] No hay inconsistencias después de editar/eliminar

- [ ] **Race Conditions**
  - [ ] No se pueden hacer dos ediciones simultáneas
  - [ ] Intentar editar mientras se actualiza muestra mensaje de espera
  - [ ] Todas las vistas se actualizan después de cambio

### 9. Pruebas de Navegación

- [ ] **Menú Lateral**
  - [ ] Todos los ítems del menú son clickeables
  - [ ] Ítem activo se resalta correctamente
  - [ ] Atajos de teclado funcionan (Ctrl+1, Ctrl+2, etc.)
  - [ ] Menú colapsable funciona (si aplica)

- [ ] **Navegación entre Módulos**
  - [ ] Cambiar entre módulos funciona
  - [ ] Datos se mantienen en caché al volver
  - [ ] No hay errores al cambiar rápidamente

### 10. Pruebas de Errores

- [ ] **Manejo de Errores**
  - [ ] Errores de conexión se muestran correctamente
  - [ ] Errores de validación se muestran correctamente
  - [ ] Toast de error aparece con mensaje claro
  - [ ] Consola no muestra errores no manejados

---

## Comandos para Ejecutar en Editor

### Desde Apps Script Editor

```javascript
// 1. Inicializar sistema
inicializarSistema();

// 2. Ejecutar todos los tests unitarios
ejecutarTestsUnitarios();

// 3. Ejecutar tests por categoría
ejecutarTestsPorCategoria('utilitarios');
ejecutarTestsPorCategoria('balances');
ejecutarTestsPorCategoria('integracion');

// 4. Probar sistema optimizado
probarSistema();

// 5. Verificar integridad del sistema
verificarIntegridadSistema();

// 6. Recalcular todos los saldos (si es necesario)
recalcularTodosSaldos();

// 7. Diagnóstico completo (desde Web App)
window.ejecutarDiagnosticoCompleto();
```

---

## Criterios de Aceptación

### Funcionalidades Críticas (Debe Pasar 100%)

- [ ] Splash screen funciona
- [ ] Dashboard carga movimientos
- [ ] Visor de Clientes funciona
- [ ] Editar movimiento funciona
- [ ] Eliminar movimiento funciona
- [ ] Recálculo de saldos funciona
- [ ] Protección race conditions activa
- [ ] Tests unitarios pasan (>90%)

### Funcionalidades Secundarias (Debe Pasar 80%)

- [ ] Estadísticas cargan
- [ ] Impresión diaria funciona
- [ ] Autocomplete proveedores funciona
- [ ] Lazy-loading funciona
- [ ] Módulo Venta Nocturna carga

### Rendimiento (Target)

- [ ] Carga inicial <3 segundos
- [ ] Búsqueda autocomplete <200ms
- [ ] Edición movimiento <2 segundos
- [ ] Recálculo 100 clientes <5 segundos

---

## Reporte de Pruebas

### Resultados

| Categoría | Total | Pasadas | Fallidas | % |
|-----------|-------|---------|----------|---|
| Carga e Inicialización | 6 | - | - | -% |
| Funcionalidades Principales | 20 | - | - | -% |
| Edición y Eliminación | 12 | - | - | -% |
| Venta Nocturna | 8 | - | - | -% |
| Autocomplete | 6 | - | - | -% |
| Tests Unitarios | 4 | - | - | -% |
| Carga y Rendimiento | 6 | - | - | -% |
| Consistencia de Datos | 7 | - | - | -% |
| Navegación | 8 | - | - | -% |
| Errores | 4 | - | - | -% |
| **TOTAL** | **81** | **-** | **-** | **-%** |

### Issues Encontrados

| # | Descripción | Severidad | Estado |
|---|-------------|-----------|--------|
| 1 | - | - | - |

### Comentarios Adicionales

```
Espacio para comentarios adicionales del tester...
```

---

**Fecha de Prueba**: _______________

**Tester**: _______________

**Resultado Final**: ✅ APROBADO / ❌ RECHAZADO

**Firma**: _______________
