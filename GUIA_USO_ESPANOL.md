# 📖 Guía Paso a Paso - Cómo Usar el Sistema

## 🚀 Inicio Rápido - 5 Minutos

### Paso 1: Instalar Requisitos

Necesitas tener instalado en tu computadora:

1. **Docker Desktop** (recomendado) - [Descargar aquí](https://www.docker.com/products/docker-desktop)
   - Windows: Docker Desktop para Windows
   - Mac: Docker Desktop para Mac
   - Linux: Docker y Docker Compose

**O si prefieres instalación manual:**

2. **Node.js 18 o superior** - [Descargar aquí](https://nodejs.org/)
3. **PostgreSQL 14 o superior** - [Descargar aquí](https://www.postgresql.org/)

---

### Paso 2: Descargar el Proyecto

Abre una terminal y ejecuta:

```bash
# Clonar el repositorio
git clone https://github.com/AlanDi123/Cta-Cte-P200.git

# Entrar al directorio
cd Cta-Cte-P200
```

---

### Paso 3: Configurar Variables de Entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env
```

Ahora edita el archivo `.env` con un editor de texto y cambia:

```env
# ⚠️ IMPORTANTE: Cambia estos valores!
DB_PASSWORD=TuContraseñaSegura123
JWT_SECRET=UnSecretoMuyLargoYAleatorio123456789
```

---

### Paso 4A: Iniciar con Docker (Más Fácil) ⭐

```bash
# Iniciar todos los servicios
docker-compose up -d

# Esperar 10 segundos para que PostgreSQL inicie

# Inicializar la base de datos con datos de ejemplo
docker-compose exec backend npm run db:migrate
```

¡Listo! El sistema está corriendo en http://localhost:3000

---

### Paso 4B: Iniciar Sin Docker (Manual)

```bash
# 1. Crear la base de datos
createdb solverdepos

# 2. Importar el esquema
psql solverdepos < backend/database/init.sql

# 3. Instalar dependencias
npm install

# 4. Inicializar datos de ejemplo
npm run db:migrate

# 5. Iniciar el servidor
npm start
```

El sistema está corriendo en http://localhost:3000

---

### Paso 5: Verificar que Funciona

Abre tu navegador o usa curl/Postman:

```bash
# Verificar salud del sistema
curl http://localhost:3000/health
```

Deberías ver:
```json
{
  "status": "OK",
  "timestamp": "2026-02-12T...",
  "environment": "production",
  "version": "3.0.0"
}
```

✅ ¡El sistema está funcionando!

---

## 🔐 Paso 6: Iniciar Sesión

### Usuarios por Defecto

El sistema incluye 2 usuarios de ejemplo:

1. **Administrador (Dueño)**
   - Usuario: `admin`
   - Contraseña: `admin123`
   - Permisos: Acceso total

2. **Vendedor**
   - Usuario: `vendedor1`
   - Contraseña: `vendedor123`
   - Permisos: Ventas y consultas

### Hacer Login por API

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "nombre": "Administrador",
      "apellido": "Sistema",
      "rol": "dueño"
    }
  }
}
```

**Guarda el token!** Lo necesitarás para todas las demás peticiones.

---

## 📝 Operaciones Básicas

### 1. Ver Todos los Clientes

```bash
# Reemplaza TU_TOKEN con el token que recibiste al hacer login
curl http://localhost:3000/api/v1/clients \
  -H "Authorization: Bearer TU_TOKEN"
```

### 2. Crear un Nuevo Cliente

```bash
curl -X POST http://localhost:3000/api/v1/clients \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "VERDULERIA LA ESQUINA",
    "telefono": "1145678900",
    "tipo_cliente": "minorista",
    "limite_credito": 100000
  }'
```

### 3. Ver Todos los Productos

```bash
curl http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer TU_TOKEN"
```

### 4. Crear un Nuevo Producto

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "codigo": "VH011",
    "nombre": "ACELGA",
    "descripcion": "Acelga fresca",
    "categoria_id": "ver-en-respuesta-de-categorias",
    "unidad_medida": "kg",
    "precio_compra": 180,
    "precio_venta": 320,
    "stock_actual": 50,
    "stock_minimo": 10,
    "iva_porcentaje": 10.5
  }'
```

### 5. Ver Productos con Stock Crítico

```bash
curl http://localhost:3000/api/v1/products/stock/critical \
  -H "Authorization: Bearer TU_TOKEN"
```

---

## 💰 Flujo Completo de Venta

### Paso 1: Abrir Turno de Caja

Primero necesitas abrir un turno de caja para poder vender:

```bash
# Ver las cajas disponibles
curl http://localhost:3000/api/v1/caja/registers \
  -H "Authorization: Bearer TU_TOKEN"

# Abrir turno (guarda el ID de caja de la respuesta anterior)
curl -X POST http://localhost:3000/api/v1/caja/open \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caja_id": "ID_DE_LA_CAJA",
    "monto_apertura": 10000,
    "observaciones_apertura": "Apertura turno mañana"
  }'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "id": "TURNO_ID_GUARDALO",
    "estado": "abierta",
    "monto_apertura": 10000
  }
}
```

### Paso 2: Crear una Venta

```bash
curl -X POST http://localhost:3000/api/v1/sales \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "ID_DEL_CLIENTE",
    "turno_id": "TURNO_ID_DEL_PASO_1",
    "tipo_venta": "contado",
    "items": [
      {
        "producto_id": "ID_DEL_PRODUCTO",
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
  }'
```

**¿Cómo obtener los IDs?**
- `cliente_id`: Del paso "Ver Todos los Clientes"
- `producto_id`: Del paso "Ver Todos los Productos"
- `turno_id`: Del paso "Abrir Turno de Caja"

### Paso 3: Ver el Turno Actual

```bash
curl http://localhost:3000/api/v1/caja/current \
  -H "Authorization: Bearer TU_TOKEN"
```

Verás el resumen de tu turno actual con todos los movimientos.

### Paso 4: Cerrar Turno de Caja

```bash
curl -X POST http://localhost:3000/api/v1/caja/close \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "turno_id": "TURNO_ID",
    "monto_cierre": 12500,
    "observaciones_cierre": "Cierre turno - todo correcto"
  }'
