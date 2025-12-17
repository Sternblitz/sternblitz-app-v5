
-- Kanban Columns (Customizable)
CREATE TABLE IF NOT EXISTS public.crm_kanban_columns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    color text DEFAULT 'bg-slate-100 text-slate-800',
    order_index integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- Kanban Cards (Manual Customers)
CREATE TABLE IF NOT EXISTS public.crm_kanban_cards (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    column_id uuid REFERENCES public.crm_kanban_columns(id) ON DELETE CASCADE,
    title text NOT NULL, -- Customer Name
    description text, -- Notes
    
    -- Invoice Features
    invoice_due_date timestamptz, -- Next invoice date
    invoice_status text DEFAULT 'PENDING', -- PENDING, SENT, PAID, OVERDUE
    invoice_amount numeric DEFAULT 0,
    
    priority text DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS Policies (Open for Admin/Manager)
ALTER TABLE public.crm_kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_kanban_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for authenticated users" ON public.crm_kanban_columns
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all access for authenticated users" ON public.crm_kanban_cards
    FOR ALL USING (auth.role() = 'authenticated');

-- Initial Columns
INSERT INTO public.crm_kanban_columns (title, color, order_index) VALUES
('Erstgespräch', 'bg-slate-100 text-slate-800', 0),
('Angebot', 'bg-blue-100 text-blue-800', 1),
('Verhandlung', 'bg-yellow-100 text-yellow-800', 2),
('Abgeschlossen', 'bg-green-100 text-green-800', 3);
