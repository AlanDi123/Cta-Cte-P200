# 📡 API Documentation - Sol & Verde POS

**Version:** 3.0.0  
**Base URL:** `/api/v1`

## Authentication

All API requests (except login) require a JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Default Credentials

**Admin User:**
- Username: `admin`
- Password: `admin123`
- Role: `dueño`

**Vendor User:**
- Username: `vendedor1`
- Password: `vendedor123`
- Role: `vendedor`

⚠️ **Change these passwords in production!**

---

## 🔐 Authentication Endpoints

### POST /api/v1/auth/login
Login and get JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@solverde.com",
      "nombre": "Administrador",
      "apellido": "Sistema",
      "rol": "dueño"
    }
  }
}
```

### POST /api/v1/auth/logout
Logout (client-side token removal).

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "message": "Sesión cerrada exitosamente"
}
```

### POST /api/v1/auth/refresh
Refresh JWT token.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### GET /api/v1/auth/me
Get current user information.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@solverde.com",
    "nombre": "Administrador",
    "apellido": "Sistema",
    "rol": "dueño"
  }
}
```

### POST /api/v1/auth/change-password
Change password for current user.

**Headers:** Requires authentication

**Request:**
```json
{
  "currentPassword": "admin123",
  "newPassword": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Contraseña actualizada exitosamente"
}
```

---

## 👥 Client Endpoints

### GET /api/v1/clients
List all clients with pagination and filters.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50, max: 100)
- `search` (string) - Search in nombre, razon_social, cuit, codigo
- `tipo` (enum) - minorista, mayorista, supermercado, restaurante, otro
- `activo` (boolean, default: true) - Active status
- `orderBy` (string) - nombre, codigo, saldo, limite_credito, created_at
- `order` (string) - ASC, DESC

**Example:**
```bash
GET /api/v1/clients?search=super&tipo=supermercado&page=1&limit=20
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "codigo": "CLI001",
      "nombre": "SUPERMERCADO EL SOL",
      "razon_social": "El Sol S.A.",
      "cuit": "30-12345678-9",
      "condicion_fiscal": "responsable_inscripto",
      "tipo_cliente": "supermercado",
      "telefono": "1145678901",
      "email": "compras@elsol.com",
      "domicilio_fiscal": "Av. Libertador 1234",
      "ciudad": "Buenos Aires",
      "provincia": "Buenos Aires",
      "codigo_postal": "1428",
      "limite_credito": 500000,
      "saldo": 150000,
      "descuento_porcentaje": 0,
      "observaciones": null,
      "activo": true,
      "created_at": "2026-02-12T10:00:00.000Z",
      "updated_at": "2026-02-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 4,
    "pages": 1
  }
}
```

### GET /api/v1/clients/:id
Get single client by ID.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "codigo": "CLI001",
    "nombre": "SUPERMERCADO EL SOL",
    ...
  }
}
```

### POST /api/v1/clients
Create new client.

**Headers:** Requires authentication  
**Role:** vendedor, administrativo, dueño

**Request:**
```json
{
  "codigo": "CLI005",
  "nombre": "VERDULERIA NUEVA",
  "razon_social": "Verdulería Nueva SRL",
  "cuit": "30-98765432-1",
  "condicion_fiscal": "responsable_inscripto",
  "tipo_cliente": "minorista",
  "telefono": "1123456789",
  "email": "info@verdulerianueva.com",
  "domicilio_fiscal": "Calle Falsa 123",
  "ciudad": "Buenos Aires",
  "provincia": "Buenos Aires",
  "codigo_postal": "1234",
  "limite_credito": 100000,
  "descuento_porcentaje": 5,
  "observaciones": "Cliente nuevo referido"
}
```

**Note:** If `codigo` is not provided, it will be auto-generated (CLI0001, CLI0002, etc.)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "codigo": "CLI005",
    ...
  },
  "message": "Cliente creado exitosamente"
}
```

### PUT /api/v1/clients/:id
Update existing client.

**Headers:** Requires authentication  
**Role:** administrativo, dueño

**Request:** (same fields as POST, all optional)

**Response (200):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Cliente actualizado exitosamente"
}
```

