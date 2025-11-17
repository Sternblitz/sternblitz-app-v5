-- Add channel column to orders to segment flows (DIRECT/REFERRAL/SEO)
alter table public.orders
  add column if not exists channel text default 'DIRECT';

create index if not exists orders_channel_idx on public.orders(channel);

