-- Recreate bucket_balances with an explicit user filter so the view is safe
-- even if security_invoker behaviour differs across Supabase versions.
create or replace view public.bucket_balances
with (security_invoker = true) as
select
  user_id,
  bucket,
  sum(case when type = 'income'  then amount else 0 end) as allocated,
  sum(case when type = 'expense' then amount else 0 end) as spent,
  sum(case when type = 'income'  then amount else -amount end) as balance
from public.transactions
where bucket is not null
  and user_id = auth.uid()
group by user_id, bucket;

grant select on public.bucket_balances to authenticated;
