-- ============================================================================
--  SIPE — accounts + goals + email/notifications  (single migration)
--
--  One idempotent script for the whole feature set. Run it however you like:
--   • Supabase dashboard → SQL Editor → paste → Run   (wrapped in a txn)
--   • psql "$DATABASE_URL" -f this-file
--
--  Safe on a database with the pre-2026-09 schema. Every object is guarded, so
--  re-running is a harmless no-op.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_kind') then
    create type public.account_kind as enum ('platform','bank','mpesa','cash','other');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_status') then
    create type public.goal_status as enum ('active','achieved','paused','archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'goal_funding') then
    create type public.goal_funding as enum ('bucket','account','manual','deposit_pct');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- accounts + account_id on transactions + transfers + adjustments
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.account_kind not null default 'other',
  institution text,
  provider_slug text,
  route_kind text check (route_kind in ('ops','costs')),
  opening_balance numeric(14,2) not null default 0,
  opening_balance_at timestamptz not null default now(),
  is_default boolean not null default false,
  archived boolean not null default false,
  color text,
  notes text,
  sync_config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts(user_id, archived);
create unique index if not exists accounts_one_default_idx on public.accounts(user_id) where is_default;
alter table public.accounts enable row level security;

drop policy if exists "own accounts select" on public.accounts;
drop policy if exists "own accounts insert" on public.accounts;
drop policy if exists "own accounts update" on public.accounts;
drop policy if exists "own accounts delete" on public.accounts;
create policy "own accounts select" on public.accounts for select using (auth.uid() = user_id);
create policy "own accounts insert" on public.accounts for insert with check (auth.uid() = user_id);
create policy "own accounts update" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own accounts delete" on public.accounts for delete using (auth.uid() = user_id);

alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists transactions_account_idx
  on public.transactions(account_id) where account_id is not null;

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete cascade,
  to_account_id   uuid not null references public.accounts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  fee    numeric(14,2) not null default 0 check (fee >= 0),
  note text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint different_accounts check (from_account_id <> to_account_id)
);
create index if not exists account_transfers_user_idx on public.account_transfers(user_id, occurred_at desc);
alter table public.account_transfers enable row level security;

drop policy if exists "own transfers select" on public.account_transfers;
drop policy if exists "own transfers insert" on public.account_transfers;
drop policy if exists "own transfers update" on public.account_transfers;
drop policy if exists "own transfers delete" on public.account_transfers;
create policy "own transfers select" on public.account_transfers for select using (auth.uid() = user_id);
create policy "own transfers insert" on public.account_transfers for insert with check (auth.uid() = user_id);
create policy "own transfers update" on public.account_transfers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transfers delete" on public.account_transfers for delete using (auth.uid() = user_id);

create table if not exists public.account_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(14,2) not null,
  reason text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists account_adjustments_idx on public.account_adjustments(user_id, account_id);
alter table public.account_adjustments enable row level security;

drop policy if exists "own adj select" on public.account_adjustments;
drop policy if exists "own adj insert" on public.account_adjustments;
drop policy if exists "own adj update" on public.account_adjustments;
drop policy if exists "own adj delete" on public.account_adjustments;
create policy "own adj select" on public.account_adjustments for select using (auth.uid() = user_id);
create policy "own adj insert" on public.account_adjustments for insert with check (auth.uid() = user_id);
create policy "own adj update" on public.account_adjustments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own adj delete" on public.account_adjustments for delete using (auth.uid() = user_id);

create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id      as account_id,
  a.user_id as user_id,
  a.opening_balance
    + coalesce(t.net, 0) + coalesce(xf.net, 0) + coalesce(adj.net, 0) as balance,
  coalesce(t.inflow, 0)  as inflow,
  coalesce(t.outflow, 0) as outflow,
  a.last_synced_at
