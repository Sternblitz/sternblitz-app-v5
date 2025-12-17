-- Fix Foreign Key to allow joining with profiles
DO $$ 
BEGIN
  -- Drop the old constraint if it exists (referencing auth.users)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_activities_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_activities DROP CONSTRAINT user_activities_user_id_fkey;
  END IF;
END $$;

-- Add new constraint referencing public.profiles
ALTER TABLE public.user_activities
ADD CONSTRAINT user_activities_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(user_id)
ON DELETE SET NULL;
