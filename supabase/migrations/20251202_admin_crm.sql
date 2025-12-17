-- Create recruiting_candidates table
CREATE TABLE public.recruiting_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  city text,
  status text NOT NULL DEFAULT 'NEW', -- 'NEW', 'AUDIO_OK', 'ZOOM_INVITED', 'CONTRACT_SENT', 'ACCEPTED', 'REJECTED'
  phone text,
  audio_url text,
  notes text
);

-- Create hr_partner_details table
CREATE TABLE public.hr_partner_details (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  iban text,
  paypal text,
  documents jsonb DEFAULT '[]'::jsonb, -- Array of { name, url }
  commission_reports jsonb DEFAULT '[]'::jsonb, -- Array of { name, url, date }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recruiting_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_partner_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies (ADMIN only)

-- recruiting_candidates
CREATE POLICY "Admins can do everything on recruiting_candidates"
  ON public.recruiting_candidates
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.profiles WHERE role = 'ADMIN'
    )
  );

-- hr_partner_details
CREATE POLICY "Admins can do everything on hr_partner_details"
  ON public.hr_partner_details
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.profiles WHERE role = 'ADMIN'
    )
  );

-- Allow users to read their own HR details (optional, but good for future)
CREATE POLICY "Users can view own hr_partner_details"
  ON public.hr_partner_details
  FOR SELECT
  USING (auth.uid() = user_id);
