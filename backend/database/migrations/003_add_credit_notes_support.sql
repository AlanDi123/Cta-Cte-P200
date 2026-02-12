-- Migration 003: Add Credit Notes Support
-- Purpose: Add support for credit notes (notas de crédito) for returns and adjustments

-- ============================================================================
-- PART 1: CREDIT NOTES TABLE
-- ============================================================================

CREATE TYPE tipo_nota_credito AS ENUM ('devolucion', 'ajuste', 'descuento', 'otro');
CREATE TYPE estado_nota_credito AS ENUM ('pendiente', 'aplicada', 'anulada');

CREATE TABLE notas_credito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero BIGSERIAL UNIQUE NOT NULL,
    cliente_id UUID REFERENCES clientes(id) NOT NULL,
    venta_id UUID REFERENCES ventas(id),
    tipo tipo_nota_credito NOT NULL DEFAULT 'devolucion',
    estado estado_nota_credito NOT NULL DEFAULT 'pendiente',
    monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),
    motivo TEXT NOT NULL,
    observaciones TEXT,
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_aplicacion TIMESTAMP,
    aplicada_por UUID REFERENCES usuarios(id),
    created_by UUID REFERENCES usuarios(id) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1 NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE,
    CONSTRAINT chk_monto_positivo CHECK (monto > 0)
);

-- Indexes for credit notes
CREATE INDEX idx_notas_credito_cliente ON notas_credito(cliente_id);
CREATE INDEX idx_notas_credito_venta ON notas_credito(venta_id);
CREATE INDEX idx_notas_credito_estado ON notas_credito(estado);
CREATE INDEX idx_notas_credito_fecha ON notas_credito(fecha_emision);
CREATE INDEX idx_notas_credito_numero ON notas_credito(numero);

-- Version trigger for credit notes
DROP TRIGGER IF EXISTS notas_credito_increment_version ON notas_credito;
CREATE TRIGGER notas_credito_increment_version
    BEFORE UPDATE ON notas_credito
    FOR EACH ROW
    EXECUTE FUNCTION increment_version();

-- Audit trigger for credit notes
DROP TRIGGER IF EXISTS audit_notas_credito ON notas_credito;
CREATE TRIGGER audit_notas_credito
    AFTER INSERT OR UPDATE OR DELETE ON notas_credito
    FOR EACH ROW
    EXECUTE FUNCTION registrar_auditoria();

-- ============================================================================
-- PART 2: CREDIT NOTE DETAILS (FOR PRODUCT RETURNS)
-- ============================================================================

CREATE TABLE notas_credito_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id UUID REFERENCES notas_credito(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    cantidad DECIMAL(12,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    motivo VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notas_credito_detalle_nota ON notas_credito_detalle(nota_credito_id);
CREATE INDEX idx_notas_credito_detalle_producto ON notas_credito_detalle(producto_id);

-- ============================================================================
-- PART 3: UPDATE CUENTA CORRIENTE TYPE
-- ============================================================================

-- Add nota_credito to the existing type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tipo_movimiento_cc'
        AND e.enumlabel = 'nota_credito'
    ) THEN
        ALTER TYPE tipo_movimiento_cc ADD VALUE 'nota_credito';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tipo_movimiento_cc'
        AND e.enumlabel = 'ajuste_credito'
    ) THEN
        ALTER TYPE tipo_movimiento_cc ADD VALUE 'ajuste_credito';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tipo_movimiento_cc'
        AND e.enumlabel = 'ajuste_debito'
    ) THEN
        ALTER TYPE tipo_movimiento_cc ADD VALUE 'ajuste_debito';
    END IF;
END$$;

-- ============================================================================
-- PART 4: FUNCTIONS FOR CREDIT NOTE MANAGEMENT
-- ============================================================================

-- Function to apply credit note to client balance
CREATE OR REPLACE FUNCTION aplicar_nota_credito(p_nota_credito_id UUID, p_usuario_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_nota RECORD;
    v_cliente RECORD;
    v_saldo_anterior DECIMAL(12,2);
    v_saldo_nuevo DECIMAL(12,2);
BEGIN
    -- Get credit note info
    SELECT * INTO v_nota
    FROM notas_credito
    WHERE id = p_nota_credito_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada';
    END IF;
    
    IF v_nota.estado != 'pendiente' THEN
        RAISE EXCEPTION 'Nota de crédito ya fue aplicada o anulada';
    END IF;
    
    -- Lock client for balance update
    SELECT id, saldo INTO v_cliente
    FROM clientes
    WHERE id = v_nota.cliente_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;
    
    v_saldo_anterior := v_cliente.saldo;
    v_saldo_nuevo := v_saldo_anterior - v_nota.monto;
    
    -- Update client balance
    UPDATE clientes
    SET saldo = v_saldo_nuevo,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_nota.cliente_id;
    
    -- Register account movement
    INSERT INTO cuenta_corriente (
        cliente_id,
        tipo,
        monto,
        saldo_anterior,
        saldo_nuevo,
        concepto,
        referencia_id,
        referencia_tipo,
        created_by
    ) VALUES (
        v_nota.cliente_id,
        'nota_credito',
        v_nota.monto,
        v_saldo_anterior,
        v_saldo_nuevo,
        'Nota de Crédito #' || v_nota.numero || ' - ' || v_nota.motivo,
        v_nota.id,
        'nota_credito',
        p_usuario_id
    );
    
    -- Update credit note status
    UPDATE notas_credito
    SET estado = 'aplicada',
        fecha_aplicacion = CURRENT_TIMESTAMP,
        aplicada_por = p_usuario_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_nota_credito_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel credit note
CREATE OR REPLACE FUNCTION anular_nota_credito(p_nota_credito_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE notas_credito
    SET estado = 'anulada',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_nota_credito_id
    AND estado = 'pendiente';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nota de crédito no encontrada o ya procesada';
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: VIEW FOR CREDIT NOTES SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW v_notas_credito_pendientes AS
SELECT 
    nc.id,
    nc.numero,
    nc.cliente_id,
    c.nombre as cliente_nombre,
    nc.tipo,
    nc.monto,
    nc.motivo,
    nc.fecha_emision,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - nc.fecha_emision) as dias_pendiente
FROM notas_credito nc
JOIN clientes c ON nc.cliente_id = c.id
WHERE nc.estado = 'pendiente'
ORDER BY nc.fecha_emision DESC;

-- ============================================================================
-- PART 6: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE notas_credito IS 
    'Credit notes for returns, adjustments, and discounts';

COMMENT ON COLUMN notas_credito.tipo IS 
    'Type of credit note: devolucion (return), ajuste (adjustment), descuento (discount), otro (other)';

COMMENT ON COLUMN notas_credito.estado IS 
    'Status: pendiente (pending), aplicada (applied), anulada (cancelled)';

COMMENT ON FUNCTION aplicar_nota_credito IS 
    'Apply credit note to client balance and create account movement';

COMMENT ON FUNCTION anular_nota_credito IS 
    'Cancel a pending credit note';

-- Add migration tracking
INSERT INTO schema_migrations (version, description)
VALUES ('003', 'Add credit notes support for returns and adjustments')
ON CONFLICT (version) DO NOTHING;
