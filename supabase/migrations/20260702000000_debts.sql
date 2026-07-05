create table public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  direction   text not null check (direction in ('owe', 'owed')),
  party       text not null,
  description text,
  amount      numeric(14,2) not null check (amount > 0),
  due_date    date,
  settled     boolean not null default false,
  settled_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.debts enable row level security;
create policy "own debts all" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
