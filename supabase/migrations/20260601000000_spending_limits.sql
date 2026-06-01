alter table public.allocation_settings
  add column if not exists savings_limit  numeric(14,2),
  add column if not exists invest_limit   numeric(14,2),
  add column if not exists pay_limit      numeric(14,2),
  add column if not exists expenses_limit numeric(14,2);