### DELETE /api/v1/clients/:id
Soft delete client (sets activo = false).

**Headers:** Requires authentication  
**Role:** dueño

**Response (200):**
```json
{
  "success": true,
  "message": "Cliente desactivado exitosamente"
}
```

### GET /api/v1/clients/:id/cuenta-corriente
Get client account statement (cuenta corriente).

**Headers:** Requires authentication

**Query Parameters:**
- `desde` (date) - Start date filter
- `hasta` (date) - End date filter

**Response (200):**
```json
{
  "success": true,
  "data": {
    "cliente": {
      "nombre": "SUPERMERCADO EL SOL",
      "saldo_actual": 150000,
      "limite_credito": 500000,
      "credito_disponible": 350000
    },
    "movimientos": [
      {
        "id": "uuid",
        "tipo": "venta",
        "monto": 25000,
        "saldo_anterior": 125000,
        "saldo_nuevo": 150000,
        "concepto": "Venta #123",
        "fecha": "2026-02-12T14:30:00.000Z",
        "vencimiento": "2026-03-12",
        "created_at": "2026-02-12T14:30:00.000Z"
      }
    ]
  }
}
```

### GET /api/v1/clients/overdue
Get clients with overdue debt.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "codigo": "CLI002",
      "nombre": "VERDULERÍA LA ESQUINA",
      "telefono": "1156789012",
      "saldo": 45000,
      "limite_credito": 200000,
      "vencimiento": "2026-01-15",
      "dias_vencido": 28
    }
  ]
}
```

---

## 📦 Product Endpoints

### GET /api/v1/products
List all products with pagination and filters.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (number)
- `limit` (number)
- `search` (string)
- `categoria` (uuid)
- `activo` (boolean)
- `stock_critico` (boolean)
- `orderBy` (string)
- `order` (string)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "codigo": "VH001",
      "codigo_barras": null,
      "nombre": "LECHUGA",
      "descripcion": "Lechuga criolla",
      "categoria_id": "uuid",
      "categoria_nombre": "Verduras de Hoja",
      "unidad_medida": "unidad",
      "precio_compra": 150,
      "precio_venta": 250,
      "precio_mayorista": 220,
      "margen_porcentaje": null,
      "iva_porcentaje": 10.5,
      "stock_actual": 100,
      "stock_minimo": 20,
      "stock_maximo": null,
      "permite_venta_sin_stock": false,
      "activo": true,
      "imagen_url": null,
      "estado_stock": "OK",
      "created_at": "2026-02-12T10:00:00.000Z",
      "updated_at": "2026-02-12T10:00:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

### GET /api/v1/products/:id
Get single product by ID.

**Response:** Similar to list, single object

### POST /api/v1/products
Create new product.

**Headers:** Requires authentication  
**Role:** administrativo, dueño

**Request:**
```json
{
  "codigo": "VH011",
  "codigo_barras": "7790001234567",
  "nombre": "ACELGA",
  "descripcion": "Acelga fresca",
  "categoria_id": "uuid",
  "unidad_medida": "kg",
  "precio_compra": 180,
  "precio_venta": 320,
  "precio_mayorista": 280,
  "iva_porcentaje": 10.5,
  "stock_actual": 50,
  "stock_minimo": 10,
  "stock_maximo": 200,
  "permite_venta_sin_stock": false
}
```

**Response (201):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Producto creado exitosamente"
}
```

### PUT /api/v1/products/:id
Update product.

**Headers:** Requires authentication  
**Role:** administrativo, dueño

### DELETE /api/v1/products/:id
Soft delete product.

**Headers:** Requires authentication  
**Role:** dueño

