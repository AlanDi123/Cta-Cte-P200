# API REST - Sol y Verde POS

## 🚀 Configuración

### 1. Desplegar como Web App
1. En Google Apps Script, ir a **Deploy > New deployment**
2. Seleccionar tipo: **Web app**
3. Configurar:
   - **Execute as**: Me (tu cuenta)
   - **Who has access**: Anyone (o según tu preferencia de seguridad)
4. Click **Deploy**
5. Copiar la URL de la Web App (será tu endpoint base)

### 2. URL Base
```
https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec
```

### 3. Configuración del Sistema (NUEVO ✨)

El sistema **Sol & Verde** ahora cuenta con un **módulo de configuración completo** que permite personalizar prácticamente TODO el sistema sin necesidad de un programador.

#### Acceder al Menu de Configuración
1. Abrir la aplicación web
2. Ir al menú lateral → **⚙️ Configuracion**
3. Todas las configuraciones están organizadas en secciones

#### Configuraciones Disponibles

##### 🏢 Información del Sistema
- **Nombre del Sistema**: Personaliza el nombre que aparece en la aplicación
- **URL del Logo**: URL de la imagen del logo (se actualiza en tiempo real)
- **Carpeta de Backups**: Nombre de la carpeta en Google Drive para backups

##### 💰 Límites y Valores por Defecto
- **Límite de Crédito**: Límite asignado automáticamente a nuevos clientes
- **Saldo Inicial**: Saldo con el que inician los nuevos clientes

##### 📄 Paginación
- **Tamaño de Página**: Número de registros por página (1-100)
- **Tamaño Máximo**: Límite máximo de registros por página (1-500)

##### 💵 Configuración de IVA
- **Porcentaje de IVA**: Alícuota de IVA aplicada (ej: 10.5, 21)
- **ID de Alícuota ARCA**: ID según tabla ARCA (3=0%, 4=10.5%, 5=21%, 6=27%)

##### 🤖 Configuración de Claude AI
- **Modelo de Claude**: Modelo usado para OCR/Visual Reasoning
- **Máximo de Tokens**: Tokens máximos en respuestas (100-100000)

##### 🔍 Búsqueda Fuzzy (Avanzado)
- **Score Mínimo**: Umbral mínimo para sugerencias (0-100)
- **Máximo de Sugerencias**: Cantidad máxima de sugerencias (1-20)
- **Pesos de Búsqueda**: Configurar pesos para coincidencia exacta, comienza con, contiene, y Levenshtein

##### 🏠 Inquilinos (Alquileres)
- **Lista de Inquilinos**: Inquilinos separados por comas (MAYÚSCULAS)
- Ejemplo: `ORTIZ JESUS, FLORES FLORIBEL, GONZALEZ MARIA`

##### 🔑 Credenciales y Datos Fiscales
- **API Key de Claude**: Para Visual Reasoning (OCR)
- **Datos del Emisor**: CUIT, Razón Social, Domicilio, etc.
- **Configuración ARCA**: Access Token, Punto de Venta, Certificado

##### 🛠️ Herramientas
- **Recalcular Saldos**: Recalcula todos los saldos de clientes
- **Exportar CSV**: Exporta datos en formato CSV
- **Limpiar Cache**: Limpia el cache del navegador
- **Restaurar Config por Defecto**: Vuelve a valores por defecto (mantiene credenciales)

#### Guardar Configuración
- Cada sección tiene su propio botón **"Guardar"**
- Los cambios se aplican inmediatamente
- Las configuraciones se guardan en **ScriptProperties** (persistentes)

#### Restaurar a Valores por Defecto
Si necesitas volver a la configuración original:
1. Ir a **Herramientas** → **"↺ Restaurar Config por Defecto"**
2. Confirmar la acción
3. **NOTA**: Se mantienen todas las credenciales (API Keys, datos fiscales, config ARCA)

---

## 📡 Endpoints Disponibles

### GET - Verificar Estado
**URL**: `{URL_BASE}?action=status`

