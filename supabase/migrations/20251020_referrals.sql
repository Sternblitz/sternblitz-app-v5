-- Referral core tables and fields
create table if not exists public.referral_codes (
  code text primary key,
  referrer_order_id uuid references public.orders(id) on delete set null,
  discount_cents integer not null default 2500,
  max_uses integer not null default 5,
  uses_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_active_idx on public.referral_codes(active);
create index if not exists referral_codes_referrer_order_idx on public.referral_codes(referrer_order_id);

alter table public.orders
  add column if not exists referral_code text,
  add column if not exists referral_channel text default 'direct', -- 'direct' | 'referral'
  add column if not exists referral_referrer_order_id uuid references public.orders(id) on delete set null,
  add column if not exists discount_cents integer default 0,
  add column if not exists total_cents integer default 29900,
  add column if not exists referral_award_status text null, -- 'pending' | 'awarded' | 'rejected'
  add column if not exists referral_award_value_cents integer default 2500,
  add column if not exists referral_awarded_at timestamptz null;

create index if not exists orders_referral_channel_idx on public.orders(referral_channel);
create index if not exists orders_referral_code_idx on public.orders(referral_code);
create index if not exists orders_referral_award_status_idx on public.orders(referral_award_status);