```

El sistema automáticamente:
- Calcula el monto esperado
- Calcula la diferencia (arqueo)
- Muestra si falta o sobra dinero

---

## 📊 Consultas Útiles

### Ver Estado de Cuenta de un Cliente

```bash
curl "http://localhost:3000/api/v1/clients/CLIENTE_ID/cuenta-corriente?desde=2026-01-01&hasta=2026-12-31" \
  -H "Authorization: Bearer TU_TOKEN"
```

### Ver Clientes con Deuda Vencida

```bash
curl http://localhost:3000/api/v1/clients/overdue \
  -H "Authorization: Bearer TU_TOKEN"
```

### Ver Historial de Ventas

```bash
curl "http://localhost:3000/api/v1/sales?page=1&limit=20" \
  -H "Authorization: Bearer TU_TOKEN"
```

### Buscar Productos

```bash
# Buscar productos por nombre
curl "http://localhost:3000/api/v1/products?search=tomate" \
  -H "Authorization: Bearer TU_TOKEN"

# Ver solo productos con stock crítico
curl "http://localhost:3000/api/v1/products?stock_critico=true" \
  -H "Authorization: Bearer TU_TOKEN"
```

---

## 🛠️ Operaciones Administrativas

### Cambiar Contraseña

```bash
curl -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "MiNuevaContraseñaSegura123"
  }'
```

### Ajustar Stock Manualmente

```bash
curl -X POST http://localhost:3000/api/v1/products/PRODUCTO_ID/adjust-stock \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cantidad": 50,
    "motivo": "Ingreso de mercadería proveedor XYZ"
  }'
```

### Cancelar una Venta

```bash
curl -X POST http://localhost:3000/api/v1/sales/VENTA_ID/cancel \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "motivo": "Cliente devolvió la mercadería"
  }'
```

El sistema automáticamente:
- Restaura el stock
- Revierte los movimientos de cuenta corriente
- Registra la cancelación en la auditoría

---

## 🔍 Usando Postman o Similar

### Configurar Postman

1. Abre Postman
2. Crea una nueva colección llamada "Sol Verde POS"
3. Crea una variable de entorno `BASE_URL` con valor `http://localhost:3000/api/v1`
4. Crea una variable de entorno `TOKEN` (la llenarás después del login)

### Request de Login

```
POST {{BASE_URL}}/auth/login
Content-Type: application/json

Body:
{
  "username": "admin",
  "password": "admin123"
}
```

Después del login, copia el token de la respuesta y pégalo en la variable `TOKEN`.

### Requests Posteriores

Todos los demás requests deben incluir el header:

```
Authorization: Bearer {{TOKEN}}
```

---

## 📱 Tipos de Venta

### Venta al Contado

```json
{
  "tipo_venta": "contado",
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 2500
    }
  ]
}
```

### Venta a Crédito

```json
{
  "tipo_venta": "credito",
  "pagos": []  // Sin pagos inmediatos
}
```

El sistema:
- Verifica que el cliente no exceda su límite de crédito
- Registra la deuda en cuenta corriente
- El saldo se actualiza automáticamente

### Venta Parcial (Seña)

```json
{
  "tipo_venta": "parcial",
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 1000  // Solo una parte del total
    }
  ]
}
```

El resto queda como saldo a pagar.

---

## 💳 Métodos de Pago Disponibles

Puedes usar estos métodos en el array `pagos`:

1. **efectivo** - Pago en efectivo
2. **transferencia** - Transferencia bancaria
3. **debito** - Tarjeta de débito
4. **credito** - Tarjeta de crédito
5. **cheque** - Pago con cheque
6. **otro** - Otro método

