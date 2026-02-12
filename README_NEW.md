# 🏪 Sol Verde POS - Sistema de Punto de Venta Mayorista Profesional

**Versión 3.0.0** - Sistema completo y profesional para comercio mayorista de verduras, hortalizas y productos perecederos.

## 🌟 Características Principales

### ✅ Sistema Multi-Dispositivo
- **Acceso simultáneo** desde PCs, tablets y celulares
- **Responsive design** optimizado para todos los dispositivos
- **Modo táctil** optimizado para pantallas touch
- **PWA ready** - Instalable como aplicación nativa
- **Modo oscuro** para operación nocturna

### ✅ Frontend Profesional
- **React 18** + **Vite** para máximo rendimiento
- **Tailwind CSS** con tema personalizado
- **Interfaz POS ultrarrápida** optimizada para ventas
- **Dashboard en tiempo real** con KPIs y métricas
- **Gestión completa** de productos, clientes y ventas

### ✅ Backend Robusto
- **Node.js + Express** con arquitectura modular
- **PostgreSQL** con schema normalizado
- **API REST** completa y documentada
- **Autenticación JWT** con roles y permisos
- **Logging centralizado** con Winston

### ✅ Operación 24/7
- **Ventas nocturnas** soportadas
- **Múltiples turnos** (diurno/nocturno)
- **Cajas independientes** por turno y usuario
- **Reportes diferenciados** por franja horaria
- **Sin interrupciones** en cambio de fecha

### ✅ Control de Caja Completo
- **Apertura y cierre** de turno por usuario
- **Arqueo automático** con diferencias
- **Movimientos detallados** (ingresos, egresos, retiros)
- **Historial completo** e inalterable
- **Múltiples cajas** operando simultáneamente

### ✅ Gestión de Ventas
- **Venta rápida** tipo ticket
- **Contado, crédito y parcial**
- **Cuenta corriente** por cliente
- **Límites de crédito** configurables
- **Descuentos** por cliente y volumen
- **Scanner de códigos de barras** integrado

### ✅ Control de Stock
- **Stock en tiempo real** con alertas
- **Múltiples unidades** (kg, unidad, bulto, cajón, litro)
- **Stock mínimo/máximo** configurable
- **Movimientos trazables** de inventario
- **Lotes y vencimientos** (preparado)

### ✅ Reportes Completos
- **Ventas** por período, turno, producto, cliente
- **Caja** con arqueos y movimientos
- **Stock** con valorización
- **Clientes** con historial de compras
- **Ganancias y márgenes** detallados
- **Exportación** a Excel/PDF (próximamente)

### ✅ Seguridad y Auditoría
- **Roles estrictos**: Dueño, Administrativo, Contabilidad, Vendedor
- **Permisos granulares** por recurso y acción
- **Auditoría completa** de todas las operaciones
- **Logs centralizados** con trazabilidad
- **0 vulnerabilidades** en dependencias

## 🚀 Inicio Rápido

### Requisitos Previos
- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm >= 9.0.0

### Instalación con Docker (Recomendado)

```bash
# Clonar repositorio
git clone https://github.com/AlanDi123/Cta-Cte-P200.git
cd Cta-Cte-P200

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Levantar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f backend
```

### Instalación Manual

```bash
# Clonar repositorio
git clone https://github.com/AlanDi123/Cta-Cte-P200.git
cd Cta-Cte-P200

# Instalar dependencias backend
npm install

# Instalar dependencias frontend
cd frontend
npm install
cd ..

# Configurar .env
cp .env.example .env
# Editar .env con tus configuraciones

# Crear base de datos
createdb solverdepos

# Ejecutar migraciones
psql solverdepos < backend/database/init.sql

# Construir frontend
npm run build:frontend

# Iniciar servidor
npm start
```

## 📱 Acceso al Sistema

### Desarrollo
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend API**: http://localhost:3000/api/v1
- **Health Check**: http://localhost:3000/health
- **API Docs**: http://localhost:3000/api/v1/docs

### Producción
- **Aplicación**: http://localhost:3000
- Configure nginx como reverse proxy (ver deploy.sh)

## 👤 Usuarios por Defecto

Después de ejecutar las migraciones, crear un usuario inicial:

