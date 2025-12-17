-- Enable full access for Admins on orders table
-- This policy allows Admins to SELECT, INSERT, UPDATE, DELETE all rows

CREATE POLICY "Admins can do everything on orders"
ON public.orders
FOR ALL
TO authenticated
USING (
  exists (
    select 1 from public.profiles
    where profiles.user_id = auth.uid()
    and profiles.role = 'ADMIN'
  )
);

-- Ensure RLS is enabled (it should be, but just in case)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
