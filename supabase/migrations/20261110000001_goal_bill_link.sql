-- Link a goal to the bill it pre-pays ("Rent: 12 months ahead").
--
-- Set by the Get-ahead planner. Lets the app say "2.3 months ahead on rent"
-- (goal progress / the bill's monthly cost) on the Dashboard and in the weekly
-- email. Deleting the bill leaves the goal as an ordinary goal.

alter table public.goals
  add column if not exists bill_id uuid references public.expense_templates(id) on delete set null;

create index if not exists goals_bill_idx on public.goals(bill_id) where bill_id is not null;
