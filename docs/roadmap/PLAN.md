# PLAN — Multi-platform money, Goals redesign, Email system

Status: **approved, in build**. Started 2026-09-03.

## Decisions (locked)

1. **Accounts use one linked ledger.** `transactions` gets a nullable `account_id`. An
   account's balance = its opening balance + the transactions tagged to it + account-to-account
   transfers + manual adjustments. Accounts and S/I/P/E buckets are two views of the same money
   and should reconcile; the UI surfaces the difference rather than hard-enforcing it.
2. **Goals become a first-class table** and replace the four `allocation_settings.*_goal`
   columns. Existing values are migrated into `goals` rows, then the columns are dropped.
3. **Email automation runs on Supabase pg_cron** (Appendix A).
4. **The ops/costs API integrations are NOT built now.** We build the *foundation* only
   (schema fields, a `sync-account` stub, a documented adapter interface). Everything else ships.

## The problem being solved

The user runs recurring-revenue API services hosted on client webapps (lexinon, toefl-academic,
global-dream-link, lufa, …), each with a Pretium integration behind an `ops` or `costs` route.
Money also sits in bank accounts (LCB, I&M), M-Pesa, and cash. Today deposits are recorded as
free-text and the physical location of the money is lost — there is no single view of "how much
cash is where" and no way to know if a platform account has money waiting to be withdrawn.

Plus: goals are barely a feature, and there is no way to email users about new features, money
tips, or goal progress.

---

## Architecture additions

### New tables

- `accounts` — a money location (platform / bank / mpesa / cash / other)
- `account_transfers` — cash moved between two accounts (platform payout → bank, etc.)
- `account_adjustments` — signed manual balance corrections (reconciliation)
- `goals` — named target with funding mode, optional deadline
- `goal_contributions` — funding history for manual / deposit_pct goals
- `email_preferences` — per-user toggles + unsubscribe token
- `announcements` — feature-news posts (service-role authored)
- `notifications` — in-app notification feed
- `email_log` — idempotency + audit for outbound email

### New / changed views

- `account_balances` — computed balance per account
- `goal_progress` — computed current amount per goal (bucket / account / contributions)

### New columns

- `transactions.account_id uuid null → accounts(id) on delete set null`

### Dropped columns

- `allocation_settings.{savings_goal,invest_goal,pay_goal,expenses_goal}` (after data migration)

---

## WAVE 1 — Backend foundation

One worker subagent. Everything in this wave is DB + edge functions + shared types/helpers.
No UI. After this wave the app frontend will not fully build until Waves 2–3 land — that is
expected; the verifier checks migrations + functions + helper tests, not the running SPA.

### 1.1 Accounts schema *(all Wave-1 + Wave-4 SQL shipped as one file: `supabase/migrations/20260903000000_accounts_goals_email.sql`, idempotent)*

