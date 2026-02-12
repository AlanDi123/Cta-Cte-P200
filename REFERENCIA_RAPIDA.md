# 🚀 Referencia Rápida - Sol & Verde POS

## ⚡ Comandos Más Usados

### Iniciar el Sistema

```bash
# Con Docker (recomendado)
docker-compose up -d

# Sin Docker
npm start
```

### Detener el Sistema

```bash
# Con Docker
docker-compose down

# Sin Docker
Ctrl + C
```

---

## 🔑 Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**Usuarios por defecto:**
- Admin: `admin` / `admin123`
- Vendedor: `vendedor1` / `vendedor123`

---

## 📋 Endpoints Principales

### Clientes

| Acción | Método | Endpoint |
|--------|--------|----------|
| Listar | GET | `/api/v1/clients` |
| Ver uno | GET | `/api/v1/clients/:id` |
| Crear | POST | `/api/v1/clients` |
| Actualizar | PUT | `/api/v1/clients/:id` |
| Estado cuenta | GET | `/api/v1/clients/:id/cuenta-corriente` |
| Deuda vencida | GET | `/api/v1/clients/overdue` |

### Productos

| Acción | Método | Endpoint |
|--------|--------|----------|
| Listar | GET | `/api/v1/products` |
| Ver uno | GET | `/api/v1/products/:id` |
| Crear | POST | `/api/v1/products` |
| Actualizar | PUT | `/api/v1/products/:id` |
| Stock crítico | GET | `/api/v1/products/stock/critical` |
| Ajustar stock | POST | `/api/v1/products/:id/adjust-stock` |
| Categorías | GET | `/api/v1/products/categories` |

### Ventas

| Acción | Método | Endpoint |
|--------|--------|----------|
| Listar | GET | `/api/v1/sales` |
| Ver una | GET | `/api/v1/sales/:id` |
| Crear | POST | `/api/v1/sales` |
| Cancelar | POST | `/api/v1/sales/:id/cancel` |

### Caja

| Acción | Método | Endpoint |
|--------|--------|----------|
| Listar cajas | GET | `/api/v1/caja/registers` |
| Abrir turno | POST | `/api/v1/caja/open` |
| Cerrar turno | POST | `/api/v1/caja/close` |
| Turno actual | GET | `/api/v1/caja/current` |
| Movimiento | POST | `/api/v1/caja/movement` |
| Historial | GET | `/api/v1/caja/shifts/history` |

---

## 📝 Ejemplos JSON

### Crear Cliente

```json
{
  "nombre": "VERDULERIA LA ESQUINA",
  "telefono": "1145678900",
  "tipo_cliente": "minorista",
  "limite_credito": 100000
}
```

### Crear Producto

```json
{
  "codigo": "VH011",
  "nombre": "ACELGA",
  "unidad_medida": "kg",
  "precio_compra": 180,
  "precio_venta": 320,
  "stock_actual": 50,
  "stock_minimo": 10,
  "iva_porcentaje": 10.5
}
```

### Abrir Caja

```json
{
  "caja_id": "uuid-de-la-caja",
  "monto_apertura": 10000,
  "observaciones_apertura": "Apertura turno"
}
```

### Crear Venta

```json
{
  "cliente_id": "uuid-del-cliente",
  "turno_id": "uuid-del-turno",
  "tipo_venta": "contado",
  "items": [
    {
      "producto_id": "uuid-del-producto",
      "cantidad": 10,
      "precio_unitario": 250
    }
  ],
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 2500
    }
  ]
}
```

### Cerrar Caja

```json
{
  "turno_id": "uuid-del-turno",
  "monto_cierre": 12500,
  "observaciones_cierre": "Todo correcto"
}
```

---

## 🔧 Parámetros de Búsqueda

### Clientes

```
?page=1
&limit=50
&search=nombre
&tipo=minorista
&activo=true
&orderBy=nombre
&order=ASC
```

### Productos

```
?page=1
&limit=50
&search=tomate
&categoria=uuid
&activo=true
&stock_critico=true
&orderBy=nombre
&order=ASC
```

### Ventas

