-- ============================================================================
--  SIPE — quotations + invoices  (single migration)
--
--  business_profiles  per-user issuer details + document defaults (prefills)
--  clients            who you bill
--  documents          quotes and invoices (one table, `kind` discriminates)
--  document_items     line items
--  document_payments  money received against an invoice (optionally tied to the
--                     SIPE income transaction that split it into buckets)
--
--  Totals are computed in Postgres (triggers) so the list views, the public
--  link and the app always agree. Numbers are assigned on finalise, never on
--  draft, so deleted drafts leave no gaps in the sequence.
--
--  Idempotent: every object is guarded; re-running is a no-op.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type public.document_kind as enum ('quote','invoice');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_status') then
    -- quote:   draft → sent → accepted | declined   (void to withdraw)
    -- invoice: draft → sent → paid                   (void to cancel)
    create type public.document_status as enum ('draft','sent','accepted','declined','paid','void');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- business_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- identity
  legal_name   text,
  trading_name text,
  tagline      text,
  kra_pin      text,
  email        text,
  phone        text,
  website      text,
  address      text,
  logo_url     text,
  brand_color  text not null default '#0f172a',
  header_style text not null default 'band' check (header_style in ('band','minimal')),

  -- tax
  vat_registered   boolean not null default false,
  default_tax_rate numeric(5,2) not null default 16 check (default_tax_rate >= 0 and default_tax_rate <= 100),

  -- how clients pay you
  bank_name           text,
  bank_branch         text,
  bank_account_name   text,
  bank_account_number text,
  bank_swift          text,
  mpesa_paybill       text,
  mpesa_account       text,
  mpesa_till          text,
  mpesa_phone         text,
  payment_note        text,

  -- numbering: {prefix}-{YYYY}-{0001}
  invoice_prefix   text not null default 'INV',
  quote_prefix     text not null default 'QT',
  next_invoice_seq integer not null default 1 check (next_invoice_seq > 0),
  next_quote_seq   integer not null default 1 check (next_quote_seq > 0),

  -- prefills for new documents
  default_due_days   integer not null default 14 check (default_due_days between 0 and 365),
  default_valid_days integer not null default 30 check (default_valid_days between 0 and 365),
  invoice_notes        text,
  invoice_terms        text,
  quote_notes          text,
  quote_terms          text,
  quote_payment_terms  text,
  signatory_name  text,
  signatory_title text,
  footer_text     text,

  updated_at timestamptz not null default now()
);
alter table public.business_profiles enable row level security;

drop policy if exists "own bp select" on public.business_profiles;
drop policy if exists "own bp insert" on public.business_profiles;
drop policy if exists "own bp update" on public.business_profiles;
create policy "own bp select" on public.business_profiles for select using (auth.uid() = user_id);
create policy "own bp insert" on public.business_profiles for insert with check (auth.uid() = user_id);
create policy "own bp update" on public.business_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name         text not null,          -- contact person, or the company if no contact
  company      text,
  email        text,
  phone        text,
  address      text,
  kra_pin      text,
  notes        text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients(user_id, archived);
alter table public.clients enable row level security;

