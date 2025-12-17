-- Add columns to track daily click usage (Place Details)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS daily_click_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_click_date date DEFAULT CURRENT_DATE;
