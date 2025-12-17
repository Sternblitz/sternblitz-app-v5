-- Create user_activities table for tracking sales rep actions
CREATE TABLE IF NOT EXISTS public.user_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  action_type text NOT NULL, -- e.g., 'SIMULATOR_OPEN', 'MAP_OPEN', 'SIMULATOR_CALC'
  metadata jsonb DEFAULT '{}'::jsonb, -- Store extra details like { company: '...' }
  curr_path text, -- The URL path where the event happened
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS user_activities_user_id_idx ON public.user_activities(user_id);
CREATE INDEX IF NOT EXISTS user_activities_org_id_idx ON public.user_activities(org_id);
CREATE INDEX IF NOT EXISTS user_activities_created_at_idx ON public.user_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS user_activities_action_type_idx ON public.user_activities(action_type);

-- RLS Policies
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own activities (or any authenticated user if we track broadly)
CREATE POLICY "Users can insert their own activities"
  ON public.user_activities
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow Admins and Team Leaders to view activities
-- Assuming we reuse the logic like `can_access_order` or similar, but simplified for now:
-- Admins can see everything. Team Leaders can see their team's activities (if we had team_id).
-- For now, let's allow ADMIN to view all, and maybe SALES to view their own?
-- Let's stick to consistent RBAC:
CREATE POLICY "Admins can view all activities"
  ON public.user_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

CREATE POLICY "Users can view their own activities"
  ON public.user_activities
  FOR SELECT
  USING (auth.uid() = user_id);
