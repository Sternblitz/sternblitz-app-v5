-- Ensure Admins can view all profiles (needed for the Dashboard User List)
-- Check if policy exists or just create a new one that doesn't conflict
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
      ON public.profiles
      FOR SELECT
      USING (
        (auth.jwt() ->> 'role') = 'service_role' OR
        EXISTS (
          SELECT 1 FROM public.profiles as p
          WHERE p.user_id = auth.uid()
          AND (p.role = 'ADMIN' OR p.role = 'MANAGER')
        )
      );
  END IF;
END $$;
