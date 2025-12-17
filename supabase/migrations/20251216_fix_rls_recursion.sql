-- Fix Infinite Recursion in RLS by using a SECURITY DEFINER function

-- 1. Create a secure function to check user role
CREATE OR REPLACE FUNCTION public.check_is_admin_or_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Bypass RLS
SET search_path = public -- Secure search path
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

-- 2. Update the policy to use the function
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role' OR
    public.check_is_admin_or_manager()
  );