drop policy if exists "own clients select" on public.clients;
drop policy if exists "own clients insert" on public.clients;
drop policy if exists "own clients update" on public.clients;
drop policy if exists "own clients delete" on public.clients;
create policy "own clients select" on public.clients for select using (auth.uid() = user_id);
create policy "own clients insert" on public.clients for insert with check (auth.uid() = user_id);
create policy "own clients update" on public.clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own clients delete" on public.clients for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind   public.document_kind   not null,
  status public.document_status not null default 'draft',
  number text,                                   -- null until finalised

  client_id uuid references public.clients(id) on delete set null,
  -- frozen copies taken on finalise; drafts render from the live rows
  client_snapshot jsonb,
  issuer_snapshot jsonb,

  title        text,                             -- project name
  summary      text,
  deliverables text[] not null default '{}',
  reference    text,                             -- client PO / their ref
  timeline     text,
  payment_terms text,
  notes        text,
  terms        text,
  etims_number text,

  issue_date date not null default current_date,
  due_date   date,                               -- invoice: due · quote: valid until

  discount_type  text not null default 'amount' check (discount_type in ('amount','percent')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  tax_rate       numeric(5,2)  not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_label      text not null default 'VAT',

  -- computed by documents_compute_totals; never written by clients
  subtotal        numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,

  source_quote_id  uuid references public.documents(id) on delete set null,
  public_token     uuid not null default gen_random_uuid() unique,
  payment_link_url text,

  sent_at     timestamptz,
  accepted_at timestamptz,
  paid_at     timestamptz,
  voided_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists documents_user_idx on public.documents(user_id, kind, created_at desc);
create index if not exists documents_client_idx on public.documents(client_id) where client_id is not null;
create unique index if not exists documents_number_idx on public.documents(user_id, kind, number) where number is not null;
alter table public.documents enable row level security;

drop policy if exists "own docs select" on public.documents;
drop policy if exists "own docs insert" on public.documents;
drop policy if exists "own docs update" on public.documents;
drop policy if exists "own docs delete" on public.documents;
create policy "own docs select" on public.documents for select using (auth.uid() = user_id);
create policy "own docs insert" on public.documents for insert with check (auth.uid() = user_id and status = 'draft' and number is null);
create policy "own docs update" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Only drafts can be deleted. A finalised document is voided, so the number stays accounted for.
create policy "own docs delete" on public.documents for delete using (auth.uid() = user_id and status = 'draft');

-- ---------------------------------------------------------------------------
-- document_items
-- ---------------------------------------------------------------------------
create table if not exists public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position    integer not null default 0,
  description text not null,
  details     text,
  quantity    numeric(12,2) not null default 1 check (quantity > 0),
  unit_price  numeric(14,2) not null default 0 check (unit_price >= 0),
  amount      numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index if not exists document_items_doc_idx on public.document_items(document_id, position);
alter table public.document_items enable row level security;

drop policy if exists "own items select" on public.document_items;
drop policy if exists "own items insert" on public.document_items;
drop policy if exists "own items update" on public.document_items;
drop policy if exists "own items delete" on public.document_items;
create policy "own items select" on public.document_items for select using (auth.uid() = user_id);
create policy "own items insert" on public.document_items for insert with check (auth.uid() = user_id);
create policy "own items update" on public.document_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own items delete" on public.document_items for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- document_payments
-- ---------------------------------------------------------------------------
create table if not exists public.document_payments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount    numeric(14,2) not null check (amount > 0),
  paid_at   timestamptz not null default now(),
  method    text not null default 'mpesa' check (method in ('mpesa','bank','paystack','cash','other')),
  reference text,                                -- M-Pesa code, bank ref
  note      text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists document_payments_doc_idx on public.document_payments(document_id, paid_at);
alter table public.document_payments enable row level security;

drop policy if exists "own dp select" on public.document_payments;
drop policy if exists "own dp insert" on public.document_payments;
drop policy if exists "own dp delete" on public.document_payments;
create policy "own dp select" on public.document_payments for select using (auth.uid() = user_id);
create policy "own dp insert" on public.document_payments for insert with check (auth.uid() = user_id);
create policy "own dp delete" on public.document_payments for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- totals + status, kept in Postgres
--
-- BEFORE UPDATE/INSERT on documents recomputes every money column from the
-- items and payments. Item / payment changes "touch" the parent row, which
-- fires that trigger. The BEFORE trigger never issues its own UPDATE, so
-- there is no recursion.
-- ---------------------------------------------------------------------------
create or replace function public.documents_compute_totals()
returns trigger
language plpgsql
as $$
declare
  v_sub  numeric(14,2);
  v_disc numeric(14,2);
  v_tax  numeric(14,2);
  v_paid numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_sub from public.document_items where document_id = new.id;
  select coalesce(sum(amount), 0) into v_paid from public.document_payments where document_id = new.id;

  v_disc := case new.discount_type
    when 'percent' then round(v_sub * least(new.discount_value, 100) / 100, 2)
    else least(new.discount_value, v_sub)
  end;
  v_tax := round((v_sub - v_disc) * new.tax_rate / 100, 2);

  new.subtotal        := v_sub;
  new.discount_amount := v_disc;
  new.tax_amount      := v_tax;
  new.total           := v_sub - v_disc + v_tax;
  new.amount_paid     := v_paid;
  new.updated_at      := now();

  -- An invoice flips to paid when fully covered and back to sent if a payment is removed.
  if new.kind = 'invoice' and new.status in ('sent','paid') then
    if new.total > 0 and v_paid >= new.total then
      new.status  := 'paid';
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.status  := 'sent';
      new.paid_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists documents_compute_totals on public.documents;
create trigger documents_compute_totals
  before insert or update on public.documents
  for each row execute function public.documents_compute_totals();

-- A finalised invoice is immutable: void it and issue a new one instead.
-- Quotes stay editable until accepted (a revised quote is normal).
create or replace function public.document_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_doc uuid := coalesce(new.document_id, old.document_id);
  v_kind public.document_kind;
  v_status public.document_status;
begin
  select kind, status into v_kind, v_status from public.documents where id = v_doc;
  if v_status is not null and (
       (v_kind = 'invoice' and v_status <> 'draft')
    or (v_kind = 'quote'   and v_status in ('accepted','void'))
  ) then
    raise exception 'This % is %, its line items are locked', v_kind, v_status;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists document_items_guard on public.document_items;
create trigger document_items_guard
  before insert or update or delete on public.document_items
  for each row execute function public.document_items_guard();

create or replace function public.documents_touch_parent()
returns trigger
language plpgsql
as $$
begin
  update public.documents set updated_at = now()
   where id = coalesce(new.document_id, old.document_id);
  return null;
end $$;

drop trigger if exists document_items_touch on public.document_items;
create trigger document_items_touch
  after insert or update or delete on public.document_items
  for each row execute function public.documents_touch_parent();

-- Payments only land on a finalised, non-void invoice.
create or replace function public.document_payments_guard()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.documents
     where id = new.document_id and kind = 'invoice' and status in ('sent','paid')
  ) then
    raise exception 'Payments can only be recorded on a finalised invoice';
  end if;
  return new;
