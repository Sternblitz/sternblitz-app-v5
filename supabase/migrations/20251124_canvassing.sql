-- Canvassing / Door-Knocking Map
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canvassing_status') THEN
        create type public.canvassing_status as enum ('todo', 'interested', 'not_interested', 'later', 'customer');
    END IF;
END
$$;

create table if not exists public.canvassing_visits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  google_place_id text not null,
  status public.canvassing_status default 'todo',
  name text,
  address text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, google_place_id)
);

-- RLS
alter table public.canvassing_visits enable row level security;

create policy "Users can view their own visits"
  on public.canvassing_visits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own visits"
  on public.canvassing_visits for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own visits"
  on public.canvassing_visits for update
  using (auth.uid() = user_id);

create policy "Users can delete their own visits"
  on public.canvassing_visits for delete
  using (auth.uid() = user_id);

-- Indexes
create index canvassing_visits_user_id_idx on public.canvassing_visits(user_id);
create index canvassing_visits_place_id_idx on public.canvassing_visits(google_place_id);
