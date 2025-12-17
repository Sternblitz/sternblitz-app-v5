-- RESTORE/FIX ALL PROFILES POLICIES

-- 1. Ensure the secure function is correct and available
CREATE OR REPLACE FUNCTION public.check_is_admin_or_manager()
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
    AND (role = 'ADMIN' OR role = 'MANAGER')
  );
END;
$$;

-- 2. Drop potentially conflicting policies to start clean
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles; -- potentially old bad policy
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;

-- 3. Re-create "Users can see own profile" (Essential for everyone)
CREATE POLICY "Users can see own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Re-create "Admins can view all profiles" (For Dashboard)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role' OR
    public.check_is_admin_or_manager()
  );

-- 5. Ensure Update/Insert permissions (Self-manage)
-- Dropping old ones just in case naming was different, to be safe?
-- Ideally we don't break existing UPDATE policies.
-- But if the user says "Database broken", maybe safer to re-assert "Self-manage"?
-- Let's assume standard "Users can update own profile"
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 6. Insert (usually handled by trigger on auth.users, but if manual insert allowed)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