```sql
INSERT INTO usuarios (username, email, password_hash, nombre, apellido, rol)
VALUES (
  'admin',
  'admin@solverde.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5gyOx3kO4s9Pe', -- password: admin123
  'Administrador',
  'Sistema',
  'dueño'
);
```

**⚠️ IMPORTANTE**: Cambiar la contraseña inmediatamente después del primer login.

## 📊 Estructura del Proyecto

```
Cta-Cte-P200/
├── backend/                    # Backend Node.js
│   ├── server.js              # Servidor principal
│   ├── config.js              # Configuración
│   ├── controllers/           # Lógica de negocio
│   │   ├── cajaController.js
│   │   ├── clientController.js
│   │   ├── dashboardController.js
│   │   ├── productController.js
│   │   ├── reportController.js
│   │   ├── salesController.js
│   │   └── userController.js
│   ├── database/
│   │   ├── init.sql           # Schema PostgreSQL
│   │   └── connection.js      # Pool de conexiones
│   ├── middleware/
│   │   ├── auth.js            # Autenticación JWT
│   │   └── audit.js           # Auditoría
│   ├── routes/                # Rutas API
│   └── utils/                 # Utilidades
│       └── logger.js          # Logger Winston
├── frontend/                   # Frontend React
│   ├── src/
│   │   ├── components/        # Componentes React
│   │   │   ├── Header.jsx
│   │   │   ├── Layout.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── pages/             # Páginas principales
│   │   │   ├── CashRegister.jsx
│   │   │   ├── Clients.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── POS.jsx        # ⭐ Punto de Venta
│   │   │   ├── Products.jsx
│   │   │   ├── Reports.jsx
│   │   │   ├── Sales.jsx
│   │   │   └── Settings.jsx
│   │   ├── services/          # API services
│   │   │   └── api.js
│   │   ├── store/             # Zustand stores
│   │   │   ├── authStore.js
│   │   │   └── posStore.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── logs/                       # Logs de aplicación
├── uploads/                    # Archivos subidos
├── backups/                    # Backups automáticos
├── deploy.sh                   # Script de despliegue
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

## 🎯 Uso del Sistema

### Punto de Venta (POS)

El POS es el corazón del sistema, optimizado para ventas rápidas:

1. **Seleccionar Cliente** (opcional para ventas al contado)
2. **Buscar Productos**:
   - Por nombre (búsqueda incremental)
   - Por código de barras (scanner)
   - Por código de producto
3. **Agregar al Carrito** con cantidad
4. **Aplicar Descuentos** (si aplica)
5. **Seleccionar Tipo de Pago**:
   - Contado (efectivo, tarjeta, transferencia)
   - Crédito (cuenta corriente)
   - Parcial (pago inicial + saldo a cuenta)
6. **Completar Venta**

### Caja Registradora

#### Apertura de Turno
1. Ir a **Caja Registradora**
2. Click en **Abrir Turno**
3. Ingresar **saldo inicial** (efectivo en caja)
4. Confirmar apertura

#### Durante el Turno
- Registrar **ingresos** extras
- Registrar **egresos** (gastos)
- Registrar **retiros** de efectivo
- Ver saldo actual en tiempo real

#### Cierre de Turno
1. Click en **Cerrar Turno**
2. Realizar **arqueo** (contar efectivo)
3. Ingresar **saldo real**
4. Sistema calcula diferencia automáticamente
5. Confirmar cierre

### Gestión de Productos

- **Crear** productos con códigos, precios y stock
- **Categorizar** productos
- **Definir** stock mínimo/máximo
- **Ajustar** stock manualmente (con auditoría)
- **Ver** alertas de stock crítico

### Gestión de Clientes

- **Registrar** clientes con datos fiscales
- **Configurar** límites de crédito
- **Aplicar** descuentos personalizados
- **Ver** cuenta corriente y saldo
- **Identificar** clientes morosos

### Reportes

#### Ventas
- Filtrar por fecha, cliente, producto, tipo de venta
- Ver por turno (diurno/nocturno)
- Totales y estadísticas

#### Caja
- Historial de turnos
- Movimientos detallados
- Diferencias y arqueos

#### Stock
- Valorización de inventario
- Productos críticos
- Movimientos de stock

#### Clientes
- Top clientes por compras
- Análisis de deuda
- Comportamiento de compra

## 🔒 Roles y Permisos

### Dueño
- **Acceso total** al sistema
- Gestión de usuarios
- Configuración del sistema
- Todos los reportes

### Administrativo
- Gestión de productos y clientes
- Ventas y caja
- Reportes operativos
- Gestión de usuarios (limitado)

### Contabilidad
- **Solo lectura** de ventas y caja
- Acceso a todos los reportes
- Cuenta corriente de clientes
- No puede operar ventas

### Vendedor
- Crear ventas
- Gestión básica de clientes
- Operar caja (su turno)
- Consulta de productos
- Sin acceso a reportes financieros

## 🔄 Operación Multi-Usuario

El sistema soporta **operación concurrente** de múltiples usuarios:

- **Múltiples cajas** abiertas simultáneamente
- **Diferentes usuarios** vendiendo al mismo tiempo
- **Stock compartido** con actualizaciones en tiempo real
- **Cada vendedor** con su propio turno de caja
- **Consolidación** de todas las operaciones en reportes

## 🌙 Operación Nocturna

El sistema está preparado para **operar 24/7**:

- **Ventas nocturnas** sin restricciones
- **Turnos nocturnos** separados de diurnos
- **Reportes por franja horaria**:
  - Diurno: 6:00 AM - 10:00 PM
  - Nocturno: 10:00 PM - 6:00 AM
- **Cambio de fecha automático** (23:59 → 00:00)
- **Sin pérdida de ventas** en transiciones

## 📈 API REST

### Endpoints Principales

#### Autenticación
```
POST   /api/v1/auth/login              # Iniciar sesión
POST   /api/v1/auth/logout             # Cerrar sesión
GET    /api/v1/auth/me                 # Usuario actual
POST   /api/v1/auth/change-password    # Cambiar contraseña
```

#### Usuarios
```
GET    /api/v1/users                   # Listar usuarios
GET    /api/v1/users/:id               # Obtener usuario
POST   /api/v1/users                   # Crear usuario
PUT    /api/v1/users/:id               # Actualizar usuario
DELETE /api/v1/users/:id               # Eliminar usuario
```

#### Productos
```
GET    /api/v1/products                # Listar productos
POST   /api/v1/products                # Crear producto
GET    /api/v1/products/stock/critical # Stock crítico
POST   /api/v1/products/:id/adjust-stock # Ajustar stock
```

#### Clientes
```
GET    /api/v1/clients                 # Listar clientes
GET    /api/v1/clients/:id/cuenta-corriente # Cuenta corriente
GET    /api/v1/clients/overdue         # Clientes morosos
```

#### Ventas
```
GET    /api/v1/sales                   # Listar ventas
POST   /api/v1/sales                   # Crear venta
POST   /api/v1/sales/:id/cancel        # Cancelar venta
```

#### Caja
```
POST   /api/v1/caja/open               # Abrir turno
POST   /api/v1/caja/close              # Cerrar turno
GET    /api/v1/caja/current            # Turno actual
POST   /api/v1/caja/movement           # Registrar movimiento
```

#### Dashboard
```
GET    /api/v1/dashboard/kpis          # Indicadores clave
GET    /api/v1/dashboard/charts        # Datos para gráficos
```

#### Reportes
```
GET    /api/v1/reports/sales           # Reporte de ventas
GET    /api/v1/reports/cash            # Reporte de caja
GET    /api/v1/reports/stock           # Reporte de stock
GET    /api/v1/reports/clients         # Reporte de clientes
GET    /api/v1/reports/profit          # Reporte de ganancias
```

Para documentación completa, ver [API.md](API.md)

## 🐳 Docker

### Servicios Incluidos
- **postgres**: PostgreSQL 16
- **backend**: API Node.js
- **redis**: Cache (preparado para futuro)

### Comandos Docker

```bash
# Iniciar todo
docker-compose up -d

