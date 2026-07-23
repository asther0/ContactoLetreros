-- Stable local keys make retries safe: an IndexedDB record is upserted rather
-- than duplicated if a previous sync reached Supabase before the device lost
-- connectivity. The keys are scoped by user, never globally unique.

alter table public.searches
  add column if not exists local_source_id text;

alter table public.opportunities
  add column if not exists local_source_id text;

alter table public.opportunity_photos
  add column if not exists local_source_id text;

-- A regular UNIQUE constraint still allows repeated NULLs in PostgreSQL and,
-- unlike a partial index, can be named in Supabase upsert's onConflict clause.
do $$
begin
  alter table public.searches
    add constraint searches_user_local_source_id_key
    unique (user_id, local_source_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.opportunities
    add constraint opportunities_user_local_source_id_key
    unique (user_id, local_source_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.opportunity_photos
    add constraint opportunity_photos_user_local_source_id_key
    unique (user_id, local_source_id);
exception
  when duplicate_object then null;
end $$;
