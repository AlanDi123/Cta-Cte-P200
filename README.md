# Sol & Verde - Sistema POS Mayorista Profesional

**Versión 3.0.0** - Sistema completo de punto de venta para comercio mayorista de verduras y hortalizas.

## 📖 Documentación en Español

- **[¿Qué se Hizo?](EXPLICACION_ESPANOL.md)** - Explicación completa de la transformación
- **[Guía de Uso Paso a Paso](GUIA_USO_ESPANOL.md)** - Cómo usar el sistema
- **[Referencia Rápida](REFERENCIA_RAPIDA.md)** - Comandos y ejemplos más usados

---

## 🚀 Características Principales

### ✅ Completado - Fase 1: Arquitectura y Fundamentos

- **Base de Datos PostgreSQL**
  - Schema normalizado completo con 20+ tablas
  - Relaciones, índices y triggers optimizados
  - Auditoría automática de todas las operaciones
  - Vistas materializadas para reportes rápidos

- **Backend API REST**
  - Node.js + Express
  - Arquitectura modular y escalable
  - API versionada (/api/v1/)
  - Documentación automática de endpoints

- **Seguridad Implementada**
  - Autenticación JWT
  - Hashing de contraseñas con bcrypt
  - Roles de usuario (Dueño, Vendedor, Administrativo, Contabilidad)
  - Protección contra SQL Injection, XSS, CSRF
  - Rate limiting
  - Helmet.js para headers de seguridad

- **Infraestructura**
  - Docker + Docker Compose ready
  - PostgreSQL containerizado
  - Backups automáticos configurables
  - Health checks
  - Logs centralizados con Winston

### 🏗️ En Desarrollo - Próximas Fases

- **Módulos de Negocio**
  - Gestión completa de clientes
  - Catálogo de productos con inventario
  - Sistema de ventas y facturación
  - Caja registradora (apertura/cierre/arqueo)
  - Compras y proveedores
  - Cuenta corriente de clientes

- **Hardware Integration**
  - Impresoras térmicas
  - Lectores de código de barras
  - Cajón portamonedas
  - Balanzas electrónicas (futuro)

- **Frontend Moderno**
  - React + Vite
  - PWA (Progressive Web App)
  - Diseño responsive
  - Modo oscuro
  - Optimizado para tablets y móviles

## 📋 Requisitos del Sistema

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Docker (opcional pero recomendado)
- npm >= 9.0.0

## 🔧 Instalación

### Opción 1: Docker (Recomendado)

```bash
# Clonar repositorio
git clone https://github.com/AlanDi123/Cta-Cte-P200.git
cd Cta-Cte-P200

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus configuraciones
nano .env

# Levantar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f backend
```

### Opción 2: Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/AlanDi123/Cta-Cte-P200.git
cd Cta-Cte-P200

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
nano .env

# Crear base de datos PostgreSQL
createdb solverdepos

# Ejecutar migraciones
psql solverdepos < backend/database/init.sql

# Iniciar servidor
npm run dev
```

## 🗄️ Base de Datos

### Schema Principal

El sistema utiliza un schema normalizado con las siguientes tablas principales:

- **usuarios** - Usuarios del sistema con roles
- **clientes** - Clientes mayoristas y minoristas
- **proveedores** - Proveedores de mercadería
- **productos** - Catálogo de productos
- **categorias** - Categorías de productos
- **lotes** - Control de lotes y vencimientos
- **ventas** - Registro de ventas
- **ventas_detalle** - Líneas de cada venta
- **compras** - Órdenes de compra
- **cajas** - Cajas registradoras
- **turnos_caja** - Turnos de caja
- **movimientos_caja** - Movimientos de caja
- **cuenta_corriente** - Cuenta corriente de clientes
- **pagos** - Registro de pagos
- **movimientos_stock** - Trazabilidad de stock
- **auditoria** - Log completo de auditoría
- **configuracion** - Configuración del sistema

### Migración desde Google Sheets

```bash
# Exportar datos desde Google Apps Script
# Usar endpoint: /api/legacy/exportData

