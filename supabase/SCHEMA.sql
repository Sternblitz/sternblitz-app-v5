-- Supabase schema snapshot (reference only – apply changes via supabase/migrations)

-- ENUMS --------------------------------------------------------------------
create type public.user_role as enum ('ADMIN', 'TEAM_LEADER', 'SALES');

-- TABLE: organizations ------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- TABLE: teams --------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  leader_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_org_id_idx on public.teams(org_id);
create index teams_leader_id_idx on public.teams(leader_id);

-- TABLE: profiles -----------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  role public.user_role not null,
  full_name text,
  created_at timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles(org_id);
create index profiles_team_id_idx on public.profiles(team_id);
create index profiles_role_idx on public.profiles(role);

-- TABLE: orders -------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'NEW',
  google_profile text not null,
  google_url text,
  selected_option text,
  counts jsonb,
  option_chosen_count integer,
  company text,
  first_name text,
  last_name text,
  email text,
  phone text,
  custom_notes text,
  rep_code text,
  source_account_id uuid,
  signature_png_path text,
  pdf_path text,
  pdf_signed_url text
  ,
  start_total_reviews integer,
  start_average_rating numeric,
  start_bad_1 integer,
  start_bad_2 integer,
  start_bad_3 integer,
  live_total_reviews integer,
  live_average_rating numeric,
  live_bad_1 integer,
  live_bad_2 integer,
  live_bad_3 integer,
  last_refreshed_at timestamptz,
  review_name text,
  review_address text
);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_org_id_idx on public.orders(org_id);
create index orders_team_id_idx on public.orders(team_id);
create index orders_created_by_idx on public.orders(created_by);

-- TRIGGERS/FUNCTIONS --------------------------------------------------------
-- touch_updated_at(): keeps updated_at fresh on updates
-- orders_set_defaults(): copies org/team/created_by from the acting profile
-- Both are defined in supabase/migrations/20251019160509_orders_rbac.sql

-- RLS POLICIES --------------------------------------------------------------
-- profiles: self-manage (select/update/insert own row)
-- orders: uses public.can_access_order(org_id, team_id, created_by) for select/insert/update
