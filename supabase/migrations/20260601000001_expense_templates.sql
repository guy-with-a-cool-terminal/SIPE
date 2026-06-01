create table public.expense_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  category    text,
  bucket      public.bucket not null,
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

alter table public.expense_templates enable row level security;
create policy "own templates all" on public.expense_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
