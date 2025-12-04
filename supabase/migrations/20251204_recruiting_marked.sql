ALTER TABLE public.recruiting_candidates
ADD COLUMN IF NOT EXISTS is_marked boolean DEFAULT false;
