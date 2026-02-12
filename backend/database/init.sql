-- ============================================================================
-- SOL & VERDE POS - POSTGRESQL DATABASE SCHEMA
-- Version: 3.0.0
-- Description: Complete database schema for wholesale POS system
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USUARIOS Y AUTENTICACIÓN
-- ============================================================================

CREATE TYPE user_role AS ENUM ('dueño', 'vendedor', 'administrativo', 'contabilidad');
CREATE TYPE user_status AS ENUM ('activo', 'inactivo', 'suspendido');

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    rol user_role NOT NULL DEFAULT 'vendedor',
    status user_status NOT NULL DEFAULT 'activo',
    telefono VARCHAR(20),
    comision_porcentaje DECIMAL(5,2) DEFAULT 0,
    ultimo_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id),
    updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_usuarios_username ON usuarios(username);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);

-- ============================================================================
-- CLIENTES
-- ============================================================================

CREATE TYPE condicion_fiscal AS ENUM ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento');
CREATE TYPE cliente_tipo AS ENUM ('minorista', 'mayorista', 'supermercado', 'restaurante', 'otro');

CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    razon_social VARCHAR(200),
    cuit VARCHAR(13),
    condicion_fiscal condicion_fiscal DEFAULT 'consumidor_final',
    tipo_cliente cliente_tipo DEFAULT 'minorista',
    telefono VARCHAR(20),
    email VARCHAR(100),
    domicilio_fiscal VARCHAR(200),
    ciudad VARCHAR(100),
    provincia VARCHAR(100),
    codigo_postal VARCHAR(10),
    limite_credito DECIMAL(12,2) DEFAULT 0,
    saldo DECIMAL(12,2) DEFAULT 0,
    descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
    observaciones TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id),
    updated_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE INDEX idx_clientes_cuit ON clientes(cuit);
CREATE INDEX idx_clientes_activo ON clientes(activo);

-- ============================================================================
-- PROVEEDORES
-- ============================================================================

CREATE TABLE proveedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    razon_social VARCHAR(200),
    cuit VARCHAR(13),
    condicion_fiscal condicion_fiscal DEFAULT 'responsable_inscripto',
    telefono VARCHAR(20),
    email VARCHAR(100),
    domicilio VARCHAR(200),
    ciudad VARCHAR(100),
    provincia VARCHAR(100),
    contacto_nombre VARCHAR(100),
    contacto_telefono VARCHAR(20),
    observaciones TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_proveedores_nombre ON proveedores(nombre);
CREATE INDEX idx_proveedores_activo ON proveedores(activo);

-- ============================================================================
-- CATEGORÍAS DE PRODUCTOS
-- ============================================================================

CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    codigo VARCHAR(20) UNIQUE,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PRODUCTOS
-- ============================================================================

CREATE TYPE unidad_medida AS ENUM ('kg', 'gr', 'unidad', 'bulto', 'cajon', 'litro');

CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    codigo_barras VARCHAR(50) UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    categoria_id UUID REFERENCES categorias(id),
    unidad_medida unidad_medida DEFAULT 'unidad',
    precio_compra DECIMAL(12,2) DEFAULT 0,
    precio_venta DECIMAL(12,2) NOT NULL,
    precio_mayorista DECIMAL(12,2),
    margen_porcentaje DECIMAL(5,2),
    iva_porcentaje DECIMAL(5,2) DEFAULT 21,
    stock_actual DECIMAL(12,3) DEFAULT 0,
    stock_minimo DECIMAL(12,3) DEFAULT 0,
    stock_maximo DECIMAL(12,3),
    permite_venta_sin_stock BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    imagen_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras);
CREATE INDEX idx_productos_nombre ON productos(nombre);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);

-- ============================================================================
-- LOTES Y VENCIMIENTOS
-- ============================================================================

CREATE TABLE lotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
    numero_lote VARCHAR(50) NOT NULL,
    fecha_vencimiento DATE,
    cantidad DECIMAL(12,3) NOT NULL,
    precio_compra DECIMAL(12,2),
    proveedor_id UUID REFERENCES proveedores(id),
    fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_lotes_producto ON lotes(producto_id);
CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento);

-- ============================================================================
-- MOVIMIENTOS DE STOCK
-- ============================================================================

