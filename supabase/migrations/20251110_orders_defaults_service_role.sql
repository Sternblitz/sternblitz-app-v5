-- Allow service_role (admin) inserts for remote-sign without auth.uid()
create or replace function public.orders_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.profiles%rowtype;
  creator public.profiles%rowtype;
  jwt_role text := coalesce((auth.jwt() ->> 'role'), '');
begin
  -- If no authenticated user: allow service_role to insert as-is (for remote links)
  if auth.uid() is null then
    if jwt_role = 'service_role' then
      return new; -- allow pre-filled fields for service inserts
    end if;
    raise exception 'Authenticated user required to create orders.';
  end if;

  -- From here: regular authenticated behavior
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
