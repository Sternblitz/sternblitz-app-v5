-- Optional billing address fields for orders
alter table public.orders
  add column if not exists billing_name text,
  add column if not exists billing_company text,
  add column if not exists billing_email text,
  add column if not exists billing_line1 text,
  add column if not exists billing_line2 text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text,
  add column if not exists billing_country text,
  add column if not exists billing_vat_id text;

