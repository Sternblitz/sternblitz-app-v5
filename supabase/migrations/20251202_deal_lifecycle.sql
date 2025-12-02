-- Add fields for 3-Stage Deal Lifecycle to orders table

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS invoice_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS commission_status text DEFAULT 'OPEN'; -- 'OPEN', 'PAID'

-- Update RLS if necessary (usually existing policies cover new columns if they are broadly defined)
-- But let's ensure Admins can update these specific columns if we had column-level security (we don't seem to, but good to keep in mind)
