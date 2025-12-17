-- Migration: User Activity Tracking V2 (Safe Implementation)

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.user_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- Standard auth reference first
  org_id uuid REFERENCES public.organizations(id),
  action_type text NOT NULL,
  curr_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON public.user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_created_at ON public.user_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_action_type ON public.user_activities(action_type);

-- 2. Create Security Definer Function for robust permission checks
-- This bypasses RLS on profile table to safely check roles without recursion or locking out users
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

-- 3. Enable RLS
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- 4. Policies for user_activities
-- Users can insert their own activity
CREATE POLICY "Users can insert own activity"
  ON public.user_activities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own activity
CREATE POLICY "Users can view own activity"
  ON public.user_activities
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins/Managers can view ALL activity
CREATE POLICY "Admins can view all activities"
  ON public.user_activities
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role' OR
    public.check_is_admin_or_manager()
  );

-- 5. Safe Profile Access for Dashboard
-- We add a policy that allows Admins to view ALL profiles.
-- We check if it exists first to avoid errors, or drop/create.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role' OR
    public.check_is_admin_or_manager()
  );

-- Note: We DO NOT touch "Users can view own profile". Attempts to modify it previously caused issues.
-- We assume the existing codebase has a policy for users to view themselves.