**Respuesta**:
```json
{
  "success": true,
  "status": "POS Sol y Verde API activa",
  "version": "2.0.0",
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

---

### GET - Obtener Clientes
**URL**: `{URL_BASE}?action=getClients`

**Respuesta**:
```json
{
  "success": true,
  "data": [
    {
      "NOMBRE": "JUAN PEREZ",
      "TEL": "123456789",
      "EMAIL": "juan@example.com",
      "CUIT": "20-12345678-9",
      "SALDO": 5000,
      "LIMITE": 10000,
      "CONDICION_FISCAL": "Consumidor Final",
      "RAZON_SOCIAL": "",
      "DOMICILIO_FISCAL": "",
      "OBS": ""
    }
  ],
  "total": 1,
  "timestamp": "2026-02-10T12:00:00.000Z"
}
```

---

### GET - Exportar Datos Completos (Para POS)
**URL**: `{URL_BASE}?action=exportData`

**Descripción**: Exporta TODOS los datos del sistema (clientes, movimientos, transferencias) para sincronización con POS externo.

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "version": "2.0.0",
    "fechaBackup": "2026-02-10T15:30:00.000Z",
    "clientes": [...],
    "movimientos": [...],
    "transferencias": [...],
    "emisor": {
      "cuit": "20-12345678-9",
      "razonSocial": "Sol y Verde SA"
    },
    "estadisticas": {
      "totalClientes": 150,
      "totalMovimientos": 5420,
      "totalTransferencias": 320,
      "totalAdeudado": 450000
    }
  },
  "timestamp": "2026-02-10T15:30:00.000Z"
}
```

**Uso**: Ideal para sincronizar el POS externo con los datos actuales del sistema.

---

### GET - Obtener Último Backup
**URL**: `{URL_BASE}?action=getLatestBackup`

**Descripción**: Recupera el último backup guardado en Google Drive.

**Respuesta**:
```json
{
  "success": true,
  "fileName": "backup_pos_2026-02-10_153045.json",
  "fileId": "1abc...xyz",
  "dateCreated": "2026-02-10T15:30:45.000Z",
  "data": {
    "version": "2.0.0",
    "fechaBackup": "2026-02-10T15:30:45.000Z",
    "clientes": [...],
    "movimientos": [...],
    "transferencias": [...]
  }
}
```

**Error (sin backups)**:
```json
{
  "success": false,
  "error": "No hay backups disponibles"
}
```

---

### POST - Guardar Backup
**URL**: `{URL_BASE}`

**Headers**:
```
Content-Type: application/json
```

**Body (Opción 1 - Backup automático del sistema)**:
```json
{
  "action": "saveBackup",
  "data": {}
}
```

**Body (Opción 2 - Backup con datos personalizados)**:
```json
{
  "action": "saveBackup",
  "data": {
    "clientes": [...],
    "movimientos": [...],
    "customData": "..."
  }
}
```

**Respuesta**:
```json
{
  "success": true,
  "fileName": "backup_pos_2026-02-10_153045.json",
  "fileId": "1abc...xyz",
  "backupsMantenidos": 30,
  "backupsEliminados": 5
}
```

**Características**:
- Si `data` está vacío, se genera automáticamente un backup completo del sistema
- Los backups se guardan en Google Drive en la carpeta "Backup Sistema POS"
- Se mantienen automáticamente solo los últimos 30 backups
- Los backups antiguos se eliminan automáticamente

---

### POST - Agregar Transferencias
**URL**: `{URL_BASE}`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "action": "addTransfers",
  "data": [
    {
      "FECHA": "2026-02-10",
      "CLIENTE": "JUAN PEREZ",
      "MONTO": 15000,
      "BANCO": "Banco Galicia",
      "CONDICION": "Consumidor Final",
      "TIPO_FACTURA": "B",
      "OBS": "Transferencia desde POS"
    }
  ]
}
```

**Respuesta**:
```json
{
  "success": true,
  "count": 1,
  "exitosos": 1,
  "errores": 0,
  "detalleErrores": []
}
```

**Campos**:
- `FECHA` (string, requerido): Fecha en formato "YYYY-MM-DD"
- `CLIENTE` (string, requerido): Nombre del cliente (se convertirá a mayúsculas)
- `MONTO` (number, requerido): Monto de la transferencia
- `BANCO` (string, opcional): Banco de origen
- `CONDICION` (string, opcional): "Consumidor Final" o "Responsable Inscripto"
- `TIPO_FACTURA` (string, opcional): "A", "B", "C"
- `OBS` (string, opcional): Observaciones

---

### POST - Agregar Movimientos
**URL**: `{URL_BASE}`

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "action": "addMovements",
  "data": [
    {
      "FECHA": "2026-02-10",
      "CLIENTE": "JUAN PEREZ",
      "TIPO": "DEBE",
      "MONTO": 5000,
      "OBS": "Compra desde POS",
      "USUARIO": "POS_PRINCIPAL"
    }
  ]
}
```