```
?page=1
&limit=50
&cliente_id=uuid
&usuario_id=uuid
&tipo_venta=credito
&estado=completada
&desde=2026-01-01
&hasta=2026-12-31
```

---

## 💡 Valores Permitidos

### Tipos de Cliente
- `minorista`
- `mayorista`
- `supermercado`
- `restaurante`
- `otro`

### Condición Fiscal
- `consumidor_final`
- `responsable_inscripto`
- `monotributo`
- `exento`

### Unidades de Medida
- `kg`
- `gr`
- `unidad`
- `bulto`
- `cajon`
- `litro`

### Tipos de Venta
- `contado`
- `credito`
- `parcial`

### Métodos de Pago
- `efectivo`
- `transferencia`
- `debito`
- `credito`
- `cheque`
- `otro`

### Tipos de Comprobante
- `A` - Factura A
- `B` - Factura B
- `C` - Factura C
- `X` - Comprobante X
- `ticket` - Ticket

### Roles de Usuario
- `dueño` - Acceso total
- `administrativo` - Gestión general
- `vendedor` - Ventas y consultas
- `contabilidad` - Solo reportes

---

## 🔍 Filtros Útiles

### Buscar productos por nombre
```
GET /api/v1/products?search=tomate
```

### Ver solo stock crítico
```
GET /api/v1/products?stock_critico=true
```

### Ver clientes con deuda
```
GET /api/v1/clients/overdue
```

### Ventas del último mes
```
GET /api/v1/sales?desde=2026-01-01&hasta=2026-01-31
```

### Estado de cuenta de cliente
```
GET /api/v1/clients/:id/cuenta-corriente?desde=2026-01-01&hasta=2026-12-31
```

---

## 🛡️ Headers Requeridos

Todas las peticiones (excepto login) necesitan:

```
Authorization: Bearer TU_TOKEN_JWT
```

Para crear/actualizar también necesitas:

```
Content-Type: application/json
```

---

## ⚠️ Códigos de Estado HTTP

| Código | Significado |
|--------|-------------|
| 200 | OK - Exitoso |
| 201 | Created - Creado exitosamente |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado |
| 403 | Forbidden - Sin permisos |
| 404 | Not Found - No encontrado |
| 500 | Internal Error - Error del servidor |

---

## 🔐 Cambiar Contraseña

```bash
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "NuevaContraseña123"
  }'
```

---

## 📊 Ver Estadísticas Rápidas

```bash
# Stock crítico
curl http://localhost:3000/api/v1/products/stock/critical \
  -H "Authorization: Bearer TU_TOKEN"

# Clientes con deuda vencida
curl http://localhost:3000/api/v1/clients/overdue \
  -H "Authorization: Bearer TU_TOKEN"

# Turno actual
curl http://localhost:3000/api/v1/caja/current \
  -H "Authorization: Bearer TU_TOKEN"
```

---

## 🔄 Backup Manual

```bash
# Con Docker
docker-compose exec postgres pg_dump -U postgres solverdepos > backup.sql

# Sin Docker
pg_dump -U postgres solverdepos > backup.sql
```

---

## 📝 Ver Logs

```bash
# Con Docker
docker-compose logs -f backend

# Sin Docker
tail -f logs/combined.log
```

---

## 🆘 Comandos de Emergencia

### Reiniciar sistema
```bash
docker-compose restart
```

### Reiniciar solo backend
```bash
docker-compose restart backend
```

### Reiniciar base de datos
```bash
docker-compose restart postgres
```

### Ver estado de servicios
```bash
docker-compose ps
```

### Acceder a PostgreSQL directamente
```bash
docker-compose exec postgres psql -U postgres -d solverdepos
```

---

## 🎯 URLs Importantes

- **API Base**: `http://localhost:3000/api/v1`
- **Health Check**: `http://localhost:3000/health`
- **API Docs**: `http://localhost:3000/api/v1/docs`
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`

---

## 📚 Documentación Completa

- `EXPLICACION_ESPANOL.md` - Qué se hizo
- `GUIA_USO_ESPANOL.md` - Guía paso a paso
- `API.md` - Referencia completa API
- `DEPLOYMENT.md` - Despliegue a producción

---

**Referencia creada por Sol & Verde POS v3.0.0**
