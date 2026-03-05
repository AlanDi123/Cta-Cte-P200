# Guía de Despliegue - Google Apps Script Standalone

## Resumen

Esta guía explica cómo copiar y pegar cada archivo del repositorio en el editor de Google Apps Script para desplegar la aplicación web.

---

## 📁 Archivos a Copiar

### Archivos Server-Side (.gs)

| # | Archivo | Nombre en Apps Script | Descripción |
|---|---------|----------------------|-------------|
| 1 | `main.gs` | `main.gs` | Backend principal + doGet + include |
| 2 | `config.gs` | `config.gs` | Configuración global |
| 3 | `utils.gs` | `utils.gs` | Utilidades comunes |
| 4 | `clientes.gs` | `clientes.gs` | Repository de clientes |
| 5 | `movimientos.gs` | `movimientos.gs` | Repository de movimientos |
| 6 | `indices_cache.gs` | `indices_cache.gs` | Sistema de caché e índices |
| 7 | `claude.gs` | `claude.gs` | Integración con Claude AI |
| 8 | `dashboard_metricas.gs` | `dashboard_metricas.gs` | Métricas del dashboard |
| 9 | `test.gs` | `test.gs` | Sistema de pruebas |
| 10 | `tests_unitarios.gs` | `tests_unitarios.gs` | Tests unitarios (34 tests) |
| 11 | `update.gs` | `update.gs` | Funciones de actualización |
| 12 | `vn_config.gs` | `vn_config.gs` | Configuración Venta Nocturna |
| 13 | `venta-nocturna/backend.gs` | `vn_backend.gs` | Backend Venta Nocturna |

### Archivos HTML

| # | Archivo | Nombre en Apps Script | Descripción |
|---|---------|----------------------|-------------|
| 1 | `SistemaSolVerde.html` | `SistemaSolVerde.html` | Interfaz principal |
| 2 | `diagnostico_sistema.html` | `diagnostico_sistema.html` | Diagnóstico del sistema |

### Archivos de Configuración

| # | Archivo | Nombre en Apps Script | Descripción |
|---|---------|----------------------|-------------|
| 1 | `appsscript.json` | `appsscript.json` | Manifiesto del proyecto |

---

## 🚀 Pasos de Despliegue

### Paso 1: Crear Nuevo Proyecto