# Ver logs
docker-compose logs -f backend

# Reiniciar servicio
docker-compose restart backend

# Detener todo
docker-compose down

# Backup de base de datos
docker-compose exec postgres pg_dump -U postgres solverdepos > backup.sql

# Restaurar base de datos
docker-compose exec -T postgres psql -U postgres solverdepos < backup.sql
```

## 💾 Backups

### Backup Manual
```bash
# Con script incluido
./backup.sh

# Manual con pg_dump
pg_dump -U postgres solverdepos > backup_$(date +%Y%m%d).sql
gzip backup_$(date +%Y%m%d).sql
```

### Backup Automático
El script `deploy.sh` configura backups automáticos diarios a las 2 AM.

Backups se guardan en `./backups/` y se conservan por 30 días.

## 🔧 Configuración

### Variables de Entorno Críticas

```bash
# Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solverdepos
DB_USER=postgres
DB_PASSWORD=tu_password_segura

# Servidor
NODE_ENV=production
PORT=3000

# Seguridad
JWT_SECRET=cambia_este_secret_en_produccion
BCRYPT_ROUNDS=12

# CORS
CORS_ORIGIN=https://tudominio.com
```

⚠️ **NUNCA** commitear el archivo `.env` al repositorio.

## 🚀 Despliegue en Producción

### Usando el Script de Despliegue

```bash
chmod +x deploy.sh
./deploy.sh
```

El script automáticamente:
- ✅ Verifica requisitos
- ✅ Instala dependencias
- ✅ Construye el frontend
- ✅ Configura la base de datos
- ✅ Crea servicio systemd
- ✅ Configura nginx
- ✅ Programa backups automáticos

### Despliegue Manual

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para instrucciones detalladas.

## 📱 PWA (Progressive Web App)

El frontend está preparado para funcionar como PWA:

1. Acceder desde navegador móvil
2. Menu → "Añadir a pantalla inicio"
3. Usar como app nativa

**Próximamente**: Modo offline completo con sincronización.

## 🔐 Seguridad

### Mejores Prácticas Implementadas
- ✅ Passwords hasheados con bcrypt (12 rounds)
- ✅ JWT tokens con expiración
- ✅ Rate limiting en API
- ✅ Helmet.js para headers seguros
- ✅ Validación de inputs con Joi
- ✅ Prepared statements (SQL injection protection)
- ✅ CORS configurado
- ✅ Logs de auditoría completos
- ✅ 0 vulnerabilidades en dependencias

### Recomendaciones Adicionales
- [ ] Usar HTTPS en producción (certbot + nginx)
- [ ] Configurar firewall (ufw)
- [ ] Cambiar todos los secrets por defecto
- [ ] Rotación regular de JWT_SECRET
- [ ] Backups cifrados fuera del servidor
- [ ] Monitoreo con herramientas como PM2

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Tests en modo watch
npm run test:watch

# Coverage
npm run test:coverage
```