end $$;

drop trigger if exists document_payments_guard on public.document_payments;
create trigger document_payments_guard
  before insert on public.document_payments
  for each row execute function public.document_payments_guard();

drop trigger if exists document_payments_touch on public.document_payments;
create trigger document_payments_touch
  after insert or delete on public.document_payments
  for each row execute function public.documents_touch_parent();

-- Money columns on a finalised invoice can't be changed through the API.
create or replace function public.documents_lock_finalised()
returns trigger
language plpgsql
as $$
begin
  if old.kind = 'invoice' and old.status <> 'draft' and (
       new.discount_type  is distinct from old.discount_type
    or new.discount_value is distinct from old.discount_value
    or new.tax_rate       is distinct from old.tax_rate
    or new.issue_date     is distinct from old.issue_date
  ) then
    raise exception 'This invoice is finalised. Void it and create a new one to change amounts.';
  end if;
  -- A number is only ever assigned by finalise_document().
  if new.number is distinct from old.number and current_setting('sipe.finalising', true) is distinct from 'on' then
    raise exception 'Document numbers are assigned on finalise';
  end if;
  return new;
end $$;

drop trigger if exists documents_lock_finalised on public.documents;
create trigger documents_lock_finalised
  before update on public.documents
  for each row execute function public.documents_lock_finalised();

-- ---------------------------------------------------------------------------
-- finalise_document(id): assign the next number, freeze issuer + client, mark sent.
-- Runs as the caller (RLS applies); the business_profiles row lock makes the
-- counter safe under concurrent finalises.
-- ---------------------------------------------------------------------------
create or replace function public.finalise_document(p_id uuid)
returns public.documents
language plpgsql
as $$
declare
  v_doc public.documents;
  v_bp  public.business_profiles;
  v_seq integer;
  v_prefix text;