**Respuesta**:
```json
{
  "success": true,
  "count": 1,
  "exitosos": 1,
  "errores": 0,
  "detalleErrores": []
}
```

**Campos**:
- `FECHA` (string, requerido): Fecha en formato "YYYY-MM-DD"
- `CLIENTE` (string, requerido): Nombre del cliente (se convertirá a mayúsculas)
- `TIPO` (string, requerido): "DEBE" (fiado) o "HABER" (pago)
- `MONTO` (number, requerido): Monto del movimiento
- `OBS` (string, opcional): Observaciones
- `USUARIO` (string, opcional): Usuario que registra (default: "API_EXTERNA")

---

## 🔧 Ejemplo de Uso con cURL

### Obtener Clientes
```bash
curl "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec?action=getClients"
```

### Exportar Datos Completos (para sincronizar POS)
```bash
curl "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec?action=exportData"
```

### Obtener Último Backup
```bash
curl "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec?action=getLatestBackup"
```

### Guardar Backup (automático del sistema)
```bash
curl -X POST "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"action": "saveBackup", "data": {}}'
```

### Agregar Transferencia
```bash
curl -X POST "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "addTransfers",
    "data": [{
      "FECHA": "2026-02-10",
      "CLIENTE": "JUAN PEREZ",
      "MONTO": 15000,
      "BANCO": "Banco Galicia",
      "OBS": "Transferencia desde POS"
    }]
  }'
```

### Agregar Movimiento
```bash
curl -X POST "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "addMovements",
    "data": [{
      "FECHA": "2026-02-10",
      "CLIENTE": "JUAN PEREZ",
      "TIPO": "DEBE",
      "MONTO": 5000,
      "OBS": "Compra desde POS"
    }]
  }'
```

---

## 🔧 Ejemplo de Uso con JavaScript/Fetch

### Obtener Clientes
```javascript
const API_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec';

// GET - Obtener clientes
async function obtenerClientes() {
  const response = await fetch(`${API_URL}?action=getClients`);
  const data = await response.json();
  console.log('Clientes:', data.data);
  return data;
}

// POST - Agregar transferencia
async function agregarTransferencia(transferencia) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'addTransfers',
      data: [transferencia]
    })
  });
  const data = await response.json();
  console.log('Resultado:', data);
  return data;
}

// POST - Agregar movimiento
async function agregarMovimiento(movimiento) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'addMovements',
      data: [movimiento]
    })
  });
  const data = await response.json();
  console.log('Resultado:', data);
  return data;
}

// GET - Exportar todos los datos (para sincronización con POS)
async function exportarDatosCompletos() {
  const response = await fetch(`${API_URL}?action=exportData`);
  const data = await response.json();
  console.log('Datos exportados:', data.data);
  console.log('Estadísticas:', data.data.estadisticas);
  return data;
}

// GET - Obtener último backup
async function obtenerUltimoBackup() {
  const response = await fetch(`${API_URL}?action=getLatestBackup`);
  const data = await response.json();
  if (data.success) {
    console.log('Backup recuperado:', data.fileName);
    console.log('Datos:', data.data);
  } else {
    console.log('Error:', data.error);
  }
  return data;
}

// POST - Guardar backup automático del sistema
async function guardarBackup() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'saveBackup',
      data: {} // Vacío = backup automático del sistema completo
    })
  });
  const data = await response.json();
  console.log('Backup guardado:', data.fileName);
  console.log('Backups mantenidos:', data.backupsMantenidos);
  return data;
}

// Uso
obtenerClientes();

agregarTransferencia({
  FECHA: '2026-02-10',
  CLIENTE: 'JUAN PEREZ',
  MONTO: 15000,
  BANCO: 'Banco Galicia',
  OBS: 'Transferencia desde POS'
});

agregarMovimiento({
  FECHA: '2026-02-10',
  CLIENTE: 'JUAN PEREZ',
  TIPO: 'DEBE',
  MONTO: 5000,
  OBS: 'Compra desde POS'
});

// Exportar todos los datos para sincronización con POS
exportarDatosCompletos();

// Obtener último backup guardado
obtenerUltimoBackup();

// Guardar backup del sistema actual
guardarBackup();
```

---

## 🔄 Flujo de Trabajo Recomendado para Sincronización con POS

### Sincronización Inicial (Primera vez)
```javascript
// 1. Exportar todos los datos del sistema principal
const datosCompletos = await exportarDatosCompletos();

// 2. Importar datos al POS local
importarDatosPOS(datosCompletos.data);

// 3. Guardar backup automático
await guardarBackup();
```

