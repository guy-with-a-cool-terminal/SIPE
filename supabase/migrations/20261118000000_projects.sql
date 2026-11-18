-- ============================================================================
--  SIPE: Projects (Phase 1). Idempotent.
--
--  projects                one row per project (venture or client project)
--  project_members         the team: owner, cofounder, contributor, viewer
--                          (client reserved for Phase 2). `mode` is PERSONAL:
--                          the same project can be in my Focus and in my
--                          cofounder's Background. Focus cap per user.
--  project_cycles          90-day goals with a plan and a stop rule
--  project_checkins        weekly check-ins, one per person per week
--  project_baseline_items  checklist state (auto items written by the
--                          project-health function, self items by the team)
--  project_metrics         one number per project, metric and day
--  project_keys            push-link keys, stored as sha256 hashes only
--
--  Money: transactions / documents / payment_links / expense_templates get a
--  nullable project_id. Only the PARENT transaction row is tagged, so the
--  four-bucket split is untouched. Team members never read other people's
--  transactions: project totals come from project_money(), which returns
--  totals only, and only when the owner has switched money sharing on.
--
--  Focused view: profiles.enabled_modules (null = everything on). People who
--  join through an invite start with '{projects}' and turn on the rest
--  themselves in Settings › Features.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: focus cap, enabled modules, how they arrived
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists focus_cap integer not null default 2,
  add column if not exists enabled_modules text[],
  add column if not exists signup_source text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_focus_cap_range') then
    alter table public.profiles add constraint profiles_focus_cap_range check (focus_cap between 1 and 3);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  kind        text not null default 'venture' check (kind in ('venture','client')),
  type        text not null default 'webapp' check (type in ('webapp','content','shop','mobile','local','client')),
  stage       text not null default 'idea' check (stage in ('idea','building','launched','growing','sustaining')),
  url         text,
  one_liner   text,
  client_id   uuid references public.clients(id) on delete set null,
  north_star        text,
  north_star_metric text,
  north_star_target numeric,
  launch_date       date,
  money_shared  boolean not null default false,
  killed_at     timestamptz,
  killed_reason text,
  stage_changed_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists projects_owner_idx on public.projects(owner_id);

-- ---------------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('owner','cofounder','contributor','viewer','client')),
  status      text not null default 'invited' check (status in ('invited','active')),
  mode        text not null default 'parked' check (mode in ('focus','background','parked')),
  share_pct   numeric(5,2) check (share_pct between 0 and 100),
  invite_token uuid not null default gen_random_uuid(),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  joined_at   timestamptz,
  unique (project_id, email)
);
create unique index if not exists project_members_user_uidx on public.project_members(project_id, user_id) where user_id is not null;
create unique index if not exists project_members_token_uidx on public.project_members(invite_token);
create index if not exists project_members_user_idx on public.project_members(user_id) where status = 'active';