CREATE TYPE tipo_movimiento_stock AS ENUM ('ingreso', 'egreso', 'ajuste', 'venta', 'compra', 'devolucion', 'merma');

CREATE TABLE movimientos_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID REFERENCES productos(id),
    lote_id UUID REFERENCES lotes(id),
    tipo tipo_movimiento_stock NOT NULL,
    cantidad DECIMAL(12,3) NOT NULL,
    stock_anterior DECIMAL(12,3),
    stock_nuevo DECIMAL(12,3),
    motivo VARCHAR(200),
    referencia_id UUID,  -- ID de venta, compra, etc
    referencia_tipo VARCHAR(50),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_movimientos_stock_producto ON movimientos_stock(producto_id);
CREATE INDEX idx_movimientos_stock_fecha ON movimientos_stock(fecha);
CREATE INDEX idx_movimientos_stock_tipo ON movimientos_stock(tipo);

-- ============================================================================
-- CAJAS Y TURNOS
-- ============================================================================

CREATE TYPE estado_caja AS ENUM ('abierta', 'cerrada', 'arqueo_pendiente');

CREATE TABLE cajas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero INTEGER UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ubicacion VARCHAR(100),
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE turnos_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caja_id UUID REFERENCES cajas(id),
    usuario_id UUID REFERENCES usuarios(id),
    estado estado_caja DEFAULT 'abierta',
    fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,
    monto_apertura DECIMAL(12,2) NOT NULL,
    monto_cierre DECIMAL(12,2),
    monto_esperado DECIMAL(12,2),
    diferencia DECIMAL(12,2),
    observaciones_apertura TEXT,
    observaciones_cierre TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_turnos_caja_usuario ON turnos_caja(usuario_id);
CREATE INDEX idx_turnos_caja_estado ON turnos_caja(estado);
CREATE INDEX idx_turnos_caja_fecha ON turnos_caja(fecha_apertura);

-- ============================================================================
-- MOVIMIENTOS DE CAJA
-- ============================================================================

CREATE TYPE tipo_movimiento_caja AS ENUM ('ingreso', 'egreso', 'venta', 'retiro', 'aporte', 'gasto');

CREATE TABLE movimientos_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    turno_id UUID REFERENCES turnos_caja(id),
    tipo tipo_movimiento_caja NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    concepto VARCHAR(200) NOT NULL,
    medio_pago VARCHAR(50),  -- efectivo, transferencia, tarjeta
    referencia_id UUID,  -- ID de venta, compra, etc
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_movimientos_caja_turno ON movimientos_caja(turno_id);
CREATE INDEX idx_movimientos_caja_tipo ON movimientos_caja(tipo);
CREATE INDEX idx_movimientos_caja_fecha ON movimientos_caja(fecha);

-- ============================================================================
-- VENTAS
-- ============================================================================

CREATE TYPE tipo_venta AS ENUM ('contado', 'credito', 'parcial');
CREATE TYPE estado_venta AS ENUM ('pendiente', 'completada', 'cancelada', 'anulada');
CREATE TYPE tipo_comprobante AS ENUM ('A', 'B', 'C', 'X', 'ticket');

CREATE TABLE ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_venta BIGSERIAL UNIQUE,
    cliente_id UUID REFERENCES clientes(id),
    usuario_id UUID REFERENCES usuarios(id),
    turno_id UUID REFERENCES turnos_caja(id),
    tipo_venta tipo_venta NOT NULL,
    estado estado_venta DEFAULT 'completada',
    tipo_comprobante tipo_comprobante DEFAULT 'B',
    punto_venta INTEGER,
    numero_comprobante BIGINT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(12,2) DEFAULT 0,
    iva DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    pagado DECIMAL(12,2) DEFAULT 0,
    saldo DECIMAL(12,2) DEFAULT 0,
    observaciones TEXT,
    cae VARCHAR(20),  -- AFIP
    cae_vencimiento DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ventas_numero ON ventas(numero_venta);
CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX idx_ventas_usuario ON ventas(usuario_id);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_estado ON ventas(estado);

-- ============================================================================
-- DETALLE DE VENTAS
-- ============================================================================

CREATE TABLE ventas_detalle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    lote_id UUID REFERENCES lotes(id),
    cantidad DECIMAL(12,3) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    descuento_porcentaje DECIMAL(5,2) DEFAULT 0,
    iva_porcentaje DECIMAL(5,2) DEFAULT 21,
    subtotal DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ventas_detalle_venta ON ventas_detalle(venta_id);