from public.accounts a
left join lateral (
  select
    coalesce(sum(amount) filter (
      where type = 'income' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as inflow,
    coalesce(sum(amount) filter (
      where type = 'expense' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as outflow,
    coalesce(sum(amount) filter (
      where type = 'income' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0)
    - coalesce(sum(amount) filter (
      where type = 'expense' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as net
  from public.transactions where account_id = a.id
) t on true
left join lateral (
  select
    coalesce(sum(amount)       filter (where to_account_id   = a.id), 0)
  - coalesce(sum(amount + fee) filter (where from_account_id = a.id), 0) as net
  from public.account_transfers where from_account_id = a.id or to_account_id = a.id
) xf on true
left join lateral (
  select coalesce(sum(amount), 0) as net
  from public.account_adjustments where account_id = a.id
) adj on true;

grant select on public.account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- goals + goal_contributions + goal_progress  (+ migrate & drop *_goal cols)
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  status  public.goal_status  not null default 'active',
  funding public.goal_funding not null default 'manual',
  bucket public.bucket,
  account_id uuid references public.accounts(id) on delete set null,
  deposit_pct numeric(5,2) check (deposit_pct is null or (deposit_pct > 0 and deposit_pct <= 100)),
  sort_order int not null default 0,
  notes text,
  created_at  timestamptz not null default now(),
  achieved_at timestamptz,
  constraint funding_bucket_ck  check (funding <> 'bucket'      or bucket is not null),
  constraint funding_account_ck check (funding <> 'account'     or account_id is not null),
  constraint funding_pct_ck     check (funding <> 'deposit_pct' or deposit_pct is not null)
);
create index if not exists goals_user_idx on public.goals(user_id, status, sort_order);
alter table public.goals enable row level security;
drop policy if exists "own goals all" on public.goals;
create policy "own goals all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  note text,
  auto boolean not null default false,
  transaction_id uuid references public.transactions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists goal_contributions_idx on public.goal_contributions(goal_id, occurred_at desc);
alter table public.goal_contributions enable row level security;
drop policy if exists "own gc all" on public.goal_contributions;
create policy "own gc all" on public.goal_contributions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace view public.goal_progress
with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  case g.funding
    when 'bucket'  then coalesce((select bb.balance from public.bucket_balances bb
                                  where bb.user_id = g.user_id and bb.bucket = g.bucket), 0)
    when 'account' then coalesce((select ab.balance from public.account_balances ab
                                  where ab.account_id = g.account_id), 0)
    else coalesce((select sum(amount) from public.goal_contributions gc where gc.goal_id = g.id), 0)
  end as current_amount,
  g.target_amount,
  (select count(*)         from public.goal_contributions gc where gc.goal_id = g.id) as contribution_count,
  (select max(occurred_at) from public.goal_contributions gc where gc.goal_id = g.id) as last_contribution_at
from public.goals g;
grant select on public.goal_progress to authenticated;

-- migrate allocation_settings.*_goal -> goals rows, then drop the columns.
-- runs only while the columns still exist; skips buckets that already have a goal.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'allocation_settings' and column_name = 'savings_goal'
  ) then
    execute $mig$
      insert into public.goals (user_id, name, target_amount, funding, bucket)
      select s.user_id,
             case s.bkt when 'S' then 'Savings target' when 'I' then 'Investment target'
                        when 'P' then 'Pay-yourself target' else 'Expenses target' end,
             s.amt, 'bucket', s.bkt
      from (
        select user_id, 'S'::public.bucket as bkt, savings_goal   as amt from public.allocation_settings where savings_goal   > 0
        union all select user_id, 'I'::public.bucket, invest_goal   from public.allocation_settings where invest_goal   > 0
        union all select user_id, 'P'::public.bucket, pay_goal      from public.allocation_settings where pay_goal      > 0
        union all select user_id, 'E'::public.bucket, expenses_goal from public.allocation_settings where expenses_goal > 0
      ) s
      where not exists (
        select 1 from public.goals g
        where g.user_id = s.user_id and g.funding = 'bucket' and g.bucket = s.bkt
      )
    $mig$;
    execute 'alter table public.allocation_settings
               drop column savings_goal, drop column invest_goal,
               drop column pay_goal,     drop column expenses_goal';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- email_preferences + announcements + notifications + email_log
-- ---------------------------------------------------------------------------
create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_review boolean not null default true,
  tips          boolean not null default true,
  announcements boolean not null default true,
  goal_updates  boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create unique index if not exists email_preferences_token_idx on public.email_preferences(unsubscribe_token);
alter table public.email_preferences enable row level security;
drop policy if exists "own email prefs all" on public.email_preferences;
create policy "own email prefs all" on public.email_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_md text not null,
  cta_label text,
  cta_url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists announcements_published_idx on public.announcements(published_at desc);
alter table public.announcements enable row level security;
drop policy if exists "published announcements readable" on public.announcements;
create policy "published announcements readable" on public.announcements
  for select using (published_at is not null and published_at <= now());

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists "own notifications select" on public.notifications;
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications select" on public.notifications
  for select using (auth.uid() = user_id);
create policy "own notifications update" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref_id uuid,
  resend_id text,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);
create unique index if not exists email_log_unique_idx on public.email_log(user_id, kind, ref_id);
create index if not exists email_log_user_kind_idx on public.email_log(user_id, kind, sent_at desc);
alter table public.email_log enable row level security;
-- service-role only: no policies

-- ---------------------------------------------------------------------------
-- signup trigger: also seed email_preferences (keeps existing inserts)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  insert into public.allocation_settings (user_id) values (new.id);
  insert into public.email_preferences (user_id) values (new.id);
  return new;
end;
$$;

insert into public.email_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- service-role-safe bucket balances (weekly email runs under service role,
-- where bucket_balances' auth.uid() filter returns nothing)
-- ---------------------------------------------------------------------------
create or replace function public.user_bucket_balances(p_user_id uuid)
returns table (
  bucket    public.bucket,
  allocated numeric,
  spent     numeric,
  balance   numeric
)
language sql
security definer
set search_path = public
as $$
  select
    bucket,
    sum(case when type = 'income'  then amount else 0 end)       as allocated,
    sum(case when type = 'expense' then amount else 0 end)       as spent,
    sum(case when type = 'income'  then amount else -amount end) as balance
  from public.transactions
  where bucket is not null
    and user_id = p_user_id
  group by bucket
$$;
revoke all on function public.user_bucket_balances(uuid) from public;
grant execute on function public.user_bucket_balances(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- enforce one default account per user, server-side
-- ---------------------------------------------------------------------------
create or replace function public.enforce_single_default_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default then
    update public.accounts
       set is_default = false
     where user_id = new.user_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_single_default on public.accounts;
create trigger accounts_single_default
  before insert or update of is_default on public.accounts
  for each row
  when (new.is_default)
  execute function public.enforce_single_default_account();