### GET /api/v1/products/stock/critical
Get products with critical stock (stock_actual <= stock_minimo).

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "codigo": "VF001",
      "nombre": "TOMATE",
      "unidad_medida": "kg",
      "stock_actual": 15,
      "stock_minimo": 30,
      "categoria_nombre": "Verduras de Fruto",
      "faltante": 15
    }
  ]
}
```

### POST /api/v1/products/:id/adjust-stock
Manually adjust product stock.

**Headers:** Requires authentication  
**Role:** administrativo, dueño

**Request:**
```json
{
  "cantidad": 50,
  "motivo": "Ingreso de mercadería proveedor XYZ"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Stock ajustado exitosamente",
  "data": {
    "stock_anterior": 100,
    "stock_nuevo": 150,
    "cantidad_ajustada": 50
  }
}
```

### GET /api/v1/products/categories
Get all product categories.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "nombre": "Verduras de Hoja",
      "descripcion": "Lechuga, espinaca, acelga, etc.",
      "codigo": "VH",
      "activo": true,
      "created_at": "2026-02-12T10:00:00.000Z"
    }
  ]
}
```

---

## 💰 Sales Endpoints

### POST /api/v1/sales
Create new sale.

**Headers:** Requires authentication

**Request:**
```json
{
  "cliente_id": "uuid",
  "turno_id": "uuid",
  "tipo_venta": "credito",
  "tipo_comprobante": "B",
  "observaciones": "Venta mayorista",
  "descuento": 100,
  "items": [
    {
      "producto_id": "uuid",
      "cantidad": 10,
      "precio_unitario": 250,
      "descuento_porcentaje": 5
    },
    {
      "producto_id": "uuid",
      "cantidad": 5,
      "precio_unitario": 380
    }
  ],
  "pagos": [
    {
      "metodo": "transferencia",
      "monto": 1500,
      "banco": "Banco Galicia",
      "referencia": "TRF123456"
    }
  ]
}
```

**Fields:**
- `cliente_id` (required) - Client UUID
- `turno_id` (optional) - Cash register shift ID
- `tipo_venta` (required) - contado, credito, parcial
- `tipo_comprobante` (optional) - A, B, C, X, ticket (default: B)
- `items` (required, min 1) - Sale items
  - `producto_id` (required)
  - `cantidad` (required)
  - `precio_unitario` (optional, uses product price if not provided)
  - `descuento_porcentaje` (optional, 0-100)
- `pagos` (optional) - Payments
  - `metodo` (required) - efectivo, transferencia, debito, credito, cheque, otro
  - `monto` (required)
  - `referencia` (optional)
  - `banco` (optional)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "numero_venta": 1,
    "cliente_id": "uuid",
    "usuario_id": "uuid",
    "turno_id": "uuid",
    "tipo_venta": "credito",
    "estado": "completada",
    "tipo_comprobante": "B",
    "fecha": "2026-02-12T15:30:00.000Z",
    "subtotal": 3275,
    "descuento": 100,
    "iva": 334.12,
    "total": 3509.12,
    "pagado": 1500,
    "saldo": 2009.12,
    "observaciones": "Venta mayorista",
    "created_at": "2026-02-12T15:30:00.000Z"
  },
  "message": "Venta creada exitosamente"
}
```

**Automatic Actions:**
- ✅ Validates stock availability
- ✅ Checks credit limit (for credit sales)
- ✅ Deducts stock from products
- ✅ Creates stock movement records
- ✅ Updates client account balance
- ✅ Registers payments
- ✅ Creates cash register movements
- ✅ Logs audit trail

### GET /api/v1/sales
List all sales with filters.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (number)
- `limit` (number)
- `cliente_id` (uuid)
- `usuario_id` (uuid)
- `tipo_venta` (enum)
- `estado` (enum) - pendiente, completada, cancelada, anulada
- `desde` (date)
- `hasta` (date)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "numero_venta": 1,
      "cliente_nombre": "SUPERMERCADO EL SOL",
      "vendedor_nombre": "Juan Pérez",
      "tipo_venta": "credito",
      "estado": "completada",
      "total": 3509.12,
      "pagado": 1500,
      "saldo": 2009.12,
      "fecha": "2026-02-12T15:30:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

### GET /api/v1/sales/:id
Get sale details with items and payments.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "numero_venta": 1,
    "cliente_nombre": "SUPERMERCADO EL SOL",
    "cliente_cuit": "30-12345678-9",
    "vendedor_nombre": "Juan Pérez",
    "tipo_venta": "credito",
    "estado": "completada",
    "total": 3509.12,
    "items": [
      {
        "id": "uuid",
        "producto_id": "uuid",
        "producto_codigo": "VH001",
        "producto_nombre": "LECHUGA",
        "unidad_medida": "unidad",
        "cantidad": 10,
        "precio_unitario": 250,
        "descuento_porcentaje": 5,
        "iva_porcentaje": 10.5,
        "subtotal": 2375
      }
    ],
    "pagos": [
      {
        "id": "uuid",
        "metodo": "transferencia",
        "monto": 1500,
        "referencia": "TRF123456",
        "banco": "Banco Galicia",
        "fecha": "2026-02-12T15:30:00.000Z"
      }
    ]
  }
}
```

