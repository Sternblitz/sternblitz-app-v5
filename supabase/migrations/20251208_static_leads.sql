-- Table for imported static leads (from Excel)
CREATE TABLE IF NOT EXISTS public.static_leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    address text,
    city text,
    zip text,
    lat double precision,
    lng double precision,
    category text,
    phone text,
    email text,
    website text,
    
    -- Meta
    source_file text, -- e.g. "berlin_gastro_2025.xlsx"
    created_at timestamptz DEFAULT now(),
    
    -- Search vector for fast text search (optional)
    fts tsvector GENERATED ALWAYS AS (to_tsvector('german', name || ' ' || coalesce(address, '') || ' ' || coalesce(category, ''))) STORED
);

-- Index for geo-queries (if we want to find "leads near me" from this table)
CREATE INDEX IF NOT EXISTS idx_static_leads_geo ON public.static_leads (lat, lng);
CREATE INDEX IF NOT EXISTS idx_static_leads_city ON public.static_leads (city);