### Sincronización Periódica (Diaria/Semanal)
```javascript
// 1. Obtener último backup
const backup = await obtenerUltimoBackup();

// 2. Comparar con datos locales del POS
const cambios = compararConDatosLocales(backup.data);

// 3. Sincronizar solo cambios
if (cambios.nuevosClientes.length > 0) {
  // Actualizar clientes en POS
}

if (cambios.nuevosMovimientos.length > 0) {
  // Actualizar movimientos en POS
}
```

### Envío de Datos desde POS al Sistema Principal
```javascript
// 1. Recolectar ventas/movimientos del día en el POS
const ventasDelDia = obtenerVentasDelDiaPOS();

// 2. Enviar al sistema principal
for (const venta of ventasDelDia) {
  await agregarMovimiento({
    FECHA: venta.fecha,
    CLIENTE: venta.cliente,
    TIPO: 'DEBE',
    MONTO: venta.total,
    OBS: 'Venta POS #' + venta.id,
    USUARIO: 'POS_SUCURSAL_1'
  });
}

// 3. Guardar backup después de sincronizar
await guardarBackup();
```

---

## ⚠️ Notas Importantes

### Seguridad
- La API está protegida por las configuraciones de Google Apps Script
- Puedes configurar autenticación adicional si es necesario
- Los logs se registran en Google Apps Script (View > Executions)

### Limitaciones
- **Cuota diaria**: Google Apps Script tiene límites de ejecución diaria
- **Timeout**: 30 segundos máximo por petición
- **Datos**: Usa las hojas de Google Sheets existentes (no crea nuevas estructuras)

### Validaciones
- Los clientes deben existir previamente en la hoja CLIENTES
- Las fechas deben estar en formato "YYYY-MM-DD"
- Los montos deben ser números positivos
- El TIPO de movimiento debe ser "DEBE" o "HABER"

### Integración con Sistema Existente
- **Transferencias**: Se guardan en la hoja "Transferencias" usando el repositorio existente
- **Movimientos**: Se guardan en la hoja "MOVIMIENTOS" y actualizan automáticamente los saldos de clientes
- **Clientes**: La API lee de la hoja "CLIENTES" existente
- **Backups**: Se guardan en Google Drive en la carpeta "Backup Sistema POS"
- **Exportación**: Genera datos serializados listos para importar en POS externo

### Backups y Sincronización
- Los backups se guardan automáticamente en Google Drive
- Se mantienen solo los últimos 30 backups (los antiguos se eliminan automáticamente)
- El backup incluye: clientes, movimientos, transferencias, configuración del emisor y estadísticas
- Formato JSON estándar compatible con cualquier sistema POS
- Exportación completa del sistema disponible sin crear archivos (endpoint `exportData`)

---

## 🐛 Debugging

Para ver los logs de las peticiones:
1. En Google Apps Script, ir a **View > Executions**
2. Buscar las ejecuciones recientes
3. Click en una ejecución para ver los logs detallados

---

## 📝 Changelog

### Versión 1.1 (2026-02-10) - EXPORTACIÓN Y BACKUPS
- ✅ **NUEVO**: Endpoint GET `exportData` - Exporta todos los datos del sistema para POS
- ✅ **NUEVO**: Endpoint GET `getLatestBackup` - Recupera último backup de Google Drive
- ✅ **NUEVO**: Endpoint POST `saveBackup` - Guarda backup automático en Google Drive
- ✅ **NUEVO**: Sistema de backups automáticos (mantiene últimos 30)
- ✅ **NUEVO**: Función `generarBackupCompleto()` - Genera backup con todos los repositorios
- ✅ **NUEVO**: Función `getOrCreateFolder_()` - Gestión de carpetas en Google Drive
- ✅ **MEJORA**: Estadísticas incluidas en backups y exportaciones
- ✅ **MEJORA**: Serialización completa de datos para compatibilidad con POS externos
- ✅ Documentación completa de flujos de sincronización
- ✅ Ejemplos de integración con POS

### Versión 1.0 (2026-02-10) - LANZAMIENTO INICIAL
- ✅ Endpoint GET para obtener clientes
- ✅ Endpoint POST para agregar transferencias
- ✅ Endpoint POST para agregar movimientos
- ✅ Endpoint GET para verificar estado de la API
- ✅ Integración completa con repositorios existentes
- ✅ Validación y manejo de errores
- ✅ Logs para debugging
