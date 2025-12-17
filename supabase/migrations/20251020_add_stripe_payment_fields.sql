-- Stripe payment fields on orders
alter table public.orders
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_method_type text, -- 'card' | 'sepa_debit' | 'manual'
  add column if not exists payment_status text default 'pending_payment', -- 'pending_payment' | 'card_on_file' | 'processing' | 'paid' | 'failed' | 'manual_pending'
  add column if not exists payment_receipt_url text,
  add column if not exists payment_last_event text,
  add column if not exists payment_last_error text,
  add column if not exists charged_amount integer,
  add column if not exists charge_currency text default 'eur',
  add column if not exists charged_at timestamptz;

create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_stripe_customer_idx on public.orders(stripe_customer_id);
create index if not exists orders_stripe_payment_method_idx on public.orders(stripe_payment_method_id);
create index if not exists orders_stripe_setup_intent_idx on public.orders(stripe_setup_intent_id);
create index if not exists orders_stripe_payment_intent_idx on public.orders(stripe_payment_intent_id);

