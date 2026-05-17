-- ============================================================
-- MIGRACIÓN v2 — Fiambrería App
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. TABLA price_history
--    Guarda el historial de precios de compra por artículo.
--    Se registra automáticamente en cada nueva compra.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES public.articles(id),
  article_name text NOT NULL,
  date timestamp with time zone DEFAULT now(),
  price numeric NOT NULL DEFAULT 0,
  prev_price numeric DEFAULT 0,
  supplier text,
  unit text DEFAULT 'kg',
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT price_history_pkey PRIMARY KEY (id)
);

-- Índice para consultas rápidas por artículo
CREATE INDEX IF NOT EXISTS price_history_article_id_idx ON public.price_history(article_id);
CREATE INDEX IF NOT EXISTS price_history_date_idx ON public.price_history(date);

-- RLS: mismos permisos que el resto de tablas
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'price_history' AND policyname = 'Enable all for authenticated'
  ) THEN
    CREATE POLICY "Enable all for authenticated" ON public.price_history
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;


-- 2. COLUMNAS en sale_tickets
--    Descuentos y pagos mixtos
-- ------------------------------------------------------------
ALTER TABLE public.sale_tickets
  ADD COLUMN IF NOT EXISTS discount_mode text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_method2_name text,
  ADD COLUMN IF NOT EXISTS pm1_amount numeric,
  ADD COLUMN IF NOT EXISTS pm2_amount numeric,
  ADD COLUMN IF NOT EXISTS cash_received numeric;
