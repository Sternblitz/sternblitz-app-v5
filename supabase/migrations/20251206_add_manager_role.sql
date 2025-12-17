-- Add MANAGER to user_role enum
alter type public.user_role add value if not exists 'MANAGER';

-- Update can_access_order to allow MANAGER to see all orders in their org
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

  if viewer.role = 'ADMIN' or viewer.role = 'MANAGER' then
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

-- Create is_manager function
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'MANAGER'
  );
END;
$$;

-- Update profiles RLS to allow Managers to view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and Managers can view all profiles" ON public.profiles;

CREATE POLICY "Admins and Managers can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR public.is_manager()
);