# Importar a PostgreSQL
npm run db:import
```

## 🔐 Autenticación y Seguridad

### Login

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "tu_password"
}
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
      "rol": "dueño"
    }
  }
}
```

### Uso del Token

Incluir en header de todas las requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Roles y Permisos

- **dueño**: Acceso total al sistema
- **vendedor**: Ventas, clientes, productos (lectura)
- **administrativo**: Reportes, configuración
- **contabilidad**: Reportes financieros, cuenta corriente

## 📡 API Endpoints

### Autenticación
- `POST /api/v1/auth/login` - Iniciar sesión
- `POST /api/v1/auth/logout` - Cerrar sesión
- `POST /api/v1/auth/refresh` - Refrescar token
- `GET /api/v1/auth/me` - Info usuario actual
- `POST /api/v1/auth/change-password` - Cambiar contraseña

### Usuarios
- `GET /api/v1/users` - Listar usuarios
- `GET /api/v1/users/:id` - Obtener usuario
- `POST /api/v1/users` - Crear usuario
- `PUT /api/v1/users/:id` - Actualizar usuario
- `DELETE /api/v1/users/:id` - Eliminar usuario

### Clientes
- `GET /api/v1/clients` - Listar clientes
- `GET /api/v1/clients/:id` - Obtener cliente
- `POST /api/v1/clients` - Crear cliente
- `PUT /api/v1/clients/:id` - Actualizar cliente
- `GET /api/v1/clients/:id/cuenta-corriente` - Ver cuenta corriente

### Productos
- `GET /api/v1/products` - Listar productos
- `GET /api/v1/products/:id` - Obtener producto
- `POST /api/v1/products` - Crear producto
- `PUT /api/v1/products/:id` - Actualizar producto
- `GET /api/v1/products/stock/critical` - Stock crítico

### Ventas
- `GET /api/v1/sales` - Listar ventas
- `GET /api/v1/sales/:id` - Obtener venta
- `POST /api/v1/sales` - Crear venta
- `POST /api/v1/sales/:id/cancel` - Cancelar venta

### Caja
- `POST /api/v1/caja/open` - Abrir turno
- `POST /api/v1/caja/close` - Cerrar turno
- `GET /api/v1/caja/current` - Turno actual
- `POST /api/v1/caja/movement` - Registrar movimiento

### Reportes
- `GET /api/v1/reports/sales` - Reporte de ventas
- `GET /api/v1/reports/cash` - Reporte de caja
- `GET /api/v1/reports/stock` - Reporte de stock
- `GET /api/v1/reports/clients` - Reporte de clientes

### Dashboard
- `GET /api/v1/dashboard/kpis` - Indicadores clave
- `GET /api/v1/dashboard/charts` - Datos para gráficos

## 🐳 Docker

### Servicios

- **postgres**: Base de datos PostgreSQL 16
- **backend**: API REST Node.js
- **redis**: Cache (para futuras optimizaciones)

### Comandos Útiles

```bash
# Iniciar servicios
docker-compose up -d

# Detener servicios
docker-compose down

# Ver logs
docker-compose logs -f

# Reiniciar servicio específico
docker-compose restart backend

# Acceder a PostgreSQL
docker-compose exec postgres psql -U postgres -d solverdepos

# Backup de base de datos
docker-compose exec postgres pg_dump -U postgres solverdepos > backup.sql

# Restaurar base de datos
docker-compose exec -T postgres psql -U postgres solverdepos < backup.sql
```

## 📊 Modelo de Datos

### Unidades de Medida Soportadas

- `kg` - Kilogramo
- `gr` - Gramo
- `unidad` - Unidad
- `bulto` - Bulto
- `cajon` - Cajón
- `litro` - Litro

### Tipos de Comprobantes

- `A` - Factura A
- `B` - Factura B
- `C` - Factura C
- `X` - Comprobante X
- `ticket` - Ticket (no fiscal)

### Estados de Venta

- `pendiente` - Venta pendiente
- `completada` - Venta completada
- `cancelada` - Venta cancelada
- `anulada` - Venta anulada