**Nota**: Tests completos en desarrollo.

## 📚 Documentación Adicional

- **[GUIA_USO_ESPANOL.md](GUIA_USO_ESPANOL.md)** - Guía de uso paso a paso
- **[API.md](API.md)** - Documentación completa de API
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Guía de despliegue detallada
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Resumen del proyecto
- **[REFERENCIA_RAPIDA.md](REFERENCIA_RAPIDA.md)** - Referencia rápida

## 🛠️ Desarrollo

### Ejecutar en Modo Desarrollo

```bash
# Backend (con hot reload)
npm run dev

# Frontend (en otra terminal)
cd frontend
npm run dev
```

### Stack Tecnológico

**Frontend:**
- React 18
- Vite 6
- React Router 7
- Zustand (state management)
- React Query (data fetching)
- Tailwind CSS 4
- Lucide React (icons)
- Axios

**Backend:**
- Node.js 18+
- Express 4
- PostgreSQL 16
- JWT (jsonwebtoken)
- Bcrypt
- Winston (logging)
- Joi (validation)
- Helmet (security)

## 🤝 Contribución

Las contribuciones son bienvenidas:

1. Fork el proyecto
2. Crear feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📜 Licencia

MIT License - Ver [LICENSE](LICENSE) para detalles.

## 📞 Soporte

Para reportar problemas o sugerir mejoras:
- GitHub Issues: https://github.com/AlanDi123/Cta-Cte-P200/issues

## 🙏 Agradecimientos

- Equipo de Sol y Verde por los requisitos y testing
- Comunidad open source por las herramientas utilizadas

---

**Sol & Verde POS v3.0.0** - Sistema Profesional para Comercio Mayorista 🏪
