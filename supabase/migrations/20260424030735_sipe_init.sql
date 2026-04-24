-- SIPE initial schema
create extension if not exists "pgcrypto";

create type public.bucket as enum ('S','I','P','E');
create type public.txn_type as enum ('income','expense');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  currency text not null default 'KES',
  created_at timestamptz not null default now()
);

create table public.allocation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  savings_pct int not null default 20 check (savings_pct >= 0 and savings_pct <= 100),
  invest_pct  int not null default 15 check (invest_pct  >= 0 and invest_pct  <= 100),
  pay_pct     int not null default 50 check (pay_pct     >= 0 and pay_pct     <= 100),
  expenses_pct int not null default 15 check (expenses_pct >= 0 and expenses_pct <= 100),
  updated_at timestamptz not null default now(),
  constraint pcts_sum_100 check (savings_pct + invest_pct + pay_pct + expenses_pct = 100)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.txn_type not null,
  bucket public.bucket,
  amount numeric(14,2) not null check (amount > 0),
  category text,
  description text,
  paystack_ref text,
  parent_id uuid references public.transactions(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index transactions_user_idx on public.transactions(user_id, occurred_at desc);
create index transactions_bucket_idx on public.transactions(user_id, bucket);
create unique index transactions_paystack_ref_idx on public.transactions(paystack_ref) where paystack_ref is not null;

alter table public.profiles enable row level security;
alter table public.allocation_settings enable row level security;
alter table public.transactions enable row level security;

create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

create policy "own settings all" on public.allocation_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own txns select" on public.transactions for select using (auth.uid() = user_id);
create policy "own txns insert" on public.transactions for insert with check (auth.uid() = user_id);
create policy "own txns update" on public.transactions for update using (auth.uid() = user_id);
create policy "own txns delete" on public.transactions for delete using (auth.uid() = user_id);

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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace view public.bucket_balances
with (security_invoker = true) as
select
  user_id,
  bucket,
  sum(case when type='income'  then amount else 0 end) as allocated,
  sum(case when type='expense' then amount else 0 end) as spent,
  sum(case when type='income'  then amount else -amount end) as balance
from public.transactions
where bucket is not null
group by user_id, bucket;

grant select on public.bucket_balances to authenticated;
