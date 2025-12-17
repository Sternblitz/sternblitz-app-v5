-- Relax orders_set_defaults() for service_role inserts and copy org/team from provided context
DO $$
BEGIN
  -- safeguard: ensure function body exists before replace
  PERFORM 1;
END$$;

CREATE OR REPLACE FUNCTION public.orders_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer public.profiles%rowtype;
  creator public.profiles%rowtype;
  jwt jsonb;
  role text;
  is_service boolean;
BEGIN
  -- detect role from JWT claims; service_role bypasses auth.uid() requirement
  BEGIN
    jwt := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    role := COALESCE(jwt->>'role', '');
  EXCEPTION WHEN OTHERS THEN
    role := '';
  END;
  is_service := role = 'service_role';

  IF auth.uid() IS NULL AND NOT is_service THEN
    RAISE EXCEPTION 'Authenticated user required to create orders.';
  END IF;

  IF NOT is_service THEN
    -- original behavior (RLS client insert)
    SELECT * INTO viewer FROM public.profiles WHERE user_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profil für Benutzer % fehlt. Bitte Profil anlegen.', auth.uid();
    END IF;

    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;

    IF NEW.created_by <> auth.uid() THEN
      IF viewer.role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Nur Admins können Aufträge für andere Nutzer anlegen.';
      END IF;
      SELECT * INTO creator FROM public.profiles WHERE user_id = NEW.created_by;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil für Zielbenutzer % fehlt.', NEW.created_by;
      END IF;
    ELSE
      creator := viewer;
    END IF;

    IF NEW.org_id IS NULL THEN
      NEW.org_id := creator.org_id;
    END IF;

    IF NEW.team_id IS NULL THEN
      NEW.team_id := creator.team_id;
    END IF;

    IF NEW.source_account_id IS NULL THEN
      NEW.source_account_id := NEW.created_by;
    END IF;
  ELSE
    -- service_role path (admin insert): allow missing auth.uid();
    -- try to infer org/team from provided created_by
    IF NEW.created_by IS NOT NULL THEN
      SELECT * INTO creator FROM public.profiles WHERE user_id = NEW.created_by;
      IF FOUND THEN
        IF NEW.org_id IS NULL THEN NEW.org_id := creator.org_id; END IF;
        IF NEW.team_id IS NULL THEN NEW.team_id := creator.team_id; END IF;
      END IF;
    END IF;
    -- otherwise, respect passed org_id/team_id as provided by application
  END IF;

  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  IF NEW.status IS NULL THEN
    NEW.status := 'NEW';
  END IF;

  RETURN NEW;
END;
$$;

