-- Invites System
create table if not exists public.invites (
  id uuid default gen_random_uuid() primary key,
  token text not null unique,
  team_id uuid references public.teams(id) on delete cascade,
  role text not null default 'SALES',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  expires_at timestamptz,
  max_uses int, -- null = unlimited
  uses_count int default 0
);

-- RLS
alter table public.invites enable row level security;

-- Admins can view/create/delete invites
create policy "Admins can manage invites"
  on public.invites
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.role = 'ADMIN'
    )
  );

-- Public (anon) can view invites by token (for verification on /join page)
create policy "Public can verify invites"
  on public.invites for select
  using (true);