CREATE INDEX idx_ventas_detalle_producto ON ventas_detalle(producto_id);

-- ============================================================================
-- PAGOS
-- ============================================================================

CREATE TYPE metodo_pago AS ENUM ('efectivo', 'transferencia', 'debito', 'credito', 'cheque', 'otro');

CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venta_id UUID REFERENCES ventas(id),
    cliente_id UUID REFERENCES clientes(id),
    turno_id UUID REFERENCES turnos_caja(id),
    metodo metodo_pago NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    referencia VARCHAR(100),  -- número de transferencia, cheque, etc
    banco VARCHAR(100),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_pagos_venta ON pagos(venta_id);
CREATE INDEX idx_pagos_cliente ON pagos(cliente_id);
CREATE INDEX idx_pagos_fecha ON pagos(fecha);

-- ============================================================================
-- COMPRAS
-- ============================================================================

CREATE TYPE estado_compra AS ENUM ('pendiente', 'recibida', 'parcial', 'cancelada');

CREATE TABLE compras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_compra BIGSERIAL UNIQUE,
    proveedor_id UUID REFERENCES proveedores(id),
    usuario_id UUID REFERENCES usuarios(id),
    estado estado_compra DEFAULT 'pendiente',
    fecha_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_recepcion TIMESTAMP,
    tipo_comprobante tipo_comprobante,
    numero_comprobante VARCHAR(50),
    subtotal DECIMAL(12,2) NOT NULL,
    iva DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    pagado DECIMAL(12,2) DEFAULT 0,
    saldo DECIMAL(12,2) DEFAULT 0,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX idx_compras_fecha ON compras(fecha_pedido);
CREATE INDEX idx_compras_estado ON compras(estado);

-- ============================================================================
-- DETALLE DE COMPRAS
-- ============================================================================

CREATE TABLE compras_detalle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    compra_id UUID REFERENCES compras(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    cantidad DECIMAL(12,3) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    iva_porcentaje DECIMAL(5,2) DEFAULT 21,
    subtotal DECIMAL(12,2) NOT NULL,
    numero_lote VARCHAR(50),
    fecha_vencimiento DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compras_detalle_compra ON compras_detalle(compra_id);
CREATE INDEX idx_compras_detalle_producto ON compras_detalle(producto_id);

-- ============================================================================
-- CUENTA CORRIENTE DE CLIENTES
-- ============================================================================

CREATE TYPE tipo_movimiento_cc AS ENUM ('debe', 'haber', 'venta', 'pago', 'nota_credito', 'nota_debito', 'ajuste');

CREATE TABLE cuenta_corriente (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id),
    tipo tipo_movimiento_cc NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    saldo_anterior DECIMAL(12,2),
    saldo_nuevo DECIMAL(12,2),
    concepto VARCHAR(200),
    referencia_id UUID,  -- ID de venta, pago, etc
    referencia_tipo VARCHAR(50),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    vencimiento DATE,
    created_by UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_cuenta_corriente_cliente ON cuenta_corriente(cliente_id);
CREATE INDEX idx_cuenta_corriente_fecha ON cuenta_corriente(fecha);
CREATE INDEX idx_cuenta_corriente_tipo ON cuenta_corriente(tipo);

-- ============================================================================
-- AUDITORÍA
-- ============================================================================

CREATE TABLE auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tabla VARCHAR(50) NOT NULL,
    registro_id UUID,
    accion VARCHAR(20) NOT NULL,  -- INSERT, UPDATE, DELETE
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id UUID REFERENCES usuarios(id),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auditoria_tabla ON auditoria(tabla);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);

-- ============================================================================
-- CONFIGURACIÓN DEL SISTEMA
-- ============================================================================

CREATE TABLE configuracion (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    descripcion TEXT,
    tipo VARCHAR(20) DEFAULT 'string',  -- string, number, boolean, json
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES usuarios(id)
);

-- ============================================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER trigger_usuarios_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_clientes_updated_at BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_productos_updated_at BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- Función para actualizar saldo de clientes
CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE clientes 
        SET saldo = COALESCE(saldo, 0) + 
            CASE 
                WHEN NEW.tipo IN ('debe', 'venta', 'nota_debito') THEN NEW.monto
                WHEN NEW.tipo IN ('haber', 'pago', 'nota_credito') THEN -NEW.monto
                ELSE 0
            END
        WHERE id = NEW.cliente_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar saldo automáticamente
