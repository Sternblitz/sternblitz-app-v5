-- Migration: orders notes + normalized status
-- Date: 2025-10-19

-- 1) Create enum for order status (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'order_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.order_status AS ENUM ('NEW','PROCESSING','SUCCESS','WAITING_PAYMENT');
  END IF;
END$$;

-- 2) Normalize existing text status values to the enum
-- Drop existing default first to avoid cast errors
ALTER TABLE public.orders ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.orders
  ALTER COLUMN status TYPE public.order_status
  USING (
    CASE
      WHEN lower(status) IN ('new','neu') THEN 'NEW'::public.order_status
      WHEN lower(status) LIKE '%bearbeit%' THEN 'PROCESSING'::public.order_status
      WHEN lower(status) LIKE '%success%' OR lower(status) LIKE '%erfolg%' THEN 'SUCCESS'::public.order_status
      WHEN lower(status) LIKE '%zahl%' OR lower(status) LIKE '%wait%' THEN 'WAITING_PAYMENT'::public.order_status
      ELSE 'NEW'::public.order_status
    END
  );

ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'NEW'::public.order_status;

-- Helpful index for filtering by status
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);

-- 3) Add dedicated note columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sales_notes text,
  ADD COLUMN IF NOT EXISTS backoffice_notes text;

-- 4) Backfill from legacy columns/JSON
UPDATE public.orders
SET sales_notes = COALESCE(sales_notes, custom_notes)
WHERE custom_notes IS NOT NULL AND (sales_notes IS NULL OR sales_notes = '');

UPDATE public.orders
SET backoffice_notes = COALESCE(backoffice_notes, counts ->> '_admin_notes')
WHERE (counts ? '_admin_notes') AND (backoffice_notes IS NULL OR backoffice_notes = '');

-- Optional: clean up legacy JSON key
UPDATE public.orders
SET counts = counts - '_admin_notes'
WHERE counts ? '_admin_notes';

-- 5) (Optional) Convenience view for admins
CREATE OR REPLACE VIEW public.orders_admin_overview AS
SELECT o.*,
       p.full_name AS created_by_name,
       t.name      AS team_name
FROM public.orders o
LEFT JOIN public.profiles p ON p.user_id = o.created_by
LEFT JOIN public.teams    t ON t.id = o.team_id;

COMMENT ON VIEW public.orders_admin_overview IS 'Convenience overview with creator name and team. Subject to underlying RLS.';
