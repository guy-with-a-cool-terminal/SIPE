-- Stub of the Supabase pieces the migrations rely on (auth.users, auth.uid(),
-- roles, extensions and storage schemas). For local tests only.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions; create extension pgcrypto schema extensions;
create schema auth;
create table auth.users (id uuid primary key default extensions.gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default extensions.gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;
grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
grant select on auth.users to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
