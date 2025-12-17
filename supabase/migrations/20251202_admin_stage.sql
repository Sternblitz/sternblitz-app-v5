-- Add admin_stage for separate Admin Kanban flow
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS admin_stage text DEFAULT 'INBOX';

-- Backfill existing orders (Fixed: Cast status to text to avoid enum errors)
UPDATE public.orders 
SET admin_stage = CASE 
    WHEN status::text = 'NEW' THEN 'INBOX'
    WHEN status::text = 'PROCESSING' OR status::text = 'WAITING_PAYMENT' THEN 'PROCESSING'
    WHEN status::text = 'SUCCESS' OR status::text = 'ERFOLGREICH GELÖSCHT' THEN 'SUCCESS_OPEN'
    WHEN status::text = 'CANCELLED' THEN 'INBOX'
    ELSE 'INBOX'
END
WHERE admin_stage IS NULL OR admin_stage = 'INBOX';
