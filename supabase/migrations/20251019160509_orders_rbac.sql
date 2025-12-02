-- RBAC-safe orders schema and policies
create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('ADMIN', 'TEAM_LEADER', 'SALES');
  end if;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  leader_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists teams_org_id_idx on public.teams(org_id);
create index if not exists teams_leader_id_idx on public.teams(leader_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  role public.user_role not null,
  full_name text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_org_id_idx on public.profiles(org_id);
create index if not exists profiles_team_id_idx on public.profiles(team_id);
create index if not exists profiles_role_idx on public.profiles(role);

do $$
begin
  if to_regclass('public.orders') is null and to_regclass('public.leads') is not null then
    alter table public.leads rename to orders;
  end if;
end;
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  google_profile text not null,
  google_url text,
  selected_option text,
  counts jsonb,
  company text,
  first_name text,
  last_name text,
  email text,
  phone text,
  custom_notes text,
  signature_png_path text,
  pdf_path text,
  pdf_signed_url text,
  rep_code text,
  source_account_id uuid,
  option_chosen_count integer,
  status text not null default 'NEW',
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists google_profile text,
  add column if not exists google_url text,
  add column if not exists selected_option text,
  add column if not exists counts jsonb,
  add column if not exists company text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists custom_notes text,
  add column if not exists signature_png_path text,
  add column if not exists pdf_path text,
  add column if not exists pdf_signed_url text,
  add column if not exists rep_code text,
  add column if not exists source_account_id uuid,
  add column if not exists option_chosen_count integer,
  add column if not exists status text,
  add column if not exists updated_at timestamptz;

alter table public.orders
  alter column created_at set default now(),
  alter column google_profile set not null,
  alter column status set default 'NEW',
  alter column updated_at set default now();

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_created_by_idx on public.orders(created_by);
create index if not exists orders_org_id_idx on public.orders(org_id);
create index if not exists orders_team_id_idx on public.orders(team_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row
execute function public.touch_updated_at();

create or replace function public.orders_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  creator public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to create orders.';
  end if;

  select * into viewer from public.profiles where user_id = auth.uid();
  if not found then
    raise exception 'Profil für Benutzer % fehlt. Bitte Profil anlegen.', auth.uid();
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  if new.created_by <> auth.uid() then
    if viewer.role <> 'ADMIN' then
      raise exception 'Nur Admins können Aufträge für andere Nutzer anlegen.';
    end if;
    select * into creator from public.profiles where user_id = new.created_by;
    if not found then
      raise exception 'Profil für Zielbenutzer % fehlt.', new.created_by;
    end if;
  else
    creator := viewer;
  end if;

  if new.org_id is null then
    new.org_id := creator.org_id;
  end if;

  if new.team_id is null then
    new.team_id := creator.team_id;
  end if;

  if new.source_account_id is null then
    new.source_account_id := new.created_by;
  end if;

  if new.created_at is null then
    new.created_at := now();
  end if;

  if new.status is null then
    new.status := 'NEW';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_set_defaults on public.orders;
create trigger orders_set_defaults
before insert on public.orders
for each row
execute function public.orders_set_defaults();

create or replace function public.can_access_order(order_org uuid, order_team uuid, order_creator uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  creator_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into viewer from public.profiles where user_id = auth.uid();
  if not found then
    return false;
  end if;

  if order_org is null or viewer.org_id is distinct from order_org then
    return false;
  end if;

  if viewer.role = 'ADMIN' then
    return true;
  elsif viewer.role = 'TEAM_LEADER' then
    if order_creator = viewer.user_id then
      return true;
    end if;
    if viewer.team_id is not null then
      if order_team is not null and order_team = viewer.team_id then
        return true;
      end if;
      if order_creator is not null then
        select * into creator_profile from public.profiles where user_id = order_creator;
        if found and creator_profile.team_id = viewer.team_id then
          return true;
        end if;
      end if;
    end if;
    return false;
  else
    return order_creator = viewer.user_id;
  end if;
end;
$$;

grant execute on function public.touch_updated_at() to authenticated;
grant execute on function public.orders_set_defaults() to authenticated;
grant execute on function public.can_access_order(uuid, uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
  on public.profiles
  for select
  using (user_id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
  on public.profiles
  for insert
  with check (user_id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
  on public.profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists orders_select_policy on public.orders;
create policy orders_select_policy
  on public.orders
  for select
  using (public.can_access_order(org_id, team_id, created_by));

drop policy if exists orders_insert_policy on public.orders;
create policy orders_insert_policy
  on public.orders
  for insert
  with check (public.can_access_order(org_id, team_id, created_by));