CREATE TRIGGER trigger_actualizar_saldo_cliente 
    AFTER INSERT ON cuenta_corriente
    FOR EACH ROW EXECUTE FUNCTION actualizar_saldo_cliente();

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Insertar configuración por defecto
INSERT INTO configuracion (clave, valor, descripcion, tipo) VALUES
    ('sistema_nombre', 'Sol & Verde POS', 'Nombre del sistema', 'string'),
    ('limite_credito_default', '50000', 'Límite de crédito por defecto', 'number'),
    ('iva_default', '21', 'Porcentaje de IVA por defecto', 'number'),
    ('backup_retention_days', '30', 'Días de retención de backups', 'number'),
    ('punto_venta', '1', 'Punto de venta AFIP', 'number'),
    ('timezone', 'America/Argentina/Buenos_Aires', 'Zona horaria', 'string');

-- Insertar categorías iniciales
INSERT INTO categorias (nombre, codigo) VALUES
    ('Verduras de Hoja', 'VH'),
    ('Verduras de Fruto', 'VF'),
    ('Verduras de Raíz', 'VR'),
    ('Hortalizas', 'HO'),
    ('Frutas', 'FR'),
    ('Otros', 'OT');

-- Insertar caja default
INSERT INTO cajas (numero, nombre, ubicacion) VALUES
    (1, 'Caja Principal', 'Mostrador Principal');

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista de stock actual por producto
CREATE VIEW vista_stock_productos AS
SELECT 
    p.id,
    p.codigo,
    p.nombre,
    p.unidad_medida,
    p.stock_actual,
    p.stock_minimo,
    p.precio_venta,
    c.nombre as categoria,
    CASE 
        WHEN p.stock_actual <= p.stock_minimo THEN 'CRÍTICO'
        WHEN p.stock_actual <= p.stock_minimo * 1.5 THEN 'BAJO'
        ELSE 'OK'
    END as estado_stock
FROM productos p
LEFT JOIN categorias c ON p.categoria_id = c.id
WHERE p.activo = true;

-- Vista de saldos de clientes
CREATE VIEW vista_saldos_clientes AS
SELECT 
    c.id,
    c.codigo,
    c.nombre,
    c.cuit,
    c.saldo,
    c.limite_credito,
    c.limite_credito - c.saldo as credito_disponible,
    CASE 
        WHEN c.saldo > c.limite_credito THEN 'EXCEDIDO'
        WHEN c.saldo > c.limite_credito * 0.8 THEN 'CRÍTICO'
        ELSE 'OK'
    END as estado_credito
FROM clientes c
WHERE c.activo = true;

-- Vista de ventas del día
CREATE VIEW vista_ventas_dia AS
SELECT 
    DATE(v.fecha) as fecha,
    COUNT(*) as cantidad_ventas,
    SUM(v.total) as total_vendido,
    SUM(v.pagado) as total_cobrado,
    SUM(v.saldo) as total_pendiente,
    u.nombre || ' ' || u.apellido as vendedor
FROM ventas v
LEFT JOIN usuarios u ON v.usuario_id = u.id
WHERE v.estado = 'completada'
GROUP BY DATE(v.fecha), u.nombre, u.apellido;

-- ============================================================================
-- INDICES DE RENDIMIENTO
-- ============================================================================

-- Índices compuestos para queries frecuentes
CREATE INDEX idx_ventas_fecha_estado ON ventas(fecha, estado);
CREATE INDEX idx_movimientos_stock_producto_fecha ON movimientos_stock(producto_id, fecha);
CREATE INDEX idx_cuenta_corriente_cliente_fecha ON cuenta_corriente(cliente_id, fecha);

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE usuarios IS 'Usuarios del sistema con roles y permisos';
COMMENT ON TABLE clientes IS 'Clientes mayoristas y minoristas';
COMMENT ON TABLE productos IS 'Catálogo de productos (verduras y hortalizas)';
COMMENT ON TABLE ventas IS 'Registro de ventas realizadas';
COMMENT ON TABLE cuenta_corriente IS 'Movimientos de cuenta corriente de clientes';
COMMENT ON TABLE auditoria IS 'Log de auditoría de todas las operaciones';

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================
