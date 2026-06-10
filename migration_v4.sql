-- ============================================================
-- MIGRACIÓN v4 — Fiambrería App
-- Ejecutar en Supabase SQL Editor
-- ============================================================
-- Agrega la columna is_combo_header a sale_ticket_items.
-- Esto permite identificar la fila padre de un combo (que
-- guarda el precio del combo) separada de las filas hijas
-- (que descontarán stock pero tienen precio $0).
-- ============================================================

ALTER TABLE public.sale_ticket_items
  ADD COLUMN IF NOT EXISTS is_combo_header boolean DEFAULT false;

-- Verificación: debería devolver 0 filas si la columna NO existía antes.
-- Si la columna ya existía en alguna forma, también estará ok.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sale_ticket_items'
  AND column_name = 'is_combo_header';
-- Resultado esperado: 1 fila con is_combo_header / boolean / false
