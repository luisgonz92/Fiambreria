-- ============================================================
-- MIGRACIÓN v3 — Fiambrería App
-- Ejecutar en Supabase SQL Editor en dos pasos
-- ============================================================


-- ============================================================
-- PASO 1 — DIAGNÓSTICO
-- Ejecutá este SELECT primero para ver qué triggers existen.
-- ============================================================

SELECT
  t.tgname                        AS trigger_name,
  tgrelid::regclass               AS table_name,
  p.proname                       AS function_name,
  pg_get_functiondef(p.oid)       AS function_body
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid::regclass::text IN ('purchase_invoice_items', 'purchase_invoices')
  AND NOT t.tgisinternal
ORDER BY t.tgname;


-- ============================================================
-- PASO 2 — FIX
-- Reemplaza on_purchase_item_insert sin el sale_price.
-- Ejecutá este bloque completo en el SQL Editor de Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_purchase_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE articles
  SET
    stock = stock + NEW.quantity,
    purchase_price = NEW.unit_cost,
    updated_at = now()
  WHERE id = NEW.article_id;
  RETURN NEW;
END;
$function$;


-- ============================================================
-- VERIFICACIÓN FINAL
-- Ejecutá esto después. Si no devuelve filas, el fix está ok.
-- ============================================================

SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE pg_get_functiondef(p.oid) ILIKE '%sale_price%'
  AND p.proname ILIKE '%purchase%';
-- Resultado esperado: 0 filas.
