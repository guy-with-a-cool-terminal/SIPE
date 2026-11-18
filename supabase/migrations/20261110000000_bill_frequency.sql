-- Bills that don't recur monthly (yearly wifi, quarterly insurance).
--
-- `every_months` is how often the bill is due: 1 = monthly (the old behaviour,
-- so existing rows are unchanged), 3, 6 or 12. `amount` stays the amount paid
-- each time; the app derives the monthly set-aside as amount / every_months.

alter table public.expense_templates
  add column if not exists every_months smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expense_templates_every_months_ck'
  ) then
    alter table public.expense_templates
      add constraint expense_templates_every_months_ck check (every_months in (1, 3, 6, 12));
  end if;
end $$;
