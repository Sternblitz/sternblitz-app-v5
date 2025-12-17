-- Remote-Sign links for prefilled signing
create table if not exists public.sign_links (
  token text primary key,
  payload jsonb not null,
  rep_code text,
  source_account_id uuid,
  -- store org/team ids even if referenced tables are not present yet
  org_id uuid,
  team_id uuid,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null
);

create index if not exists sign_links_expires_at_idx on public.sign_links(expires_at);
create index if not exists sign_links_created_by_idx on public.sign_links(created_by);

-- Conditionally add foreign keys if referenced tables exist
do $$
begin
  if to_regclass('public.organizations') is not null then
    begin
      alter table public.sign_links
        add constraint sign_links_org_fk foreign key (org_id)
        references public.organizations(id) on delete set null;
    exception when duplicate_object then null; end;
  end if;
  if to_regclass('public.teams') is not null then
    begin
      alter table public.sign_links
        add constraint sign_links_team_fk foreign key (team_id)
        references public.teams(id) on delete set null;
    exception when duplicate_object then null; end;
  end if;
end $$;