-- membership helpers (SECURITY DEFINER so policies on project_members don't recurse)
create or replace function public.project_role(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.project_members
  where project_id = p_project and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_project_member(p_project uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project and user_id = auth.uid() and status = 'active'
      and (p_roles is null or role = any(p_roles))
  );
$$;

-- the owner is always a member
create or replace function public.projects_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, email, role, status, mode, share_pct, joined_at)
  values (
    new.id, new.owner_id,
    lower(coalesce((select email from auth.users where id = new.owner_id), new.owner_id::text)),
    'owner', 'active', 'parked',
    case when new.kind = 'venture' then 100 else null end,
    now()
  )
  on conflict (project_id, email) do nothing;
  return new;
end $$;
drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.projects_add_owner();

create or replace function public.projects_touch_stage()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'The owner of a project can''t be changed here';
  end if;
  if auth.uid() is not null and auth.uid() <> old.owner_id and (
       new.money_shared is distinct from old.money_shared
    or new.killed_at is distinct from old.killed_at) then
    raise exception 'Only the owner can share money or stop a project';
  end if;
  return new;
end $$;
drop trigger if exists projects_touch_stage on public.projects;
create trigger projects_touch_stage before update on public.projects
  for each row execute function public.projects_touch_stage();

-- Guard member rows: only the owner changes roles, shares and status; anyone
-- can change their own mode; Focus is capped per person; Ideas and projects in
-- Building have nothing to run, so they can't be in Background.
create or replace function public.project_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_count int;
  v_stage text;
  v_killed timestamptz;
  v_is_owner boolean;
begin
  if tg_op = 'UPDATE' then
    v_is_owner := exists (
      select 1 from public.project_members
      where project_id = old.project_id and user_id = auth.uid() and role = 'owner' and status = 'active'
    );
    -- service role (auth.uid() is null) and accept_project_invite may do anything
    if auth.uid() is not null and coalesce(current_setting('sipe.accepting_invite', true), '') <> 'on' then
      if new.project_id <> old.project_id or new.email <> old.email
         or new.invite_token <> old.invite_token then
        raise exception 'Not allowed';
      end if;
      if not v_is_owner and (
           new.role is distinct from old.role or new.share_pct is distinct from old.share_pct
        or new.status is distinct from old.status or new.user_id is distinct from old.user_id) then
        raise exception 'Only the owner can change roles and shares';
      end if;
      if old.role = 'owner' and new.role <> 'owner' then
        raise exception 'The owner role can''t be removed';
      end if;
      if new.role = 'owner' and old.role <> 'owner' then
        raise exception 'A project has one owner';
      end if;
      if new.mode is distinct from old.mode and old.user_id is distinct from auth.uid() then
        raise exception 'You can only change your own mode';
      end if;
    end if;
  end if;

  if new.user_id is not null and new.status = 'active' then
    select stage, killed_at into v_stage, v_killed from public.projects where id = new.project_id;
    if new.mode = 'background' and v_stage in ('idea','building') then
      raise exception 'An idea or a project still being built has nothing to run in Background yet. Park it, or put it in Focus.';
    end if;
    if new.mode = 'focus' and (tg_op = 'INSERT' or old.mode is distinct from 'focus') then
      select coalesce(focus_cap, 2) into v_cap from public.profiles where id = new.user_id;
      select count(*) into v_count
      from public.project_members m join public.projects p on p.id = m.project_id
      where m.user_id = new.user_id and m.status = 'active' and m.mode = 'focus'
        and p.killed_at is null and m.id <> new.id;
      if v_count >= coalesce(v_cap, 2) then
        raise exception 'focus_cap: You already have % projects in Focus. Move one out first.', v_count;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists project_members_guard on public.project_members;
create trigger project_members_guard before insert or update on public.project_members
  for each row execute function public.project_members_guard();

-- ---------------------------------------------------------------------------
-- project_cycles
-- ---------------------------------------------------------------------------
create table if not exists public.project_cycles (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  n           integer not null default 1,
  metric      text not null,
  target      numeric not null,
  start_value numeric not null default 0,
  starts_on   date not null default current_date,
  ends_on     date not null,
  plan        text,
  stop_below  numeric,
  stop_action text check (stop_action in ('change','background','park','kill')),
  hours_per_week numeric,
  halfway_choice text check (halfway_choice in ('keep','change')),
  halfway_note   text,
  result      numeric,
  verdict     text check (verdict in ('hit','partial','missed')),
  decision    text check (decision in ('continue','change','background','park','kill')),
  lesson      text,
  status      text not null default 'active' check (status in ('active','closed')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  check (ends_on > starts_on)
);
create unique index if not exists project_cycles_one_active on public.project_cycles(project_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- project_checkins (weekly, one per person per week; week_start = Monday)
-- ---------------------------------------------------------------------------
create table if not exists public.project_checkins (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  week_start   date not null,
  items        jsonb not null default '[]'::jsonb,
  blockers     text,
  actions      text,
  metric_value numeric,
  hours        numeric check (hours >= 0 and hours <= 168),
  confidence   integer check (confidence between 1 and 5),
  next_plan    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- project_baseline_items
-- ---------------------------------------------------------------------------
create table if not exists public.project_baseline_items (
  project_id   uuid not null references public.projects(id) on delete cascade,
  key          text not null,
  status       text not null default 'unknown' check (status in ('pass','fail','na','unknown')),
  source       text not null default 'self' check (source in ('auto','self')),
  detail       text,
  checked_at   timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  primary key (project_id, key)
);

-- ---------------------------------------------------------------------------
-- project_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.project_metrics (
  project_id uuid not null references public.projects(id) on delete cascade,
  metric     text not null check (metric ~ '^[a-z][a-z0-9_]{1,39}$'),
  on_date    date not null,
  value      numeric not null,
  source     text not null default 'snapshot' check (source in ('auto','push','snapshot')),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, metric, on_date)
);

-- ---------------------------------------------------------------------------
-- project_keys (push links)
-- ---------------------------------------------------------------------------
create table if not exists public.project_keys (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  key_hash    text not null unique,
  prefix      text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- money tags
-- ---------------------------------------------------------------------------
alter table public.transactions      add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.documents         add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.payment_links     add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.expense_templates add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists transactions_project_idx on public.transactions(project_id) where project_id is not null;

-- You can only tag your own money to a project you work on (not as a viewer).
create or replace function public.check_project_tag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null
     and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
     and not exists (
       select 1 from public.project_members
       where project_id = new.project_id and user_id = new.user_id and status = 'active'
         and role in ('owner','cofounder','contributor')
     ) then
    raise exception 'You can only tag money to a project you work on';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['transactions','documents','payment_links','expense_templates'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_project_tag', t);
    execute format('create trigger %I before insert or update of project_id on public.%I for each row execute function public.check_project_tag()', t || '_project_tag', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.projects               enable row level security;
alter table public.project_members        enable row level security;
alter table public.project_cycles         enable row level security;
alter table public.project_checkins       enable row level security;
alter table public.project_baseline_items enable row level security;
alter table public.project_metrics        enable row level security;
alter table public.project_keys           enable row level security;

-- projects
drop policy if exists "projects select" on public.projects;
drop policy if exists "projects insert" on public.projects;
drop policy if exists "projects update" on public.projects;
drop policy if exists "projects delete" on public.projects;
-- owner_id check first: INSERT ... RETURNING runs this before the trigger has added the owner's member row
create policy "projects select" on public.projects for select using (owner_id = auth.uid() or public.is_project_member(id));
create policy "projects insert" on public.projects for insert with check (owner_id = auth.uid());
create policy "projects update" on public.projects for update
  using (public.is_project_member(id, array['owner','cofounder']))
  with check (public.is_project_member(id, array['owner','cofounder']));
create policy "projects delete" on public.projects for delete using (owner_id = auth.uid());

-- members: the team sees the team; invites go through the project-invite function
drop policy if exists "members select" on public.project_members;
drop policy if exists "members update" on public.project_members;
drop policy if exists "members delete" on public.project_members;
create policy "members select" on public.project_members for select
  using (user_id = auth.uid() or public.is_project_member(project_id));
create policy "members update" on public.project_members for update
  using (user_id = auth.uid() or public.is_project_member(project_id, array['owner']));
create policy "members delete" on public.project_members for delete
  using (role <> 'owner' and (user_id = auth.uid() or public.is_project_member(project_id, array['owner'])));

-- cycles: everyone reads, owner and cofounders write
drop policy if exists "cycles select" on public.project_cycles;
drop policy if exists "cycles write" on public.project_cycles;
create policy "cycles select" on public.project_cycles for select using (public.is_project_member(project_id));
create policy "cycles write" on public.project_cycles for all
  using (public.is_project_member(project_id, array['owner','cofounder']))
  with check (public.is_project_member(project_id, array['owner','cofounder']));

-- check-ins: everyone reads, people who work on it write their own
drop policy if exists "checkins select" on public.project_checkins;
drop policy if exists "checkins insert" on public.project_checkins;
drop policy if exists "checkins update" on public.project_checkins;
drop policy if exists "checkins delete" on public.project_checkins;
create policy "checkins select" on public.project_checkins for select using (public.is_project_member(project_id));
create policy "checkins insert" on public.project_checkins for insert
  with check (user_id = auth.uid() and public.is_project_member(project_id, array['owner','cofounder','contributor']));
create policy "checkins update" on public.project_checkins for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_project_member(project_id, array['owner','cofounder','contributor']));
create policy "checkins delete" on public.project_checkins for delete using (user_id = auth.uid());

-- baseline: everyone reads, people who work on it tick items
drop policy if exists "baseline select" on public.project_baseline_items;
drop policy if exists "baseline write" on public.project_baseline_items;
create policy "baseline select" on public.project_baseline_items for select using (public.is_project_member(project_id));
create policy "baseline write" on public.project_baseline_items for all
  using (public.is_project_member(project_id, array['owner','cofounder','contributor']))
  with check (public.is_project_member(project_id, array['owner','cofounder','contributor']));

-- metrics: everyone reads, people who work on it add snapshots
drop policy if exists "metrics select" on public.project_metrics;
drop policy if exists "metrics write" on public.project_metrics;
create policy "metrics select" on public.project_metrics for select using (public.is_project_member(project_id));
create policy "metrics write" on public.project_metrics for all
  using (public.is_project_member(project_id, array['owner','cofounder','contributor']))
  with check (public.is_project_member(project_id, array['owner','cofounder','contributor']));

-- keys: owner and cofounders see and revoke (creation goes through create_project_key)
drop policy if exists "keys select" on public.project_keys;
drop policy if exists "keys update" on public.project_keys;
create policy "keys select" on public.project_keys for select using (public.is_project_member(project_id, array['owner','cofounder']));
create policy "keys update" on public.project_keys for update
  using (public.is_project_member(project_id, array['owner','cofounder']))
  with check (public.is_project_member(project_id, array['owner','cofounder']));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- New push key. The plain key is returned once and never stored.
create or replace function public.create_project_key(p_project uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_key text;
begin
  if not public.is_project_member(p_project, array['owner','cofounder']) then
    raise exception 'Not allowed';
  end if;
  v_key := 'pk_' || encode(gen_random_bytes(24), 'hex');
  insert into public.project_keys (project_id, key_hash, prefix, created_by)
  values (p_project, encode(digest(v_key, 'sha256'), 'hex'), left(v_key, 11), auth.uid());
  return v_key;
end $$;

-- The team with names (profiles are private, so names come through here).
create or replace function public.project_team(p_project uuid)
returns table (
  id uuid, user_id uuid, email text, full_name text, role text, status text,
  share_pct numeric, joined_at timestamptz, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.email, p.full_name, m.role, m.status, m.share_pct, m.joined_at, m.created_at
  from public.project_members m
  left join public.profiles p on p.id = m.user_id
  where m.project_id = p_project and public.is_project_member(p_project)
  order by case m.role when 'owner' then 0 when 'cofounder' then 1 when 'contributor' then 2 else 3 end, m.created_at;
$$;

-- Project money. Totals only: never accounts, buckets or other income.
-- Owner always; everyone else only when the owner turned sharing on.
create or replace function public.project_money(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.project_role(p_project);
  v_shared boolean;
  v_result jsonb;
begin
  if v_role is null then raise exception 'Not a member of this project'; end if;
  select money_shared into v_shared from public.projects where id = p_project;
  if v_role <> 'owner' and not coalesce(v_shared, false) then
    return jsonb_build_object('shared', false);
  end if;

  with members as (
    select user_id from public.project_members
    where project_id = p_project and status = 'active' and user_id is not null
  ),
  tx as (
    select t.type, t.amount, t.occurred_at, t.user_id
    from public.transactions t
    where t.project_id = p_project and t.parent_id is null
      and t.user_id in (select user_id from members)
  ),
  months as (
    select to_char(date_trunc('month', occurred_at at time zone 'Africa/Nairobi'), 'YYYY-MM') as month,
           sum(amount) filter (where type = 'income')  as income,
           sum(amount) filter (where type = 'expense') as costs
    from tx
    where occurred_at >= date_trunc('month', now()) - interval '11 months'
    group by 1
  ),
  bills as (
    select coalesce(sum(e.amount / greatest(e.every_months, 1)), 0) as monthly
    from public.expense_templates e
    where e.project_id = p_project and e.user_id in (select user_id from members)
  ),
  hours as (
    select c.user_id, sum(c.hours) as hours
    from public.project_checkins c
    where c.project_id = p_project and c.hours is not null
    group by c.user_id
  )
  select jsonb_build_object(
    'shared', true,
    'income_all',  coalesce((select sum(amount) from tx where type = 'income'), 0),
    'costs_all',   coalesce((select sum(amount) from tx where type = 'expense'), 0),
    'income_90d',  coalesce((select sum(amount) from tx where type = 'income'  and occurred_at >= now() - interval '90 days'), 0),
    'costs_90d',   coalesce((select sum(amount) from tx where type = 'expense' and occurred_at >= now() - interval '90 days'), 0),
    'bills_monthly', (select monthly from bills),
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'income', coalesce(income, 0), 'costs', coalesce(costs, 0)) order by month) from months), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'hours', hours)) from hours), '[]'::jsonb),
    'documents_open', coalesce((
      select sum(d.total - d.amount_paid) from public.documents d
      where d.project_id = p_project and d.kind = 'invoice' and d.status = 'sent'
        and d.user_id in (select user_id from members)
    ), 0)
  ) into v_result;
  return v_result;
end $$;

-- What an invite link shows before sign-in.
create or replace function public.get_project_invite(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'project', p.name,
    'one_liner', p.one_liner,
    'role', m.role,
    'email', m.email,
    'status', m.status,
    'invited_by', coalesce(nullif(btrim(inv.full_name), ''), split_part(inv.email, '@', 1), 'Someone')
  )
  from public.project_members m
  join public.projects p on p.id = m.project_id
  left join public.profiles inv on inv.id = m.invited_by
  where m.invite_token = p_token and p.killed_at is null;
$$;

-- Accept an invite. The signed-in email must match the invited one. Calling it
-- again as the same person returns the project (safe to retry); anyone else
-- gets "already used".
-- Someone brand new (no money recorded, joined in the last 2 days) starts with
-- the focused view: Projects only.
create or replace function public.accept_project_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_member public.project_members;
  v_email text;
  v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_member from public.project_members where invite_token = p_token;
  if not found then raise exception 'This invite link is no longer valid'; end if;
  if v_member.status = 'active' then
    if v_member.user_id = auth.uid() then return v_member.project_id; end if;
    raise exception 'This invite has already been used';
  end if;
  if lower(v_member.email) <> v_email then
    raise exception 'invite_email_mismatch: This invite was sent to %. Sign in with that email to accept it.', v_member.email;
  end if;

  perform set_config('sipe.accepting_invite', 'on', true);
  update public.project_members
     set user_id = auth.uid(), status = 'active', joined_at = now()
   where id = v_member.id;
  perform set_config('sipe.accepting_invite', '', true);

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.signup_source is null
     and v_profile.created_at > now() - interval '2 days'
     and not exists (select 1 from public.transactions where user_id = auth.uid()) then
    update public.profiles
       set signup_source = 'invite', enabled_modules = array['projects']
     where id = auth.uid();
  end if;
  return v_member.project_id;
end $$;

-- Change my own mode (Focus / Background / Parked) on a project.
create or replace function public.set_project_mode(p_project uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('focus','background','parked') then raise exception 'Unknown mode'; end if;
  update public.project_members set mode = p_mode
   where project_id = p_project and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not a member of this project'; end if;
end $$;

grant execute on function public.get_project_invite(uuid) to anon, authenticated;
grant execute on function public.accept_project_invite(uuid) to authenticated;
grant execute on function public.project_money(uuid) to authenticated;
grant execute on function public.project_team(uuid) to authenticated;
grant execute on function public.create_project_key(uuid) to authenticated;
grant execute on function public.set_project_mode(uuid, text) to authenticated;
grant execute on function public.is_project_member(uuid, text[]) to authenticated;
grant execute on function public.project_role(uuid) to authenticated;
