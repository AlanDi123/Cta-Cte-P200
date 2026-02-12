-- Migration 002: Add Idempotency Keys and Enhanced Concurrency Controls
-- Purpose: Prevent duplicate sales/payments, add stronger concurrency support

-- ============================================================================
-- PART 1: IDEMPOTENCY KEYS
-- ============================================================================

-- Add idempotency key to ventas (sales)
ALTER TABLE ventas 
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
    ADD COLUMN IF NOT EXISTS request_ip VARCHAR(45),
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Create unique index on idempotency_key (prevents duplicate sales)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_idempotency 
    ON ventas(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- Add idempotency key to pagos (payments)
ALTER TABLE pagos 
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
    ADD COLUMN IF NOT EXISTS request_ip VARCHAR(45);

-- Create unique index on idempotency_key (prevents duplicate payments)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_idempotency 
    ON pagos(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- PART 2: ENHANCED STOCK CONTROL
-- ============================================================================

-- Add stock reservation support for concurrent sales
CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
    cantidad DECIMAL(12,3) NOT NULL,
    venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cantidad_positiva CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_producto ON stock_reservations(producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_venta ON stock_reservations(venta_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at);

-- Function to clean expired reservations
CREATE OR REPLACE FUNCTION limpiar_reservas_expiradas()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM stock_reservations
    WHERE expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to check available stock (accounting for reservations)
CREATE OR REPLACE FUNCTION stock_disponible(p_producto_id UUID)
RETURNS DECIMAL(12,3) AS $$
DECLARE
    v_stock_actual DECIMAL(12,3);
    v_stock_reservado DECIMAL(12,3);
BEGIN
    -- Get current stock
    SELECT stock_actual INTO v_stock_actual
    FROM productos
    WHERE id = p_producto_id;
    
    -- Get active reservations
    SELECT COALESCE(SUM(cantidad), 0) INTO v_stock_reservado
    FROM stock_reservations
    WHERE producto_id = p_producto_id
    AND expires_at > CURRENT_TIMESTAMP;
    
    RETURN v_stock_actual - v_stock_reservado;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: SALE STATUS TRACKING
-- ============================================================================

-- Add processing status to prevent duplicate submissions
ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS processing_failed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for finding in-process sales
CREATE INDEX IF NOT EXISTS idx_ventas_processing 
    ON ventas(processing_started_at, processing_completed_at);

-- ============================================================================
-- PART 4: PAYMENT DEDUPLICATION
-- ============================================================================

-- Strengthen payment uniqueness constraint
-- Remove old constraint if exists
DROP INDEX IF EXISTS uq_pagos_venta_metodo_monto_fecha;

-- Create comprehensive uniqueness constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_deduplication 
    ON pagos(venta_id, metodo, monto, DATE(fecha), COALESCE(referencia, ''))
    WHERE venta_id IS NOT NULL;

-- ============================================================================
-- PART 5: CONCURRENT EDIT DETECTION
-- ============================================================================

-- Ensure version columns exist on all critical tables
DO $$
BEGIN
    -- Add version to tables that might not have it yet
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_reservations' AND column_name = 'version'
    ) THEN
        ALTER TABLE stock_reservations ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- PART 6: AUDIT ENHANCEMENTS FOR CONCURRENCY
-- ============================================================================

-- Add concurrency conflict tracking to audit
ALTER TABLE auditoria
    ADD COLUMN IF NOT EXISTS is_conflict BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS conflict_details JSONB;

-- Index for finding conflicts
CREATE INDEX IF NOT EXISTS idx_auditoria_conflicts 
    ON auditoria(is_conflict) 
    WHERE is_conflict = TRUE;

-- ============================================================================
-- PART 7: LOCKING HELPERS
-- ============================================================================

-- Function to safely lock a product for stock update (SELECT FOR UPDATE wrapper)
CREATE OR REPLACE FUNCTION lock_producto_for_stock_update(p_producto_id UUID)
RETURNS TABLE(
    id UUID,
    stock_actual DECIMAL(12,3),
    stock_minimo DECIMAL(12,3),
    permite_venta_sin_stock BOOLEAN,
    version INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.stock_actual,
        p.stock_minimo,
        p.permite_venta_sin_stock,
        p.version
    FROM productos p
    WHERE p.id = p_producto_id
    FOR UPDATE;
END;
$$ LANGUAGE plpgsql;

-- Function to safely lock a client for balance update
CREATE OR REPLACE FUNCTION lock_cliente_for_balance_update(p_cliente_id UUID)
RETURNS TABLE(
    id UUID,
    saldo DECIMAL(12,2),
    limite_credito DECIMAL(12,2),
    version INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.saldo,
        c.limite_credito,
        c.version
    FROM clientes c
    WHERE c.id = p_cliente_id
    FOR UPDATE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8: CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Ensure idempotency keys have minimum length
ALTER TABLE ventas
    DROP CONSTRAINT IF EXISTS chk_idempotency_key_length;

ALTER TABLE ventas
    ADD CONSTRAINT chk_idempotency_key_length
    CHECK (idempotency_key IS NULL OR LENGTH(idempotency_key) >= 10);

ALTER TABLE pagos
    DROP CONSTRAINT IF EXISTS chk_pago_idempotency_length;

ALTER TABLE pagos
    ADD CONSTRAINT chk_pago_idempotency_length
    CHECK (idempotency_key IS NULL OR LENGTH(idempotency_key) >= 10);

-- Ensure processing timestamps are logical
ALTER TABLE ventas
    DROP CONSTRAINT IF EXISTS chk_processing_timestamps;

ALTER TABLE ventas
    ADD CONSTRAINT chk_processing_timestamps
    CHECK (
        processing_completed_at IS NULL OR 
        processing_started_at IS NULL OR 
        processing_completed_at >= processing_started_at
    );

-- ============================================================================
-- PART 9: AUTOMATIC CLEANUP JOB SETUP
-- ============================================================================

-- Note: Actual cron job will be set up in application code
-- This is just the SQL function for cleanup

CREATE OR REPLACE FUNCTION cleanup_stale_data()
RETURNS TABLE(
    reservations_cleaned INTEGER,
    message TEXT
) AS $$
DECLARE
    v_reservations INTEGER;
BEGIN
    -- Clean expired stock reservations
    v_reservations := limpiar_reservas_expiradas();
    
    RETURN QUERY SELECT 
        v_reservations,
        format('Cleaned %s expired reservations', v_reservations);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 10: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN ventas.idempotency_key IS 
    'Unique key to prevent duplicate sale submissions (min 10 chars, recommended UUID)';

COMMENT ON COLUMN pagos.idempotency_key IS 
    'Unique key to prevent duplicate payment submissions (min 10 chars, recommended UUID)';

COMMENT ON TABLE stock_reservations IS 
    'Temporary stock reservations for in-progress sales to prevent overselling under concurrent load';

COMMENT ON FUNCTION stock_disponible IS 
    'Returns available stock for a product after subtracting active reservations';

COMMENT ON FUNCTION lock_producto_for_stock_update IS 
    'Safely locks a product row for stock updates using SELECT FOR UPDATE';

COMMENT ON FUNCTION lock_cliente_for_balance_update IS 
    'Safely locks a client row for balance updates using SELECT FOR UPDATE';

-- Add migration tracking
INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Add idempotency keys and enhanced concurrency controls')
ON CONFLICT (version) DO NOTHING;
