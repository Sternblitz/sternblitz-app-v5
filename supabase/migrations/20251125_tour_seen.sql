-- Add tour_seen to profiles
alter table public.profiles 
add column if not exists tour_seen boolean default false;
st