## 🔄 Ciclo de Venta Típico

1. **Apertura de Turno**: El vendedor abre su turno en caja
2. **Selección de Cliente**: Búsqueda y selección del cliente
3. **Armado de Venta**: Agregar productos al carrito
4. **Aplicación de Descuentos**: Descuentos por volumen o cliente
5. **Selección de Tipo**: Contado, crédito o parcial
6. **Procesamiento de Pago**: Registro de pago (efectivo, transferencia, etc)
7. **Generación de Comprobante**: Ticket o factura electrónica
8. **Actualización de Stock**: Descuento automático de stock
9. **Actualización de Cuenta Corriente**: Si es venta a crédito
10. **Cierre de Turno**: Arqueo y cierre de caja

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Tests con watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 📝 Logs

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores

En desarrollo, los logs también se muestran en consola con colores.

## 🔐 Seguridad

### Variables de Entorno Críticas

**NUNCA** commitear el archivo `.env` al repositorio.

Variables que DEBES cambiar en producción:
- `JWT_SECRET` - Clave secreta para JWT
- `DB_PASSWORD` - Contraseña de PostgreSQL
- `AFIP_CERT_PATH` y `AFIP_KEY_PATH` - Certificados AFIP

### Recomendaciones de Seguridad

- Usar HTTPS en producción
- Cambiar todos los secrets por defecto
- Configurar firewall para exponer solo puertos necesarios
- Realizar backups regulares
- Actualizar dependencias regularmente
- Revisar logs de auditoría periódicamente

## 📦 Estructura del Proyecto

```
Cta-Cte-P200/
├── backend/
│   ├── config.js              # Configuración
│   ├── server.js              # Servidor principal
│   ├── healthcheck.js         # Health check para Docker
│   ├── database/
│   │   ├── init.sql           # Schema PostgreSQL
│   │   └── connection.js      # Pool de conexiones
│   ├── routes/                # Rutas de API
│   ├── controllers/           # Lógica de negocio
│   ├── models/                # Modelos de datos
│   ├── middleware/            # Middleware (auth, audit, etc)
│   ├── services/              # Servicios (email, AFIP, etc)
│   ├── utils/                 # Utilidades
│   └── scripts/               # Scripts de migración
├── frontend/                  # Frontend (próximamente)
├── logs/                      # Logs
├── uploads/                   # Archivos subidos
├── backups/                   # Backups automáticos
├── docker-compose.yml         # Docker Compose
├── Dockerfile                 # Dockerfile
├── package.json               # Dependencias
└── README.md                  # Este archivo
```

## 🚀 Roadmap

### Fase 1: Arquitectura ✅
- [x] PostgreSQL schema
- [x] Backend API structure
- [x] Authentication & authorization
- [x] Docker environment
- [x] Logging & monitoring

### Fase 2: Core Features (En Progreso)
- [ ] User management CRUD
- [ ] Client management CRUD
- [ ] Product catalog CRUD
- [ ] Inventory management
- [ ] Sales processing
- [ ] Cash register operations

### Fase 3: Advanced Features
- [ ] Purchase orders
- [ ] Supplier management
- [ ] Electronic invoicing (AFIP)
- [ ] WhatsApp/Email notifications
- [ ] Advanced reports
- [ ] Dashboard with charts

### Fase 4: Frontend & UX
- [ ] React frontend
- [ ] POS interface
- [ ] Admin panel
- [ ] Mobile responsive
- [ ] PWA capabilities
- [ ] Offline mode

### Fase 5: Integration & Hardware
- [ ] Thermal printer integration
- [ ] Barcode scanner support
- [ ] Cash drawer integration
- [ ] Electronic scale support
- [ ] External API integrations

### Fase 6: Production Ready
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] User documentation
- [ ] Deployment automation

## 📞 Soporte

Para reportar problemas o sugerir mejoras, por favor abrir un issue en GitHub.

## 📄 Licencia

MIT License - Ver archivo LICENSE para más detalles.

## 👥 Contribución

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

---

**Sol & Verde POS** - Sistema Profesional para Comercio Mayorista
