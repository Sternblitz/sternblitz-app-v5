-- Allow Admins to view all profiles
create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.user_id = auth.uid()
    and profiles.role = 'ADMIN'
  )
);
