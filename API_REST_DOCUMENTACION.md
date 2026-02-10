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

---

## 🐛 Debugging

Para ver los logs de las peticiones:
1. En Google Apps Script, ir a **View > Executions**
2. Buscar las ejecuciones recientes
3. Click en una ejecución para ver los logs detallados

---

## 📝 Changelog

### Versión 1.0 (2026-02-10)
- ✅ Endpoint GET para obtener clientes
- ✅ Endpoint POST para agregar transferencias
- ✅ Endpoint POST para agregar movimientos
- ✅ Endpoint GET para verificar estado de la API
- ✅ Integración completa con repositorios existentes
- ✅ Validación y manejo de errores
- ✅ Logs para debugging