begin
  select * into v_doc from public.documents where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Document not found'; end if;
  if v_doc.status <> 'draft' then raise exception 'Already finalised'; end if;
  if not exists (select 1 from public.document_items where document_id = p_id) then
    raise exception 'Add at least one line item first';
  end if;

  select * into v_bp from public.business_profiles where user_id = auth.uid() for update;
  if not found or coalesce(trim(v_bp.legal_name), '') = '' then
    raise exception 'Set your business name in Settings › Business first';
  end if;

  if v_doc.kind = 'invoice' then
    v_seq := v_bp.next_invoice_seq; v_prefix := v_bp.invoice_prefix;
    update public.business_profiles set next_invoice_seq = next_invoice_seq + 1 where user_id = auth.uid();
  else
    v_seq := v_bp.next_quote_seq; v_prefix := v_bp.quote_prefix;
    update public.business_profiles set next_quote_seq = next_quote_seq + 1 where user_id = auth.uid();
  end if;

  perform set_config('sipe.finalising', 'on', true);
  update public.documents set
    number = coalesce(nullif(trim(v_prefix), '') || '-', '') || to_char(v_doc.issue_date, 'YYYY') || '-' || lpad(v_seq::text, 4, '0'),
    status = 'sent',
    sent_at = now(),
    issuer_snapshot = to_jsonb(v_bp) - array['user_id','next_invoice_seq','next_quote_seq','updated_at',
                                             'invoice_notes','invoice_terms','quote_notes','quote_terms','quote_payment_terms'],
    client_snapshot = (select to_jsonb(c) - array['user_id','notes','archived','created_at']
                         from public.clients c where c.id = v_doc.client_id)
  where id = p_id
  returning * into v_doc;
  perform set_config('sipe.finalising', 'off', true);

  return v_doc;
end $$;

grant execute on function public.finalise_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- convert_quote_to_invoice(id): copy a quote into a new draft invoice, prefilled
-- with the invoice defaults, and mark the quote accepted.
-- ---------------------------------------------------------------------------
create or replace function public.convert_quote_to_invoice(p_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_q   public.documents;
  v_bp  public.business_profiles;
  v_new uuid;
begin
  select * into v_q from public.documents where id = p_id and user_id = auth.uid() and kind = 'quote' for update;
  if not found then raise exception 'Quote not found'; end if;
  if v_q.status in ('declined','void') then raise exception 'This quote is %', v_q.status; end if;

  select * into v_bp from public.business_profiles where user_id = auth.uid();

  insert into public.documents (
    user_id, kind, client_id, title, summary, deliverables, reference, timeline,
    payment_terms, notes, terms, issue_date, due_date,
    discount_type, discount_value, tax_rate, tax_label, source_quote_id
  ) values (
    v_q.user_id, 'invoice', v_q.client_id, v_q.title, v_q.summary, v_q.deliverables,
    coalesce(v_q.reference, v_q.number), null,
    v_q.payment_terms, v_bp.invoice_notes, v_bp.invoice_terms,
    current_date, current_date + coalesce(v_bp.default_due_days, 14),
    v_q.discount_type, v_q.discount_value, v_q.tax_rate, v_q.tax_label, v_q.id
  ) returning id into v_new;

  insert into public.document_items (document_id, user_id, position, description, details, quantity, unit_price)
  select v_new, user_id, position, description, details, quantity, unit_price
    from public.document_items where document_id = p_id;

  if v_q.status <> 'draft' then
    update public.documents set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = p_id;
  end if;
  return v_new;
end $$;

grant execute on function public.convert_quote_to_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_public_document(token): what the client sees at /d/<token>.
-- Drafts are never public. SECURITY DEFINER so anon can read exactly one doc.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'document', to_jsonb(d) - array['user_id','client_id','source_quote_id','public_token'],
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - array['user_id','document_id'] order by i.position)
        from public.document_items i where i.document_id = d.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_at', p.paid_at,
                                          'method', p.method, 'reference', p.reference) order by p.paid_at)
        from public.document_payments p where p.document_id = d.id), '[]'::jsonb)
  )
  from public.documents d
  where d.public_token = p_token and d.status <> 'draft'
$$;

revoke all on function public.get_public_document(uuid) from public;
grant execute on function public.get_public_document(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- storage: public bucket for logos, one folder per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "brand own insert" on storage.objects;
drop policy if exists "brand own update" on storage.objects;
drop policy if exists "brand own delete" on storage.objects;
create policy "brand own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand own update" on storage.objects for update to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "brand own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);
