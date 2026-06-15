-- ============================================================
-- MIGRACIÓN v5 — Fiambrería App
-- Ejecutar en Supabase SQL Editor
-- ============================================================
-- Agrega estado de pago a purchase_invoices:
--   status  → 'pendiente' (default) o 'pagada'
--   paid_at → timestamp de cuándo se marcó como pagada
-- ============================================================

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- Verificación: deben aparecer ambas columnas
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'purchase_invoices'
  AND column_name IN ('status', 'paid_at')
ORDER BY column_name;
-- Resultado esperado: 2 filas (paid_at nullable, status NOT NULL default 'pendiente')
