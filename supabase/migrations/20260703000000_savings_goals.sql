alter table public.allocation_settings
  add column if not exists savings_goal  numeric(14,2),
  add column if not exists invest_goal   numeric(14,2),
  add column if not exists pay_goal      numeric(14,2),
  add column if not exists expenses_goal numeric(14,2);
