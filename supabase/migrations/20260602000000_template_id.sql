alter table public.transactions
  add column if not exists template_id uuid references public.expense_templates(id) on delete set null;
