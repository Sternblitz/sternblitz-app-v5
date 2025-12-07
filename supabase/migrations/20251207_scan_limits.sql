-- Add columns to track daily scan usage
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS daily_scan_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scan_date date DEFAULT CURRENT_DATE;

-- Index for performance (optional but good)
CREATE INDEX IF NOT EXISTS idx_profiles_scan_usage ON public.profiles (user_id);
