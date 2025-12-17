-- Fix User Activities V2 Join
-- We need to reference public.profiles(user_id) to enable Supabase automatic joins in the API.

ALTER TABLE public.user_activities
DROP CONSTRAINT IF EXISTS user_activities_user_id_fkey;

ALTER TABLE public.user_activities
ADD CONSTRAINT user_activities_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(user_id)
ON DELETE CASCADE;
