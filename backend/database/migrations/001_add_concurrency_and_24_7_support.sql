-- Migration 001: Add Concurrency Control and 24/7 Support
-- Purpose: Add optimistic locking, performance indexes, and overnight shift support

-- ============================================================================
-- PART 1: OPTIMISTIC LOCKING (Version Columns)
-- ============================================================================
-- Add version columns for concurrent edit detection
ALTER TABLE productos ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Create trigger to auto-increment version on updates
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply version trigger to tables with optimistic locking
DROP TRIGGER IF EXISTS productos_increment_version ON productos;
CREATE TRIGGER productos_increment_version
    BEFORE UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS clientes_increment_version ON clientes;
CREATE TRIGGER clientes_increment_version
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS ventas_increment_version ON ventas;
CREATE TRIGGER ventas_increment_version
    BEFORE UPDATE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS usuarios_increment_version ON usuarios;
CREATE TRIGGER usuarios_increment_version
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS turnos_caja_increment_version ON turnos_caja;
CREATE TRIGGER turnos_caja_increment_version
    BEFORE UPDATE ON turnos_caja
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

-- ============================================================================
-- PART 2: PERFORMANCE INDEXES
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_created_by ON usuarios(created_by);

-- Clients table indexes
CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);
CREATE INDEX IF NOT EXISTS idx_clientes_saldo ON clientes(saldo);
CREATE INDEX IF NOT EXISTS idx_clientes_activo_saldo ON clientes(activo, saldo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_clientes_created_by ON clientes(created_by);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_productos_stock_critical ON productos(stock_actual, stock_minimo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_productos_precio_venta ON productos(precio_venta) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_created_by ON productos(created_by);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras);

-- Ventas table indexes
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_usuario ON ventas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado);
CREATE INDEX IF NOT EXISTS idx_ventas_tipo ON ventas(tipo_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_estado ON ventas(fecha, estado);

-- Ventas detalle indexes
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_producto ON ventas_detalle(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta ON ventas_detalle(venta_id);

-- Pagos indexes
CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_metodo ON pagos(metodo);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_metodo_fecha ON pagos(metodo, fecha);

-- Caja tables indexes (CRITICAL for 24/7 operations)
CREATE INDEX IF NOT EXISTS idx_cajas_activa ON cajas(activa);
CREATE INDEX IF NOT EXISTS idx_cajas_sucursal ON cajas(sucursal_id);

CREATE INDEX IF NOT EXISTS idx_turnos_caja_estado ON turnos_caja(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_caja ON turnos_caja(caja_id);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_usuario ON turnos_caja(usuario_id);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_fecha_apertura ON turnos_caja(fecha_apertura);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_estado_caja ON turnos_caja(estado, caja_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_turno ON movimientos_caja(turno_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tipo ON movimientos_caja(tipo);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_medio_pago ON movimientos_caja(medio_pago);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha ON movimientos_caja(fecha);

-- Cuenta corriente indexes
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_cliente ON cuenta_corriente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_fecha ON cuenta_corriente(fecha);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_tipo ON cuenta_corriente(tipo);

-- Movimientos stock indexes
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_fecha ON movimientos_stock(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tipo ON movimientos_stock(tipo);

-- Lotes indexes
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_proveedor ON lotes(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fecha_vencimiento ON lotes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_lotes_producto_numero ON lotes(producto_id, numero_lote);

-- Compras indexes
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_usuario ON compras(usuario_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras(estado);

-- Auditoria indexes (CRITICAL for audit trails)
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla ON auditoria(tabla);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_registro ON auditoria(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);

-- ============================================================================
-- PART 3: 24/7 SHIFT SUPPORT (Overnight Operations)
-- ============================================================================

-- Add overnight shift support
ALTER TABLE turnos_caja 
    ADD COLUMN IF NOT EXISTS fecha_cierre_oficial DATE,
    ADD COLUMN IF NOT EXISTS es_overnight BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
    ADD COLUMN IF NOT EXISTS notas_cierre TEXT;

-- Create shift template table for recurring shifts
CREATE TABLE IF NOT EXISTS turno_plantillas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    es_overnight BOOLEAN DEFAULT FALSE,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comment explaining overnight shifts
COMMENT ON COLUMN turnos_caja.es_overnight IS 'Indica si el turno cruza medianoche (ej: 22:00 a 06:00)';
COMMENT ON COLUMN turnos_caja.fecha_cierre_oficial IS 'Fecha oficial del cierre (puede ser diferente a fecha_cierre para turnos overnight)';
COMMENT ON COLUMN turnos_caja.timezone IS 'Zona horaria del turno para cálculos de fecha correctos';

-- ============================================================================
-- PART 4: AUTOMATIC CALCULATION TRIGGERS
-- ============================================================================

-- Trigger to automatically calculate venta totals
CREATE OR REPLACE FUNCTION calcular_totales_venta()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ventas
    SET 
        subtotal = (
            SELECT COALESCE(SUM(cantidad * precio_unitario - descuento), 0)
            FROM ventas_detalle
            WHERE venta_id = NEW.venta_id
        ),
        total_iva = (
            SELECT COALESCE(SUM((cantidad * precio_unitario - descuento) * 0.21), 0)
            FROM ventas_detalle
            WHERE venta_id = NEW.venta_id
        ),
        total = (
            SELECT COALESCE(SUM((cantidad * precio_unitario - descuento) * 1.21), 0)
            FROM ventas_detalle
            WHERE venta_id = NEW.venta_id
        )
    WHERE id = NEW.venta_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calcular_totales_venta ON ventas_detalle;
CREATE TRIGGER trigger_calcular_totales_venta
    AFTER INSERT OR UPDATE OR DELETE ON ventas_detalle
    FOR EACH ROW
    EXECUTE FUNCTION calcular_totales_venta();

-- Trigger to automatically update stock from movimientos_stock
CREATE OR REPLACE FUNCTION actualizar_stock_desde_movimiento()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo IN ('entrada', 'ajuste_positivo', 'devolucion') THEN
        UPDATE productos
        SET stock_actual = stock_actual + NEW.cantidad
        WHERE id = NEW.producto_id;
    ELSIF NEW.tipo IN ('salida', 'ajuste_negativo', 'venta') THEN
        UPDATE productos
        SET stock_actual = stock_actual - NEW.cantidad
        WHERE id = NEW.producto_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_stock ON movimientos_stock;
CREATE TRIGGER trigger_actualizar_stock
    AFTER INSERT ON movimientos_stock
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_stock_desde_movimiento();

-- ============================================================================
-- PART 5: AUDIT TRIGGER (Automatic Audit Trail)
-- ============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION registrar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Try to get current user from session variable (set by application)
    v_user_id := current_setting('app.current_user_id', TRUE)::UUID;
    
    IF TG_OP = 'DELETE' THEN
        INSERT INTO auditoria (
            tabla, 
            registro_id, 
            accion, 
            datos_anteriores, 
            usuario_id
        ) VALUES (
            TG_TABLE_NAME,
            OLD.id::TEXT,
            'DELETE',
            row_to_json(OLD),
            v_user_id
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO auditoria (
            tabla, 
            registro_id, 
            accion, 
            datos_anteriores, 
            datos_nuevos,
            usuario_id
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id::TEXT,
            'UPDATE',
            row_to_json(OLD),
            row_to_json(NEW),
            v_user_id
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO auditoria (
            tabla, 
            registro_id, 
            accion, 
            datos_nuevos,
            usuario_id
        ) VALUES (
            TG_TABLE_NAME,
            NEW.id::TEXT,
            'INSERT',
            row_to_json(NEW),
            v_user_id
        );
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to critical tables
DROP TRIGGER IF EXISTS audit_productos ON productos;
CREATE TRIGGER audit_productos
    AFTER INSERT OR UPDATE OR DELETE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

DROP TRIGGER IF EXISTS audit_clientes ON clientes;
CREATE TRIGGER audit_clientes
    AFTER INSERT OR UPDATE OR DELETE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

DROP TRIGGER IF EXISTS audit_ventas ON ventas;
CREATE TRIGGER audit_ventas
    AFTER INSERT OR UPDATE OR DELETE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

DROP TRIGGER IF EXISTS audit_pagos ON pagos;
CREATE TRIGGER audit_pagos
    AFTER INSERT OR UPDATE OR DELETE ON pagos
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

DROP TRIGGER IF EXISTS audit_turnos_caja ON turnos_caja;
CREATE TRIGGER audit_turnos_caja
    AFTER INSERT OR UPDATE OR DELETE ON turnos_caja
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

DROP TRIGGER IF EXISTS audit_usuarios ON usuarios;
CREATE TRIGGER audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

-- ============================================================================
-- PART 6: CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Prevent duplicate payments (idempotency)
ALTER TABLE pagos 
    DROP CONSTRAINT IF EXISTS uq_pagos_referencia;

-- Add unique index to prevent near-duplicate payments
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_venta_metodo_monto_fecha 
    ON pagos(venta_id, metodo, monto, DATE(fecha))
    WHERE metodo IS NOT NULL;

-- Ensure turno can't be closed without fecha_cierre
ALTER TABLE turnos_caja 
    DROP CONSTRAINT IF EXISTS chk_turno_cierre_valido;
    
ALTER TABLE turnos_caja
    ADD CONSTRAINT chk_turno_cierre_valido
    CHECK (estado != 'cerrado' OR fecha_cierre IS NOT NULL);

-- Ensure products with stock tracking have valid stock
ALTER TABLE productos
    DROP CONSTRAINT IF EXISTS chk_stock_valido;
    
ALTER TABLE productos
    ADD CONSTRAINT chk_stock_valido
    CHECK (stock_actual >= 0);

-- Ensure sale totals are positive
ALTER TABLE ventas
    DROP CONSTRAINT IF EXISTS chk_venta_total_valido;
    
ALTER TABLE ventas
    ADD CONSTRAINT chk_venta_total_valido
    CHECK (total >= 0);

-- ============================================================================
-- PART 7: VIEWS FOR COMMON QUERIES (Performance Optimization)
-- ============================================================================

-- View for active open shifts (24/7 critical)
CREATE OR REPLACE VIEW v_turnos_activos AS
SELECT 
    tc.*,
    c.nombre as nombre_caja,
    u.username as nombre_usuario,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - tc.fecha_apertura))/3600 AS horas_abierto
FROM turnos_caja tc
JOIN cajas c ON tc.caja_id = c.id
JOIN usuarios u ON tc.usuario_id = u.id
WHERE tc.estado = 'abierto';

-- View for client account balance summary
CREATE OR REPLACE VIEW v_saldos_clientes AS
SELECT 
    c.id,
    c.codigo,
    c.nombre,
    c.saldo,
    c.limite_credito,
    c.limite_credito - c.saldo AS credito_disponible,
    CASE 
        WHEN c.saldo > c.limite_credito THEN 'excedido'
        WHEN c.saldo > c.limite_credito * 0.8 THEN 'proximo_limite'
        ELSE 'normal'
    END AS estado_credito,
    (
        SELECT MIN(fecha)
        FROM cuenta_corriente
        WHERE cliente_id = c.id 
        AND tipo = 'venta'
        AND saldo > 0
    ) AS deuda_mas_antigua
FROM clientes c
WHERE c.activo = true;

-- View for critical stock products
CREATE OR REPLACE VIEW v_stock_critico AS
SELECT 
    p.id,
    p.codigo,
    p.nombre,
    p.stock_actual,
    p.stock_minimo,
    cat.nombre AS categoria,
    p.precio_venta,
    ROUND((p.stock_minimo - p.stock_actual) * p.precio_compra, 2) AS costo_reposicion
FROM productos p
LEFT JOIN categorias cat ON p.categoria_id = cat.id
WHERE p.activo = true
AND p.stock_actual <= p.stock_minimo
ORDER BY (p.stock_minimo - p.stock_actual) DESC;

-- View for sales summary by day (for reports)
CREATE OR REPLACE VIEW v_ventas_diarias AS
SELECT 
    DATE(v.fecha) AS fecha,
    COUNT(*) AS cantidad_ventas,
    SUM(v.total) AS total_ventas,
    SUM(CASE WHEN v.tipo_venta = 'contado' THEN v.total ELSE 0 END) AS total_contado,
    SUM(CASE WHEN v.tipo_venta = 'credito' THEN v.total ELSE 0 END) AS total_credito,
    COUNT(DISTINCT v.cliente_id) AS clientes_distintos,
    AVG(v.total) AS ticket_promedio
FROM ventas v
WHERE v.estado = 'completada'
GROUP BY DATE(v.fecha)
ORDER BY DATE(v.fecha) DESC;

-- ============================================================================
-- PART 8: FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Function to recalculate client balance from movements (data integrity)
CREATE OR REPLACE FUNCTION recalcular_saldo_cliente(p_cliente_id UUID)
RETURNS DECIMAL(12, 2) AS $$
DECLARE
    v_saldo DECIMAL(12, 2);
BEGIN
    -- Calculate balance from all movements
    SELECT COALESCE(SUM(
        CASE 
            WHEN tipo IN ('venta', 'nota_debito', 'ajuste_debito') THEN monto
            WHEN tipo IN ('pago', 'nota_credito', 'ajuste_credito') THEN -monto
            ELSE 0
        END
    ), 0)
    INTO v_saldo
    FROM cuenta_corriente
    WHERE cliente_id = p_cliente_id;
    
    -- Update client record
    UPDATE clientes
    SET saldo = v_saldo
    WHERE id = p_cliente_id;
    
    RETURN v_saldo;
END;
$$ LANGUAGE plpgsql;

-- Function to check if shift can be closed
CREATE OR REPLACE FUNCTION puede_cerrar_turno(p_turno_id UUID)
RETURNS TABLE(puede_cerrar BOOLEAN, razon TEXT) AS $$
DECLARE
    v_estado VARCHAR(20);
    v_tiene_pendientes BOOLEAN;
BEGIN
    -- Check shift status
    SELECT estado INTO v_estado
    FROM turnos_caja
    WHERE id = p_turno_id;
    
    IF v_estado IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Turno no encontrado';
        RETURN;
    END IF;
    
    IF v_estado != 'abierto' THEN
        RETURN QUERY SELECT FALSE, 'El turno ya está ' || v_estado;
        RETURN;
    END IF;
    
    -- Check for pending operations (example: uncompleted sales)
    -- This would be customized based on business rules
    
    RETURN QUERY SELECT TRUE, 'OK';
END;
$$ LANGUAGE plpgsql;

-- Add migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Add concurrency control, 24/7 support, and performance indexes')
ON CONFLICT (version) DO NOTHING;