### POST /api/v1/sales/:id/cancel
Cancel a sale.

**Headers:** Requires authentication  
**Role:** dueño, administrativo

**Request:**
```json
{
  "motivo": "Cliente solicitó cancelación"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Venta cancelada exitosamente"
}
```

**Automatic Actions:**
- ✅ Restores stock to products
- ✅ Creates reversal stock movements
- ✅ Reverses client account balance
- ✅ Marks sale as cancelled
- ✅ Logs audit trail

---

## 💵 Cash Register (Caja) Endpoints

### POST /api/v1/caja/open
Open a cash register shift.

**Headers:** Requires authentication

**Request:**
```json
{
  "caja_id": "uuid",
  "monto_apertura": 10000,
  "observaciones_apertura": "Apertura turno mañana"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caja_id": "uuid",
    "usuario_id": "uuid",
    "estado": "abierta",
    "fecha_apertura": "2026-02-12T08:00:00.000Z",
    "monto_apertura": 10000,
    "observaciones_apertura": "Apertura turno mañana"
  },
  "message": "Turno de caja abierto exitosamente"
}
```

### POST /api/v1/caja/close
Close a cash register shift.

**Headers:** Requires authentication

**Request:**
```json
{
  "turno_id": "uuid",
  "monto_cierre": 45000,
  "observaciones_cierre": "Cierre turno - todo OK"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "estado": "cerrada",
    "fecha_apertura": "2026-02-12T08:00:00.000Z",
    "fecha_cierre": "2026-02-12T18:00:00.000Z",
    "monto_apertura": 10000,
    "monto_cierre": 45000,
    "monto_esperado": 44500,
    "diferencia": 500,
    "total_ingresos": 35000,
    "total_egresos": 500,
    "observaciones_cierre": "Cierre turno - todo OK"
  },
  "message": "Turno de caja cerrado exitosamente"
}
```

**Calculation:**
- `monto_esperado` = `monto_apertura` + `total_ingresos` - `total_egresos`
- `diferencia` = `monto_cierre` - `monto_esperado`

### GET /api/v1/caja/current
Get current open shift for logged-in user.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caja_id": "uuid",
    "caja_nombre": "Caja Principal",
    "usuario_id": "uuid",
    "usuario_nombre": "Juan Pérez",
    "estado": "abierta",
    "fecha_apertura": "2026-02-12T08:00:00.000Z",
    "monto_apertura": 10000,
    "total_movimientos": 15,
    "total_ingresos": 35000,
    "total_egresos": 500
  }
}
```

### POST /api/v1/caja/movement
Register a cash movement.

**Headers:** Requires authentication

**Request:**
```json
{
  "turno_id": "uuid",
  "tipo": "gasto",
  "monto": 500,
  "concepto": "Compra de bolsas",
  "medio_pago": "efectivo"
}
```

**Types:** ingreso, egreso, retiro, aporte, gasto

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "turno_id": "uuid",
    "tipo": "gasto",
    "monto": 500,
    "concepto": "Compra de bolsas",
    "medio_pago": "efectivo",
    "fecha": "2026-02-12T12:30:00.000Z"
  },
  "message": "Movimiento registrado exitosamente"
}
```

