-- ContactoLetreros remote persistence.
--
-- Photo objects belong in the private `opportunity-photos` bucket using this
-- path convention: <auth.uid()>/<opportunity-id>/<filename>. RLS below keeps
-- each authenticated user inside their own first-level folder.

do $$
begin
  create type public.opportunity_origin as enum (
    'street',
    'airbnb',
    'facebook',
    'adondevivir',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.opportunity_status as enum (
    'new',
    'contacted',
    'visited',
    'discarded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.location_precision as enum ('exact', 'approximate');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid not null references public.searches(id) on delete cascade,
  origin public.opportunity_origin not null,
  status public.opportunity_status not null default 'new',
  title text,
  property_type text,
  operation text check (operation in ('rent', 'sale') or operation is null),
  phone_numbers text[] not null default '{}',
  source_url text,
  note text,
  is_favorite boolean not null default false,
  location_precision public.location_precision,
  location_label text,
  district text,
  address text,
  latitude double precision,
  longitude double precision,
  contacted_at timestamptz,
  visited_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_source_url_for_web_origins check (
    origin not in ('airbnb', 'facebook', 'adondevivir') or source_url is not null
  ),
  constraint opportunities_source_url_format check (
    source_url is null or source_url ~* '^https?://'
  ),
  constraint opportunities_coordinates_pair check (
    (latitude is null and longitude is null)
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  constraint opportunities_location_details check (
    location_precision is null
    or location_label is not null
    or district is not null
    or address is not null
    or latitude is not null
  )
);

create index if not exists searches_user_updated_at_idx
  on public.searches (user_id, updated_at desc);

create index if not exists opportunities_search_updated_at_idx
  on public.opportunities (search_id, updated_at desc);

create index if not exists opportunities_user_status_idx
  on public.opportunities (user_id, status);

create table if not exists public.opportunity_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  storage_path text not null unique check (char_length(trim(storage_path)) > 0),
  mime_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  extracted_text text,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_photos_opportunity_created_at_idx
  on public.opportunity_photos (opportunity_id, created_at);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('search_pass', 'ai_credits')),
  provider text check (provider in ('polar', 'manual') or provider is null),
  provider_reference text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  ai_credits integer check (ai_credits is null or ai_credits >= 0),
  created_at timestamptz not null default now(),
  constraint entitlements_window check (ends_at is null or ends_at > starts_at),
  constraint entitlements_provider_reference_unique unique (provider, provider_reference)
);

create index if not exists entitlements_user_active_idx
  on public.entitlements (user_id, ends_at);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  usage_month date not null default date_trunc('month', now())::date,
  units integer not null default 1 check (units > 0),
  provider_request_id text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_month_idx
  on public.ai_usage (user_id, usage_month);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists searches_set_updated_at on public.searches;
create trigger searches_set_updated_at
before update on public.searches
for each row execute function public.set_updated_at();

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.searches enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_photos enable row level security;
alter table public.entitlements enable row level security;
alter table public.ai_usage enable row level security;

-- Data records are always owned by the current authenticated user.
drop policy if exists "users manage own searches" on public.searches;
create policy "users manage own searches" on public.searches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users manage own opportunities" on public.opportunities;
create policy "users manage own opportunities" on public.opportunities
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.searches
      where searches.id = opportunities.search_id
        and searches.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.searches
      where searches.id = opportunities.search_id
        and searches.user_id = auth.uid()
    )
  );

drop policy if exists "users manage own opportunity photos" on public.opportunity_photos;
create policy "users manage own opportunity photos" on public.opportunity_photos
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.opportunities
      where opportunities.id = opportunity_photos.opportunity_id
        and opportunities.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.opportunities
      where opportunities.id = opportunity_photos.opportunity_id
        and opportunities.user_id = auth.uid()
    )
  );

-- Entitlements and AI usage are read-only to users. A future server-side
-- webhook or metered extraction route writes them using the service-role key.
drop policy if exists "users read own entitlements" on public.entitlements;
create policy "users read own entitlements" on public.entitlements
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users read own ai usage" on public.ai_usage;
create policy "users read own ai usage" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

-- The bucket is private by default. The insert is safe if it already exists.
insert into storage.buckets (id, name, public)
values ('opportunity-photos', 'opportunity-photos', false)
on conflict (id) do update set public = false;

-- Objects must use <user-id>/<opportunity-id>/<filename>. These policies are
-- intentionally scoped to the first path segment so signed-in users cannot
-- browse, upload, update, or delete another user's original photos.
drop policy if exists "users manage own opportunity photo objects" on storage.objects;
create policy "users manage own opportunity photo objects" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'opportunity-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'opportunity-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