Ejemplo con múltiples métodos:

```json
{
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 1000
    },
    {
      "metodo": "transferencia",
      "monto": 1500,
      "banco": "Banco Galicia",
      "referencia": "TRF123456"
    }
  ]
}
```

---

## 📏 Unidades de Medida Soportadas

Al crear productos puedes usar estas unidades:

- `kg` - Kilogramo
- `gr` - Gramo
- `unidad` - Por unidad
- `bulto` - Bulto
- `cajon` - Cajón
- `litro` - Litro

---

## 🔒 Roles y Permisos

### Dueño (Rol: dueño)
- ✅ Ver todo
- ✅ Crear todo
- ✅ Modificar todo
- ✅ Eliminar todo
- ✅ Cancelar ventas
- ✅ Ajustar stock

### Administrativo (Rol: administrativo)
- ✅ Ver todo
- ✅ Crear clientes, productos, ventas
- ✅ Modificar clientes, productos
- ✅ Cancelar ventas
- ✅ Ajustar stock
- ❌ No puede eliminar

### Vendedor (Rol: vendedor)
- ✅ Ver clientes, productos, ventas
- ✅ Crear clientes, ventas
- ✅ Operar caja
- ❌ No puede modificar productos
- ❌ No puede eliminar
- ❌ No puede cancelar ventas
- ❌ No puede ajustar stock

### Contabilidad (Rol: contabilidad)
- ✅ Ver reportes
- ✅ Ver cuenta corriente
- ✅ Ver ventas
- ❌ No puede crear ventas
- ❌ No puede operar caja

---

## 🆘 Solución de Problemas

### Error: "Token inválido"

**Solución**: Vuelve a hacer login para obtener un nuevo token.

### Error: "Puerto 3000 ya está en uso"

**Solución**: 
```bash
# Cambiar puerto en .env
PORT=3001
```

### Error: "No se puede conectar a la base de datos"

**Solución**:
```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps

# O si es manual
pg_isready
```

### Error: "Límite de crédito excedido"

**Solución**: El cliente no tiene suficiente crédito disponible. Opciones:
1. Aumentar el límite de crédito del cliente
2. Registrar un pago primero
3. Hacer la venta al contado

### Ver Logs del Sistema

```bash
# Con Docker
docker-compose logs -f backend

# Sin Docker
tail -f logs/combined.log
```

---

## 📚 Documentación Adicional

Para más detalles, consulta:

- `EXPLICACION_ESPANOL.md` - Qué se hizo y por qué
- `API.md` - Documentación completa de la API (en inglés)
- `DEPLOYMENT.md` - Guía de despliegue a producción (en inglés)
- `README.md` - Información general del proyecto

---

## 🎓 Ejemplos Completos

### Ejemplo 1: Flujo de Venta Completo

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

# 2. Ver clientes
curl -s http://localhost:3000/api/v1/clients \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Ver productos
curl -s http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" | jq

# 4. Abrir caja (guarda el turno_id de la respuesta)
curl -s -X POST http://localhost:3000/api/v1/caja/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caja_id": "CAJA_ID",
    "monto_apertura": 10000
  }' | jq

# 5. Crear venta
curl -s -X POST http://localhost:3000/api/v1/sales \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "CLIENTE_ID",
    "turno_id": "TURNO_ID",
    "tipo_venta": "contado",
    "items": [
      {
        "producto_id": "PRODUCTO_ID",
        "cantidad": 5,
        "precio_unitario": 250
      }
    ],
    "pagos": [
      {
        "metodo": "efectivo",
        "monto": 1250
      }
    ]
  }' | jq

# 6. Ver turno actual
curl -s http://localhost:3000/api/v1/caja/current \
  -H "Authorization: Bearer $TOKEN" | jq

# 7. Cerrar caja
curl -s -X POST http://localhost:3000/api/v1/caja/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "turno_id": "TURNO_ID",
    "monto_cierre": 11250
  }' | jq
```

---

## ✅ Checklist de Inicio

- [ ] Docker instalado (o Node.js + PostgreSQL)
- [ ] Repositorio clonado
- [ ] Archivo `.env` configurado
- [ ] Servicios iniciados (`docker-compose up -d`)
- [ ] Base de datos inicializada (`npm run db:migrate`)
- [ ] Sistema verificado (curl http://localhost:3000/health)
- [ ] Login exitoso
- [ ] Token guardado
- [ ] Primera consulta realizada

---

## 🎯 Próximos Pasos

1. ✅ Familiarízate con la API usando Postman
2. ✅ Carga tus clientes reales
3. ✅ Carga tus productos reales
4. ✅ Haz ventas de prueba
5. ✅ Cambia las contraseñas por defecto
6. ⏭️ Espera el desarrollo del frontend para una interfaz gráfica

---

**¡Ya puedes empezar a usar tu sistema POS profesional! 🎉**

Para cualquier duda, revisa la documentación o contacta al equipo de desarrollo.
