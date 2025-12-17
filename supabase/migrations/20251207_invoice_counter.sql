-- Create a sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;

-- Create a table to track the current invoice year and sequence (optional, but good for resetting yearly)
CREATE TABLE IF NOT EXISTS public.invoice_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    year integer NOT NULL UNIQUE,
    current_seq integer DEFAULT 1000,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Function to get next invoice number: "YYYY-XXXX"
CREATE OR REPLACE FUNCTION public.get_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    current_year int;
    next_seq int;
    invoice_num text;
BEGIN
    current_year := date_part('year', now());
    
    -- Get next value from sequence
    next_seq := nextval('public.invoice_number_seq');
    
    -- Format: YYYY-SEQ (e.g. 2025-1001)
    invoice_num := current_year || '-' || next_seq;
    
    RETURN invoice_num;
END;
$$;