```sql
create type public.account_kind as enum ('platform','bank','mpesa','cash','other');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.account_kind not null default 'other',
  institution text,
  provider_slug text,                                   -- 'lexinon','toefl',... (future sync)
  route_kind text check (route_kind in ('ops','costs')),-- future sync
  opening_balance numeric(14,2) not null default 0,
  opening_balance_at timestamptz not null default now(),
  is_default boolean not null default false,            -- receives Paystack/webhook income
  archived boolean not null default false,
  color text,
  notes text,
  sync_config jsonb not null default '{}'::jsonb,       -- future: {endpoint, auth_ref,...}
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index accounts_user_idx on public.accounts(user_id, archived);
create unique index accounts_one_default_idx on public.accounts(user_id) where is_default;

alter table public.accounts enable row level security;
create policy "own accounts select" on public.accounts for select using (auth.uid() = user_id);
create policy "own accounts insert" on public.accounts for insert with check (auth.uid() = user_id);
create policy "own accounts update" on public.accounts for update using (auth.uid() = user_id);
create policy "own accounts delete" on public.accounts for delete using (auth.uid() = user_id);

alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists transactions_account_idx
  on public.transactions(account_id) where account_id is not null;

create table public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete cascade,
  to_account_id   uuid not null references public.accounts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  fee    numeric(14,2) not null default 0 check (fee >= 0),
  note text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint different_accounts check (from_account_id <> to_account_id)
);
create index account_transfers_user_idx on public.account_transfers(user_id, occurred_at desc);
alter table public.account_transfers enable row level security;
create policy "own transfers select" on public.account_transfers for select using (auth.uid() = user_id);
create policy "own transfers insert" on public.account_transfers for insert with check (auth.uid() = user_id);
create policy "own transfers update" on public.account_transfers for update using (auth.uid() = user_id);
create policy "own transfers delete" on public.account_transfers for delete using (auth.uid() = user_id);

create table public.account_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(14,2) not null,        -- signed
  reason text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index account_adjustments_idx on public.account_adjustments(user_id, account_id);
alter table public.account_adjustments enable row level security;
create policy "own adj select" on public.account_adjustments for select using (auth.uid() = user_id);
create policy "own adj insert" on public.account_adjustments for insert with check (auth.uid() = user_id);
create policy "own adj update" on public.account_adjustments for update using (auth.uid() = user_id);
create policy "own adj delete" on public.account_adjustments for delete using (auth.uid() = user_id);

create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id      as account_id,
  a.user_id as user_id,
  a.opening_balance
    + coalesce(t.net, 0) + coalesce(xf.net, 0) + coalesce(adj.net, 0) as balance,
  coalesce(t.inflow, 0)  as inflow,
  coalesce(t.outflow, 0) as outflow,
  a.last_synced_at
from public.accounts a
left join lateral (
  select
    coalesce(sum(amount) filter (
      where type = 'income' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as inflow,
    coalesce(sum(amount) filter (
      where type = 'expense' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as outflow,
    coalesce(sum(amount) filter (
      where type = 'income' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0)
    - coalesce(sum(amount) filter (
      where type = 'expense' and parent_id is null and coalesce(category,'') <> 'Transfer'), 0) as net
  from public.transactions where account_id = a.id
) t on true
left join lateral (
  select
    coalesce(sum(amount)       filter (where to_account_id   = a.id), 0)
  - coalesce(sum(amount + fee) filter (where from_account_id = a.id), 0) as net
  from public.account_transfers where from_account_id = a.id or to_account_id = a.id
) xf on true
left join lateral (
  select coalesce(sum(amount), 0) as net
  from public.account_adjustments where account_id = a.id
) adj on true;

grant select on public.account_balances to authenticated;
```

**Acceptance:** RLS on all 3 new tables; view uses `security_invoker`; only `parent_id is null`
rows count toward account balance (no double-count of split children); `category = 'Transfer'`
(bucket transfers) excluded from account math; one-default partial unique index works.

### 1.2 Goals schema *(shipped consolidated in `20260903000000_accounts_goals_email.sql`)*

```sql
create type public.goal_status  as enum ('active','achieved','paused','archived');
create type public.goal_funding as enum ('bucket','account','manual','deposit_pct');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  status  public.goal_status  not null default 'active',
  funding public.goal_funding not null default 'manual',
  bucket public.bucket,
  account_id uuid references public.accounts(id) on delete set null,
  deposit_pct numeric(5,2) check (deposit_pct is null or (deposit_pct > 0 and deposit_pct <= 100)),
  sort_order int not null default 0,
  notes text,
  created_at  timestamptz not null default now(),
  achieved_at timestamptz,
  constraint funding_bucket_ck  check (funding <> 'bucket'      or bucket is not null),
  constraint funding_account_ck check (funding <> 'account'     or account_id is not null),
  constraint funding_pct_ck     check (funding <> 'deposit_pct' or deposit_pct is not null)
);
create index goals_user_idx on public.goals(user_id, status, sort_order);
alter table public.goals enable row level security;
create policy "own goals all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  note text,
  auto boolean not null default false,
  transaction_id uuid references public.transactions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index goal_contributions_idx on public.goal_contributions(goal_id, occurred_at desc);
alter table public.goal_contributions enable row level security;
create policy "own gc all" on public.goal_contributions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace view public.goal_progress
with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  case g.funding
    when 'bucket'  then coalesce((select bb.balance from public.bucket_balances bb
                                  where bb.user_id = g.user_id and bb.bucket = g.bucket), 0)
    when 'account' then coalesce((select ab.balance from public.account_balances ab
                                  where ab.account_id = g.account_id), 0)
    else coalesce((select sum(amount) from public.goal_contributions gc where gc.goal_id = g.id), 0)
  end as current_amount,
  g.target_amount,
  (select count(*)          from public.goal_contributions gc where gc.goal_id = g.id) as contribution_count,
  (select max(occurred_at)  from public.goal_contributions gc where gc.goal_id = g.id) as last_contribution_at
from public.goals g;
grant select on public.goal_progress to authenticated;

-- migrate existing per-bucket goals, then drop the columns
insert into public.goals (user_id, name, target_amount, funding, bucket)
select user_id,
  case bucket when 'S' then 'Savings target' when 'I' then 'Investment target'
              when 'P' then 'Pay-yourself target' else 'Expenses target' end,
  amt, 'bucket', bucket
from (
  select user_id, 'S'::public.bucket as bucket, savings_goal   as amt from public.allocation_settings where savings_goal   > 0
  union all select user_id, 'I', invest_goal   from public.allocation_settings where invest_goal   > 0
  union all select user_id, 'P', pay_goal      from public.allocation_settings where pay_goal      > 0
  union all select user_id, 'E', expenses_goal from public.allocation_settings where expenses_goal > 0
) src;

alter table public.allocation_settings
  drop column savings_goal, drop column invest_goal,
  drop column pay_goal,     drop column expenses_goal;
```

