-- ROLLBACK ALL CHANGES related to Activity Tracking (Fixed Dependencies)

-- 1. Drop the new table
DROP TABLE IF EXISTS public.user_activities CASCADE;

-- 2. Drop the policies depending on the function FIRST
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 3. Drop the helper function (now safe, but CASCADE just in case)
DROP FUNCTION IF EXISTS public.check_is_admin_or_manager() CASCADE;

-- 4. Revert Profile Policies to standard state
-- Ensure standard "Users can see own profile" is active
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
CREATE POLICY "Users can see own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Ensure standard "Users can update own profile" is active
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Ensure standard "Users can insert own profile" is active
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
