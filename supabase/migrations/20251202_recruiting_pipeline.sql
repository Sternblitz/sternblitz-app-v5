-- 1. Create recruiting_columns table
CREATE TABLE public.recruiting_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  color text DEFAULT 'bg-slate-100 text-slate-800',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS on columns
ALTER TABLE public.recruiting_columns ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy for columns (Admins only)
CREATE POLICY "Admins can manage recruiting_columns"
  ON public.recruiting_columns
  FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE role = 'ADMIN')
  );

-- 4. Update recruiting_candidates table
ALTER TABLE public.recruiting_candidates 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES public.recruiting_columns(id) ON DELETE SET NULL;

-- 5. Insert Default Columns
INSERT INTO public.recruiting_columns (title, order_index, color) VALUES
('Neu', 0, 'bg-blue-100 text-blue-800'),
('Nicht erreicht', 1, 'bg-red-100 text-red-800'),
('Interesse', 2, 'bg-yellow-100 text-yellow-800'),
('Zoom Meeting', 3, 'bg-purple-100 text-purple-800'),
('Vertrag gesendet', 4, 'bg-orange-100 text-orange-800'),
('Teammitglied', 5, 'bg-green-100 text-green-800');

-- 6. Migrate existing candidates (Map old status to new columns)
-- This is a best-effort mapping.
DO $$
DECLARE
  col_new uuid;
  col_zoom uuid;
  col_contract uuid;
  col_team uuid;
  col_rejected uuid;
BEGIN
  SELECT id INTO col_new FROM public.recruiting_columns WHERE title = 'Neu' LIMIT 1;
  SELECT id INTO col_zoom FROM public.recruiting_columns WHERE title = 'Zoom Meeting' LIMIT 1;
  SELECT id INTO col_contract FROM public.recruiting_columns WHERE title = 'Vertrag gesendet' LIMIT 1;
  SELECT id INTO col_team FROM public.recruiting_columns WHERE title = 'Teammitglied' LIMIT 1;
  SELECT id INTO col_rejected FROM public.recruiting_columns WHERE title = 'Nicht erreicht' LIMIT 1; -- Mapping Rejected to 'Nicht erreicht' or similar

  -- Update based on old status text
  UPDATE public.recruiting_candidates SET column_id = col_new WHERE status = 'NEW' AND column_id IS NULL;
  UPDATE public.recruiting_candidates SET column_id = col_zoom WHERE status = 'ZOOM_INVITED' AND column_id IS NULL;
  UPDATE public.recruiting_candidates SET column_id = col_contract WHERE status = 'CONTRACT_SENT' AND column_id IS NULL;
  UPDATE public.recruiting_candidates SET column_id = col_team WHERE status = 'ACCEPTED' AND column_id IS NULL;
  UPDATE public.recruiting_candidates SET column_id = col_rejected WHERE status = 'REJECTED' AND column_id IS NULL;
  
  -- Fallback for others
  UPDATE public.recruiting_candidates SET column_id = col_new WHERE column_id IS NULL;
END $$;