**Acceptance:** funding check constraints hold; `goal_progress` resolves all four funding
modes; migration moves non-null/positive goals then drops columns; re-running `supabase db
reset` is clean.

### 1.3 Email/notifications schema *(shipped consolidated in `20260903000000_accounts_goals_email.sql`)*

- `email_preferences` (PK user_id; `weekly_review, tips, announcements, goal_updates` bool
  default true; `unsubscribe_token uuid default gen_random_uuid()`; RLS own-row all).
- `announcements` (`title, body_md, cta_label, cta_url, published_at, created_at`); RLS: SELECT
  only where `published_at is not null and published_at <= now()`; no write policy (service role).
- `notifications` (`user_id, kind, title, body, link, ref_id, read_at, created_at`); RLS: own
  SELECT + own UPDATE (for read_at); INSERT via service role only.
- `email_log` (`user_id, kind, ref_id, resend_id, status, sent_at`; `unique(user_id, kind, ref_id)`);
  no policies (service role only).
- Extend `public.handle_new_user()` to also `insert into public.email_preferences (user_id)
  values (new.id);` — keep existing profile + allocation_settings inserts.
- Backfill: `insert into public.email_preferences (user_id) select id from auth.users
  on conflict (user_id) do nothing;`

**Acceptance:** trigger still creates profile + allocation_settings + email_preferences on
signup; announcements not readable before publish; email_log unique constraint present.

### 1.4 Shared Deno utils — `supabase/functions/_shared/`

- `kes.ts` — `formatKES(n)` (0 decimals, matches weekly-review).
- `week.ts` — the Mon–Sun boundary math currently inlined in weekly-review.
- `email.ts` — `sendEmail({to, subject, html, from?})` wrapping the Resend POST + returning
  `{ok, id, error}`; shared HTML shell (header/footer + unsubscribe line).
- `tips.ts` — array of ~20 short money-management tips (title + body), plus `tipForWeek(date)`
  that rotates deterministically.

### 1.5 Edge function changes

- **`record-deposit`**: accept optional `account_id` (string). Validate it belongs to the user
  (`accounts` lookup with `user_id`). Put it on the parent row AND every child row. After the
  split, load `goals` where `user_id` + `status='active'` + `funding='deposit_pct'`; for each,
  insert a `goal_contributions` row (`amount = round(depositTotal * deposit_pct / 100, 2)`,
  `auto=true`, `transaction_id = parent.id`).
