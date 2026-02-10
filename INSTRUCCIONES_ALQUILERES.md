# 🔧 Solución al Error del Módulo de Alquileres

## ❌ Problema

Error: `Cannot read properties of undefined (reading 'map')`

## ✅ Causa y Solución

Los cambios en el código **YA están en GitHub**, pero **Google Apps Script no se sincroniza automáticamente con GitHub**. Necesitas copiar manualmente los archivos actualizados a tu proyecto de Google Apps Script.

## 📋 Pasos para Solucionar

### 1️⃣ Actualizar archivos en Google Apps Script

Debes copiar estos archivos desde GitHub a tu Google Apps Script Editor:

#### **Archivo 1: `alquileres.gs`**
- ✅ Ya existe en el repositorio
- Copiar contenido completo de: `/home/user/Cta-Cte-P200/alquileres.gs`
- Pegar en Google Apps Script Editor

#### **Archivo 2: `SistemaSolVerde.html`**
- ✅ Ya tiene las correcciones aplicadas
- Copiar contenido completo de: `/home/user/Cta-Cte-P200/SistemaSolVerde.html`
- Pegar en Google Apps Script Editor

#### **Archivo 3: `config.gs`**
- ✅ Ya tiene la configuración de alquileres
- Copiar contenido completo de: `/home/user/Cta-Cte-P200/config.gs`
- Pegar en Google Apps Script Editor

#### **Archivo 4: `utils.gs`**
- ✅ Ya existe con la función `serializarParaWeb()`
- Verificar que esté en Google Apps Script Editor

### 2️⃣ Ejecutar script de diagnóstico

1. Copiar el archivo `test_alquileres.gs` a Google Apps Script Editor
2. Ejecutar la función `testModuloAlquileres()`
3. Ver los resultados en **View > Logs** (Ctrl+Enter)
4. Verificar que todos los tests pasen ✅

### 3️⃣ Desplegar la aplicación web

1. En Google Apps Script Editor: **Deploy > New deployment**
2. Tipo: **Web app**
3. Description: "Actualización módulo alquileres"
4. Execute as: **Me**
5. Who has access: **Anyone** (o según tu preferencia)
6. Hacer clic en **Deploy**
7. Copiar la URL de la aplicación web

### 4️⃣ Probar el módulo

1. Abrir la URL de la aplicación web en el navegador
2. **Importante**: Hacer **Ctrl+Shift+R** (o Cmd+Shift+R en Mac) para forzar recarga sin caché
3. Ir al menú "Alquiler de Puestos"
4. Verificar que se carguen los inquilinos sin errores

## 🔍 Correcciones Aplicadas

### Corrección 1: Backend retorna `result.inquilinos`
```javascript
// En alquileres.gs
function obtenerDatosAlquileres() {
  return {
    success: true,
    inquilinos: serializarParaWeb(inquilinos),  // ← retorna "inquilinos"
    movimientosRecientes: serializarParaWeb(recientes)
  };
}
```

### Corrección 2: Frontend usa `result.inquilinos`
```javascript
// En SistemaSolVerde.html - CORREGIDO
const inquilinos = result.inquilinos;  // ✅ CORRECTO (antes era result.data)
```

### Corrección 3: Validación exhaustiva agregada
```javascript
// Validar que result existe
if (!result) {
  mostrarToast('Error: respuesta vacía del servidor', 'error');
  return;
}

// Validar que result.success es true
if (!result.success) {
  mostrarToast('Error: ' + result.error, 'error');
  return;
}

// Validar que inquilinos es un array
if (!result.inquilinos || !Array.isArray(result.inquilinos)) {
  console.error('Respuesta del servidor:', result);
  mostrarToast('Error: datos inválidos', 'error');
  return;
}
```

### Corrección 4: Función formatearNumero agregada
```javascript
// En SistemaSolVerde.html - línea ~3186
function formatearNumero(numero) {
  return (numero || 0).toLocaleString('es-AR');
}

// Usada en el módulo de alquileres para formatear montos:
// $${formatearNumero(inq.montoSemanal)}
// +$${formatearNumero(inq.ajusteObra)}
```

## 📊 Verificar que todo funcione

### Usando el script de diagnóstico:
```javascript
// En Google Apps Script Editor, ejecutar:
testModuloAlquileres()

// Deberías ver:
✅ Configuración OK
✅ Hojas OK
✅ Repository OK
✅ obtenerTodosInquilinos() OK
✅ obtenerDatosAlquileres() OK
✅ serializarParaWeb() OK
```

### En la consola del navegador:
1. Abrir DevTools (F12)
2. Ir a la pestaña "Console"
3. Cargar el módulo de alquileres
4. Si hay error, aparecerá: `Respuesta del servidor: {objeto con datos}`
5. Esto ayudará a identificar qué está retornando realmente el backend

## 🚨 Si persiste el error

1. **Verificar que los archivos estén actualizados en Google Apps Script**
   - Revisar que la línea 7694 de `SistemaSolVerde.html` diga `result.inquilinos`
   - Revisar que `alquileres.gs` esté completo (448 líneas)

2. **Limpiar caché del navegador**
   - Chrome: Ctrl+Shift+Del > Caché e imágenes
   - O usar ventana de incógnito

3. **Verificar permisos**
   - Asegurarse de que el script tenga permisos para acceder a Google Sheets

4. **Revisar logs de Google Apps Script**
   - View > Executions
   - Ver si hay errores en las ejecuciones

## 📝 Resumen de Commits

```
a618969 - Agregar función formatearNumero para módulo de alquileres
3320efc - Agregar instrucciones de solución para módulo de alquileres
1fb9203 - Agregar script de diagnóstico para módulo de alquileres
46c2bf3 - Agregar validación exhaustiva al módulo de alquileres
d631365 - Corregir bug en módulo de alquileres: result.data -> result.inquilinos
```

## 📞 ¿Necesitas ayuda?

Si después de seguir estos pasos el error persiste:
1. Ejecutar `testModuloAlquileres()` y copiar el resultado completo
2. Abrir la consola del navegador (F12) y copiar el error exacto
3. Verificar qué se muestra en `console.error('Respuesta del servidor:', result)`

---

**Estado del código**: ✅ Todas las correcciones aplicadas y pusheadas a GitHub
**Pendiente**: Sincronizar manualmente con Google Apps Script
