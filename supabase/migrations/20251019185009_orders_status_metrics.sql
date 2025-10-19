-- Add baseline/live metrics columns and update policies for orders status view

alter table public.orders
  add column if not exists start_total_reviews integer,
  add column if not exists start_average_rating numeric,
  add column if not exists start_bad_1 integer,
  add column if not exists start_bad_2 integer,
  add column if not exists start_bad_3 integer,
  add column if not exists live_total_reviews integer,
  add column if not exists live_average_rating numeric,
  add column if not exists live_bad_1 integer,
  add column if not exists live_bad_2 integer,
  add column if not exists live_bad_3 integer,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists review_name text,
  add column if not exists review_address text;

update public.orders
set last_refreshed_at = coalesce(last_refreshed_at, created_at)
where last_refreshed_at is null;

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

  if new.last_refreshed_at is null then
    new.last_refreshed_at := new.created_at;
  end if;

  return new;
end;
$$;

drop policy if exists orders_update_policy on public.orders;
create policy orders_update_policy
  on public.orders
  for update
  using (public.can_access_order(org_id, team_id, created_by))
  with check (public.can_access_order(org_id, team_id, created_by));