- **`paystack-webhook`**: after creating the parent, set `account_id` to the user's default
  account (`accounts` where `user_id=uid and is_default` — may be null, that's fine). Apply
  the same `deposit_pct` goal-contribution logic. Set `account_id` on child rows too.
- **`weekly-review`** (existing single-user button): refactor to use `_shared`. Add to the
  email (a) a **Goals** section (name, % of target, on-track/behind if `target_date` set),
  (b) one rotating **tip**, (c) an **unsubscribe** link using the user's token. Still respects
  nothing extra — it is user-initiated.
- **NEW `weekly-review-batch`** (`supabase/functions/weekly-review-batch/index.ts`,
  `--no-verify-jwt`): guarded by `x-cron-secret` header == `CRON_SECRET` env. Loops users with
  `email_preferences.weekly_review = true`; builds the same email via shared builder; skips if
  `email_log` already has `(user_id,'weekly_review', <week-start-date-as-uuid-or-null>)` —
  use `kind='weekly_review'`, `ref_id = null`, and instead check `sent_at >= thisMonday`; sends;
  writes `email_log`. Also inserts a `notifications` row for any goal that crossed a milestone
  or went behind (`kind='goal_behind'`/`'goal_milestone'`) — keep this best-effort.
- **NEW `send-announcement`** (`supabase/functions/send-announcement/index.ts`, JWT required):
  admin-only — caller's `user.email` must be in `ADMIN_EMAILS` env (comma-separated). Body:
  `{ announcement_id }`. If `published_at` is null, set it to `now()`. Loop users with
  `email_preferences.announcements = true`, dedupe via `email_log (user_id,'announcement',id)`,
  send email (render `body_md` → simple HTML), insert a `notifications` row
  (`kind='announcement'`, `link` = cta_url or '/whats-new', `ref_id = announcement_id`).
- **NEW `sync-account` STUB** (`supabase/functions/sync-account/index.ts`, JWT required):
  Body `{ account_id }`. Loads the account, switches on `provider_slug`, and returns
  `{ error: "No sync adapter configured for this provider", provider_slug }` with 501.
  Include a top-of-file doc block describing the adapter interface:
  `interface SyncAdapter { fetchBalance(cfg): Promise<{ balance: number; as_of: string }>;
  fetchMovements?(cfg, since): Promise<Movement[]> }` and a `const ADAPTERS: Record<string,
  SyncAdapter> = {}` placeholder. This is the ONLY ops/costs work in scope.

### 1.6 Frontend types + helpers (no components yet)

- `src/integrations/supabase/types.ts`: add `Account`, `AccountKind`, `AccountTransfer`,
  `AccountAdjustment`, `AccountBalance`, `Goal`, `GoalStatus`, `GoalFunding`, `GoalContribution`,
  `GoalProgress`, `EmailPreferences`, `Announcement`, `AppNotification`. **Remove** the four
  `*_goal` fields from `AllocationSettings`.
- `src/lib/accounts.ts` — `reconcileDiff(accountsTotal, bucketsTotal)`, `isStale(account,
  lastTxnAt, now)` (platform/bank with no sync + no activity > 14d → true), `groupByKind()`,
  `KIND_META` (label, icon name, order).
- `src/lib/goals.ts` — `pct(current, target)`, `projectCompletion(contributions, target,
  current, now)` → `{ perWeek, weeksLeft, projectedDate } | null`, `onTrack(projectedDate,
  targetDate)` → `'on_track' | 'behind' | 'no_date'`, milestone helper (`crossedMilestone(prevPct,
  pct)` → 25/50/75/100 or null).
- `src/lib/splits.ts` — `splitDeposit(amount, pcts)` and `depositPctContribution(amount, pct)`
  pure fns (mirror the edge-function math so it is unit-testable).

### 1.7 Helper tests (`src/lib/*.test.ts`)

`accounts.test.ts`, `goals.test.ts`, `splits.test.ts` — cover reconciliation sign, stale
thresholds, projection math (rate → date), milestone crossing, split rounding (last bucket
absorbs remainder).

### WAVE 1 acceptance (orchestrator judgement)

- [ ] `npx supabase db reset` runs clean (or, if Docker unavailable in the sandbox, SQL is
      reviewed line-by-line and `npx supabase db lint` passes).
- [ ] Every new table has RLS enabled with correct policies.
- [ ] `npm run test` green (helper tests + existing).
- [ ] `npm run lint` clean on changed files.
- [ ] `npm run build` — **may fail** on Dashboard/Settings referencing dropped `*_goal`
      fields; that is acceptable for this wave IF the failure is *only* those known refs.
      List them for Wave 3.
- [ ] `record-deposit` / `paystack-webhook` still work for the no-account case (account_id
      optional / null default account).
- [ ] `sync-account` returns 501 with the documented shape; no real adapter code.

---

## WAVE 2 — Accounts frontend

One worker subagent. Depends on Wave 1.

- **Nav** (`AppShell.tsx`): add `Accounts` (Wallet icon) and `Goals` (Target icon). Final
  order: Dashboard · Accounts · Transactions · Analytics · Goals · Debts · Settings. Update
  the mobile header list too.
- **`src/App.tsx`**: routes `/accounts` and `/goals` inside the protected `AppShell` block.
- **`src/pages/Accounts.tsx`**:
  - Fetch `accounts`, `account_balances`, recent `account_transfers`, and the bucket total
    (`bucket_balances`).
  - Header: **total cash** across non-archived accounts + a reconciliation chip:
    `Accounts {Σ} · Buckets {Σ} · diff {Δ}`; if `|Δ| > 1` show "Reconcile" → opens adjust modal.
  - Accounts grouped by `kind` (Platform · Bank · Mobile money · Cash · Other), each card:
    name, institution, balance, last activity date, **stale badge**, **default badge**.
  - Row/toolbar actions: New account · Edit · Record transfer · Adjust balance · Archive.
  - Empty state.
- **Modals** in `src/components/app/`:
  - `AccountModal.tsx` — create/edit (name, kind, institution, provider_slug, route_kind,
    opening_balance + date, is_default, color, notes). Setting `is_default` clears it elsewhere
    (do it client-side: update the previously-default row to false in the same save).
  - `AccountTransferModal.tsx` — from/to account, amount, fee, note, date → insert
    `account_transfers`.
  - `AdjustBalanceModal.tsx` — account, "actual balance is …" → compute signed delta vs current
    `account_balances.balance`, insert `account_adjustments`.
- **Deposit / expense / edit-transaction modals**: add an optional **Account** `<select>`
  (fetch `accounts`, default to `is_default`). `DepositModal` sends `account_id` to
  `record-deposit`; `AddExpenseModal` writes `account_id` on insert (parent + children);
  `EditTransactionModal` allows changing it.
- **Dashboard**: add a compact **"Cash by location"** block (top ~4 accounts by balance +
  total, link to `/accounts`) and the same reconciliation chip.

### WAVE 2 acceptance

- [ ] `npm run build` + `npm run lint` + `npm run test` all green.
- [ ] Creating accounts of each kind, a transfer, and an adjustment all persist and the
      displayed balances match hand-computed values.
- [ ] Recording a deposit with an account selected tags the parent + children (verify via
      Transactions/DB).
- [ ] Reconciliation chip math correct (accounts Σ vs buckets Σ).
- [ ] Only one default account can exist per user.

---

## WAVE 3 — Goals frontend + cleanup

One worker subagent. Depends on Wave 1.

- **`src/pages/Goals.tsx`**:
  - Fetch `goals` + `goal_progress` + (for projection) recent `goal_contributions`.
  - Status filter: Active · Achieved · All.
  - Goal card: emoji, name, progress ring/bar + `current / target`, target date,
    **projection line** (`projectCompletion` from `src/lib/goals.ts`) → "On track — ~Apr 2026"
    / "Behind by ~3 weeks" / "Add contributions to see a projection".
  - Actions: New · Edit · Add contribution (manual + deposit_pct only) · Mark achieved ·
    Pause · Archive · Delete. Marking achieved sets `status='achieved'`, `achieved_at=now()`.
  - Achieved cards get a celebratory treatment.
- **Modals**: `GoalModal.tsx` (name, emoji, color, target, date, funding mode + the
  conditional field: bucket picker / account picker / deposit_pct), `GoalContributionModal.tsx`.
- **Dashboard bucket cards**: the mini goal bar now reads from `goals` (funding `'bucket'`) +
  `goal_progress` instead of the removed `allocation_settings.*_goal`. If a bucket has no goal,
  no bar.
- **Settings**: delete the "Savings goals" section from the allocation tab; leave a one-line
  "Goals moved to their own tab →" link. Fix the `select(...)` that referenced `*_goal`.
- **`types.ts` / any remaining refs**: clear every reference to the dropped columns.

### WAVE 3 acceptance

- [ ] `npm run build` now fully green (the Wave 1 known-failures are resolved here).
- [ ] `npm run lint` + `npm run test` green.
- [ ] Migrated bucket goals appear on `/goals` and still drive the Dashboard bucket bars.
- [ ] Each funding mode creates a valid goal and shows correct progress.
- [ ] Projection math matches `src/lib/goals.ts` unit tests on a worked example.

---

## WAVE 4 — Email & notifications surface

One worker subagent. Depends on Waves 1–3.

- **Settings → new "Email" tab**: toggles bound to `email_preferences`
  (weekly review · tips · announcements · goal updates); move the existing "send weekly
  review now" test button here.
- **`src/components/app/NotificationsBell.tsx`**: bell in the sidebar footer + mobile header,
  unread count from `notifications where read_at is null`; dropdown list; clicking an item
  marks it read and navigates to `link`.
- **`src/components/app/WhatsNew.tsx`**: on app load fetch the latest published `announcement`;
  if its id differs from `localStorage["sipe:lastSeenAnnouncement"]`, show a dismissible
  modal rendering `body_md` + optional CTA. Dismiss stores the id.
- **`src/pages/WhatsNew.tsx`** (route `/whats-new`): simple list of published announcements.
- **Functions**: finalise `weekly-review-batch`, `send-announcement` from Wave 1.5 (Wave 1
  scaffolds them; Wave 4 confirms the emails render and the notification rows are written).
- **`CLAUDE.md`**: document the new functions + `CRON_SECRET` / `ADMIN_EMAILS` secrets +
  deploy commands + the pg_cron steps (Appendix A below).

### WAVE 4 acceptance

- [ ] `npm run build` + `npm run lint` + `npm run test` green.
- [ ] Toggling an email preference persists.
- [ ] `weekly-review-batch` with the cron secret sends to opted-in users only and is
      idempotent within a week (verified by re-invoking — second run sends nothing).
- [ ] `send-announcement` rejects non-admins, publishes, emails opted-in users once, and
      writes one `notifications` row per recipient.
- [ ] Bell shows unread count and clears on read; "What's new" shows once per announcement.

---

## WAVE 5 — Full verification

One verifier subagent + orchestrator sign-off.

- Fresh `npx supabase db reset` (or reviewed) + `npm ci && npm run build && npm run lint &&
  npm run test`.
- Click-through (or code-trace) of: add account → deposit into it → transfer out → reconcile;
  create a goal each funding mode → contribute → mark achieved; toggle email prefs → trigger
  batch → confirm log.
- Confirm PROGRESS.md "Backlog" has the ops/costs integration with enough detail to start cold.
- Orchestrator updates PROGRESS.md (checklist + "Done" log), then asks the user about committing.

---

## Out of scope (tracked in PROGRESS.md → "Backlog")

- Real ops/costs API adapters / credential vault / polling schedule.
- Multi-currency (still KES-only).
- Shared/team accounts.
- Push/SMS notifications (in-app + email only).

---

## Appendix A — Deployment (run by hand)

Project ref: `drtbrleydafwietdhlng`

### 1. Schema

One file: **`supabase/migrations/20260903000000_accounts_goals_email.sql`**. Idempotent —
paste it into the Supabase dashboard → SQL Editor → Run (or `psql "$DATABASE_URL" -f` it).
Re-running is a no-op. That's the whole schema change; there is nothing else to apply.

### 2. Secrets

```bash
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)                # keep this value for step 4
npx supabase secrets set ADMIN_EMAILS=njugunabriian.dev@gmail.com          # sole gate for the /admin function; no client config
# RESEND_API_KEY / PAYSTACK_SECRET_KEY should already be set — check: npx supabase secrets list
```

### 3. Edge functions

```bash
npx supabase functions deploy record-deposit        --no-verify-jwt   # changed: account_id + deposit_pct goals
npx supabase functions deploy paystack-webhook      --no-verify-jwt   # changed: default-account tagging
npx supabase functions deploy weekly-review         --no-verify-jwt   # changed: goals + tip + unsubscribe + RPC
npx supabase functions deploy weekly-review-batch   --no-verify-jwt   # new
npx supabase functions deploy unsubscribe           --no-verify-jwt   # new
npx supabase functions deploy admin                                   # new (JWT) — /admin dashboard + email
npx supabase functions deploy sync-account                            # new (JWT, 501 stub)
# create-payment-link is unchanged — no redeploy needed
```

### 4. Weekly-email cron (pg_cron + pg_net)

```sql
-- SQL editor
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-review-batch',
  '0 6 * * 1',                        -- Mondays 06:00 UTC
  $$
  select net.http_post(
    url     := 'https://drtbrleydafwietdhlng.supabase.co/functions/v1/weekly-review-batch',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

Check: `select * from cron.job;` / `select * from cron.job_run_details order by start_time desc limit 5;`
Remove: `select cron.unschedule('weekly-review-batch');`
Manual test:
```bash
curl -X POST 'https://drtbrleydafwietdhlng.supabase.co/functions/v1/weekly-review-batch' \
  -H 'x-cron-secret: <CRON_SECRET>'
```
(idempotent within a calendar week — a second call the same week sends nothing).