1. Ir a [script.google.com](https://script.google.com)
2. Click en **"Nuevo proyecto"**
3. Cambiar el nombre del proyecto a **"Sistema Sol & Verde V18.0"**

### Paso 2: Copiar Archivos Server-Side (.gs)

Para cada archivo `.gs` de la lista anterior:

1. En el editor de Apps Script, click en **"+"** junto a **"Archivos"**
2. Seleccionar **"Script"**
3. Nombrar el archivo (ej: `main`)
4. Abrir el archivo `.gs` del repositorio
5. Copiar **TODO** el contenido
6. Pegar en el editor de Apps Script
7. Click en **"Guardar"** (Ctrl+S)

**Repetir para los 13 archivos .gs**

### Paso 3: Copiar Archivos HTML

#### SistemaSolVerde.html

1. En el editor de Apps Script, click en **"+"** junto a **"Archivos"**
2. Seleccionar **"HTML"**
3. Nombrar el archivo como `SistemaSolVerde`
4. Abrir `SistemaSolVerde.html` del repositorio
5. Copiar **TODO** el contenido
6. Pegar en el editor de Apps Script
7. Click en **"Guardar"**

#### diagnostico_sistema.html

1. En el editor de Apps Script, click en **"+"** junto a **"Archivos"**
2. Seleccionar **"HTML"**
3. Nombrar el archivo como `diagnostico_sistema`
4. Abrir `diagnostico_sistema.html` del repositorio
5. Copiar **TODO** el contenido
6. Pegar en el editor de Apps Script
7. Click en **"Guardar"**

### Paso 4: Actualizar Manifiesto (appsscript.json)

1. En el editor de Apps Script, click en **"Configuración"** (engranaje ⚙️)
2. Activar **"Mostrar archivo appsscript.json"**
3. Click en **"appsscript.json"** en la barra lateral
4. Reemplazar **TODO** el contenido con el `appsscript.json` del repositorio
5. Click en **"Guardar"**

**Scopes incluidos:**
- `spreadsheets` - Leer/escribir en Google Sheets
- `script.external_request` - Llamar APIs externas
- `drive` - Acceder a Drive para imágenes
- `script.scriptapp` - Crear triggers
- `userinfo.email` - Obtener email del usuario
- `userinfo.profile` - Información de perfil

### Paso 5: Configurar Spreadsheet

1. Abrir la Google Sheet que contiene los datos
2. Copiar el **ID del spreadsheet** (en la URL)
3. En Apps Script, ejecutar la función `inicializarSistema()`:
   - Seleccionar `inicializarSistema` en el dropdown superior
   - Click en **"Ejecutar"**
   - Autorizar permisos cuando se solicite
4. Verificar que el ID se guardó en las propiedades del script

### Paso 6: Ejecutar Tests

1. En Apps Script, seleccionar `ejecutarTestsUnitarios` en el dropdown
2. Click en **"Ejecutar"**
3. Verificar en el **registro de ejecución** (View → Executions):
   - ✅ Todos los tests deben pasar (>90%)
   - ❌ Si hay fallos, revisar los errores

### Paso 7: Probar la Aplicación

1. En Apps Script, click en **"Implementar"** → **"Nueva implementación"**
2. Click en **"Seleccionar tipo"** → **"Aplicación web"**
3. Configurar:
   - **Descripción**: `Versión 18.0`
   - **Ejecutar como**: `Yo (tu email)`
   - **Quién tiene acceso**: `Cualquier usuario` (o según política)
4. Click en **"Implementar"**
5. Autorizar permisos
6. Copiar la **URL de la aplicación web**
7. Abrir la URL en el navegador
8. Verificar que:
   - ✅ Splash screen aparece
   - ✅ Dashboard carga correctamente
   - ✅ Todos los menús funcionan

---

## 🔧 Funciones Clave para Probar

### Desde el Editor de Apps Script

```javascript
// 1. Inicializar sistema
inicializarSistema();

// 2. Ejecutar tests unitarios
ejecutarTestsUnitarios();

// 3. Probar carga de datos
probarSistema();

// 4. Verificar integridad
verificarIntegridadSistema();

// 5. Recalcular saldos (si es necesario)
recalcularTodosSaldos();
```

### Desde la Web App

1. **Dashboard**: Verificar que cargan movimientos recientes
2. **Visor de Clientes**: Buscar cliente y ver historial
3. **Estadísticas**: Verificar gráficos
4. **Impresión Diaria**: Probar impresión
5. **Gestión de Clientes**: Crear cliente de prueba
6. **Venta Nocturna**: Probar módulo (si se usa)

---

## 🐛 Solución de Problemas

### Error: "No se pudo acceder al spreadsheet"

**Solución:**
1. Ejecutar `inicializarSistema()` desde el editor
2. Verificar que la Sheet existe y es accesible
3. Checkear permisos de la Sheet

### Error: "Permission denied"

**Solución:**
1. Verificar que los scopes en `appsscript.json` son correctos
2. Re-autorizar la aplicación (Implementar → Nueva implementación)
3. Checkear que la Sheet está compartida con tu cuenta

### Error: "Function not found"

**Solución:**
1. Verificar que el archivo .gs fue copiado correctamente
2. Checkear que no hay errores de sintaxis
3. Ejecutar `inicializarSistema()` para registrar funciones

### La Web App no carga

**Solución:**
1. Verificar que `doGet()` está en `main.gs`
2. Checkear que `SistemaSolVerde.html` existe
3. Revisar el registro de ejecuciones para errores

### Error en include()

**Solución:**
1. Verificar que `diagnostico_sistema.html` existe
2. Checkear que el nombre del archivo es correcto (sin extensión en include())
3. Revisar que el HTML es válido

---

## 📊 Verificación Post-Despliegue

### Checklist de Verificación

- [ ] `doGet()` sirve la UI sin errores
- [ ] Splash screen aparece correctamente
- [ ] Dashboard carga movimientos
- [ ] Visor de Clientes funciona
- [ ] Búsqueda de clientes funciona
- [ ] Crear cliente funciona
- [ ] Editar movimiento funciona
- [ ] Eliminar movimiento funciona
- [ ] Recálculo de saldos funciona
- [ ] Impresión diaria funciona
- [ ] Tests unitarios pasan (>90%)
- [ ] Módulo Venta Nocturna carga (si se usa)

### Pruebas de Carga

1. **Cargar >1000 movimientos**: Verificar que no hay truncamiento
2. **Editar movimiento intermedio**: Verificar recálculo en cascada
3. **Eliminar movimiento**: Verificar actualización de saldos
4. **Imprimir**: Verificar que window.print() funciona

---

## 🔄 Actualización de Versión Existente

Si ya tienes una versión desplegada:

1. **Backup**:
   - Exportar Google Sheet a Excel/CSV
   - Descargar copia del proyecto Apps Script (Archivo → Descargar copia)

2. **Actualizar**:
   - Reemplazar archivos .gs uno por uno
   - Reemplazar SistemaSolVerde.html
   - Actualizar appsscript.json si hay nuevos scopes

3. **Nueva Versión**:
   - Implementar → Gestionar implementaciones
   - Click en versión activa → Editar
   - Cambiar a **"Nueva versión"**
   - Descripción: `Actualización V18.0`
   - Click en **"Implementar"**

4. **Rollback** (si hay problemas):
   - Implementar → Gestionar implementaciones
   - Click en versión activa → Ver historial de versiones
   - Seleccionar versión anterior → Restaurar

---

## 📝 Notas Importantes

### Límites de Apps Script

| Límite | Valor |
|--------|-------|
| Tiempo de ejecución (Web App) | 6 minutos |
| Tiempo de ejecución (Trigger) | 30 minutos |
| Lectura de celdas | 2 millones por ejecución |
| Escritura de celdas | 2 millones por ejecución |
| Llamadas UrlFetchApp | 20,000 por día |

### Mejores Prácticas

1. **Batch operations**: Usar `getValues()` y `setValues()` en lugar de celda por celda
2. **Cache**: Usar `PropertiesService` para caché de datos
3. **Logging**: Usar `Logger.log()` para debugging
4. **Errores**: Usar try-catch en todas las funciones públicas
5. **Validación**: Validar todos los inputs del usuario

### Imágenes y Assets

**Opción 1: Drive (Recomendado)**
1. Subir imagen a Google Drive
2. Compartir → "Cualquiera con el enlace"
3. Copiar `webContentLink`
4. Usar en HTML: `<img src="https://drive.google.com/uc?id=IMAGE_ID">`

**Opción 2: Base64 Inline**
1. Convertir imagen a base64
2. Insertar en HTML: `<img src="data:image/png;base64,...">`

---

## 🆘 Soporte

Para problemas específicos:

1. **Revisar logs**: View → Executions
2. **Ejecutar tests**: `ejecutarTestsUnitarios()`
3. **Verificar integridad**: `verificarIntegridadSistema()`
4. **Checkear permisos**: Implementar → Gestionar implementaciones

---

## ✅ Checklist Final de Despliegue

### Pre-Despliegue
- [ ] Todos los archivos .gs copiados (13 archivos)
- [ ] Todos los archivos .html copiados (2 archivos)
- [ ] appsscript.json actualizado con scopes
- [ ] `inicializarSistema()` ejecutado sin errores
- [ ] `ejecutarTestsUnitarios()` pasa (>90%)

### Despliegue
- [ ] Nueva implementación creada
- [ ] Ejecutar como: `USER_DEPLOYING`
- [ ] Acceso: `ANYONE` (o según política)
- [ ] URL de Web App copiada

### Post-Despliegue
- [ ] Splash screen funciona
- [ ] Dashboard carga
- [ ] Todas las funcionalidades probadas
- [ ] Tests de carga completados
- [ ] Documentación actualizada

---

**Versión**: 18.0
**Fecha**: Marzo 2026
**Autor**: Alan
