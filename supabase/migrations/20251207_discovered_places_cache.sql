-- Enable PostGIS if available (optional, we can use simple lat/lng for now to be safe)
-- CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.discovered_places (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    google_place_id text NOT NULL UNIQUE,
    name text,
    lat double precision,
    lng double precision,
    address text,
    types text[], -- Array of types
    rating double precision,
    user_ratings_total integer,
    data jsonb, -- Full raw data from Google
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for faster location search
CREATE INDEX IF NOT EXISTS idx_discovered_places_lat_lng ON public.discovered_places (lat, lng);
CREATE INDEX IF NOT EXISTS idx_discovered_places_google_id ON public.discovered_places (google_place_id);

-- RLS
ALTER TABLE public.discovered_places ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" ON public.discovered_places
    FOR SELECT TO authenticated USING (true);

-- Allow insert access to authenticated users (or service role)
CREATE POLICY "Allow insert access to authenticated users" ON public.discovered_places
    FOR INSERT TO authenticated WITH CHECK (true);
