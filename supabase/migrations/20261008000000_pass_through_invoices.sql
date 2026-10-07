-- ============================================================================
--  SIPE — pass-through invoices
--
--  Not every invoice is income. A brokerage deal or a new-venture float moves
--  cash through you without being profit. `documents.counts_as_income = false`
--  marks such a quote / invoice: its payments are recorded against the invoice
--  but never go through record-deposit, so they stay out of the S/I/P/E
--  buckets, transactions and analytics.
--
--  `business_profiles.default_counts_as_income` prefills new documents.
--  Idempotent.
-- ============================================================================

alter table public.documents
  add column if not exists counts_as_income boolean not null default true;

alter table public.business_profiles
  add column if not exists default_counts_as_income boolean not null default true;

-- A converted quote keeps its income / pass-through setting.
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
    discount_type, discount_value, tax_rate, tax_label, source_quote_id, counts_as_income
  ) values (
    v_q.user_id, 'invoice', v_q.client_id, v_q.title, v_q.summary, v_q.deliverables,
    coalesce(v_q.reference, v_q.number), null,
    v_q.payment_terms, v_bp.invoice_notes, v_bp.invoice_terms,
    current_date, current_date + coalesce(v_bp.default_due_days, 14),
    v_q.discount_type, v_q.discount_value, v_q.tax_rate, v_q.tax_label, v_q.id, v_q.counts_as_income
  ) returning id into v_new;

  insert into public.document_items (document_id, user_id, position, description, details, quantity, unit_price)
  select v_new, user_id, position, description, details, quantity, unit_price
    from public.document_items where document_id = p_id;

  if v_q.status <> 'draft' then
    update public.documents set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = p_id;
  end if;
  return v_new;
end $$;


-- The client's view never says whether you count the money as income.
create or replace function public.get_public_document(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'document', to_jsonb(d) - array['user_id','client_id','source_quote_id','public_token','counts_as_income'],
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