### GET /api/v1/caja/shifts/:id/movements
Get all movements for a specific shift.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tipo": "venta",
      "monto": 3509.12,
      "concepto": "Venta #1 - SUPERMERCADO EL SOL",
      "medio_pago": "transferencia",
      "fecha": "2026-02-12T15:30:00.000Z",
      "usuario_nombre": "Juan Pérez"
    }
  ]
}
```

### GET /api/v1/caja/shifts/history
Get shift history with filters.

**Headers:** Requires authentication

**Query Parameters:**
- `page` (number)
- `limit` (number)
- `usuario_id` (uuid)
- `caja_id` (uuid)
- `desde` (date)
- `hasta` (date)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "caja_nombre": "Caja Principal",
      "usuario_nombre": "Juan Pérez",
      "estado": "cerrada",
      "fecha_apertura": "2026-02-12T08:00:00.000Z",
      "fecha_cierre": "2026-02-12T18:00:00.000Z",
      "monto_apertura": 10000,
      "monto_cierre": 45000,
      "monto_esperado": 44500,
      "diferencia": 500
    }
  ],
  "pagination": { ... }
}
```

### GET /api/v1/caja/registers
Get all active cash registers.

**Headers:** Requires authentication

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "numero": 1,
      "nombre": "Caja Principal",
      "ubicacion": "Mostrador Principal",
      "activa": true,
      "created_at": "2026-02-12T10:00:00.000Z"
    }
  ]
}
```

---

## 📊 Dashboard & Reports (Coming Soon)

These endpoints will be implemented in Phase 4:

- `GET /api/v1/dashboard/kpis` - Key performance indicators
- `GET /api/v1/dashboard/charts` - Chart data
- `GET /api/v1/reports/sales` - Sales reports
- `GET /api/v1/reports/cash` - Cash register reports
- `GET /api/v1/reports/stock` - Stock reports
- `GET /api/v1/reports/clients` - Client reports

---

## 🔒 Roles & Permissions

| Endpoint | Dueño | Administrativo | Vendedor | Contabilidad |
|----------|-------|----------------|----------|--------------|
| Auth | ✅ | ✅ | ✅ | ✅ |
| View Clients | ✅ | ✅ | ✅ | ✅ |
| Create Client | ✅ | ✅ | ✅ | ❌ |
| Edit Client | ✅ | ✅ | ❌ | ❌ |
| Delete Client | ✅ | ❌ | ❌ | ❌ |
| View Products | ✅ | ✅ | ✅ | ✅ |
| Create Product | ✅ | ✅ | ❌ | ❌ |
| Edit Product | ✅ | ✅ | ❌ | ❌ |
| Delete Product | ✅ | ❌ | ❌ | ❌ |
| Create Sale | ✅ | ✅ | ✅ | ❌ |
| Cancel Sale | ✅ | ✅ | ❌ | ❌ |
| Cash Register | ✅ | ✅ | ✅ | ❌ |

---

## ⚠️ Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Example Error Responses

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Token inválido"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "No tienes permisos para realizar esta acción",
  "requiredRoles": ["dueño", "administrativo"],
  "userRole": "vendedor"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "El nombre del cliente es requerido"
}
```

**400 Credit Limit:**
```json
{
  "success": false,
  "error": "Límite de crédito excedido",
  "data": {
    "saldo_actual": 450000,
    "limite_credito": 500000,
    "saldo_nuevo": 550000
  }
}
```

---

## 📝 Notes

### Pagination
All list endpoints support pagination with:
- `page` - Page number (starts at 1)
- `limit` - Items per page (max 100)

Response includes:
```json
{
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### Dates
- All dates are in ISO 8601 format
- Timezone: America/Argentina/Buenos_Aires
- Example: `2026-02-12T15:30:00.000Z`

### Currency
- All amounts are in Argentine Pesos (ARS)
- Stored as DECIMAL(12,2)
- Example: 3509.12

### Audit Trail
All create/update/delete operations are logged in the `auditoria` table with:
- User who performed the action
- IP address
- Timestamp
- Before/after data

---

**Sol & Verde POS API** - Version 3.0.0
