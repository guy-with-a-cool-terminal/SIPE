-- Add source field to transactions for manual deposits
alter table public.transactions add column if not exists source text;

-- Payment links: customizable Paystack links
create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  paystack_slug text,
  paystack_url text,
  paystack_id bigint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index payment_links_user_idx on public.payment_links(user_id, created_at desc);
create unique index payment_links_slug_idx on public.payment_links(paystack_slug) where paystack_slug is not null;

alter table public.payment_links enable row level security;

create policy "own links select" on public.payment_links for select using (auth.uid() = user_id);
create policy "own links insert" on public.payment_links for insert with check (auth.uid() = user_id);
create policy "own links update" on public.payment_links for update using (auth.uid() = user_id);
create policy "own links delete" on public.payment_links for delete using (auth.uid() = user_id);

-- Link a transaction back to a payment_link
alter table public.transactions add column if not exists payment_link_id uuid references public.payment_links(id) on delete set null;
create index if not exists transactions_payment_link_idx on public.transactions(payment_link_id) where payment_link_id is not null;
