create table public.debt_payments (
  id       uuid primary key default gen_random_uuid(),
  debt_id  uuid not null references public.debts(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  amount   numeric(14,2) not null check (amount > 0),
  note     text,
  paid_at  timestamptz not null default now()
);

alter table public.debt_payments enable row level security;
create policy "own debt payments all" on public.debt_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
