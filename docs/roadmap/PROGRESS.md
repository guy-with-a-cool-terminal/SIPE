# PROGRESS

The one file to update as work lands. Spec lives in [PLAN.md](./PLAN.md).
Rhythm: worker subagent builds → verifier subagent checks → orchestrator judges → tick here.

Legend: ⬜ not started · 🔨 in progress · 🔍 verifying · ✅ done (orchestrator-judged)

## Wave 1 — Backend foundation  ✅
- ✅ migrations: accounts / goals / email+notifications (+ account_balances, goal_progress views; drop *_goal columns)
- ✅ `_shared/` Deno utils (kes, week, email, tips, weekly-review builder)
- ✅ edge fns: record-deposit + paystack-webhook (account_id, deposit_pct goals); weekly-review refactor; weekly-review-batch; send-announcement; sync-account stub
- ✅ types.ts additions + remove *_goal; src/lib/{accounts,goals,splits}.ts + 22 tests
- ✅ independent verification: PASS (migrations applied clean via psql; 200k-trial split-math equivalence; RLS on all 9 tables; sync-account confirmed stub-only; no Wave 2-5 scope creep)

### Wave 1 deviations from PLAN (all judged sound)
1. `splitDeposit()` helper drives the split in both deposit fns (last active bucket absorbs the rounding remainder) — children now sum exactly to parent; lib + edge code proven identical.
2. UPDATE policies on accounts/transfers/adjustments got `WITH CHECK` (PLAN had `using` only) — stronger.
3. Added `_shared/weekly-review.ts` (shared email builder) beyond PLAN's list of 4 shared files.
4. Single-user `weekly-review` also writes an `email_log` row.
5. Unsubscribe link points at `/unsubscribe?token=…` — that route/endpoint is a Wave 4 task.

### Carried into later waves
- **Wave 3:** `Settings.tsx` (4 `*_goal` refs, save(), "Savings goals" section) + `Dashboard.tsx` (`.select` of `*_goal`, goal-bar reads) still reference dropped columns.
- **Wave 4:** `bucket_balances` filters on `auth.uid()` → service-role batch email can't read bucket balances (pre-existing bug in `weekly-review` too). Needs a service-role-safe variant / SECURITY DEFINER fn. — ✅ done Wave 4 (`user_bucket_balances(uuid)`).
- **Wave 4:** failed email sends write a `status='failed'` `email_log` row that suppresses retry until next period — revisit. — ✅ done Wave 4 (batch filters `status='sent'`; announcement skips the dedupe row on failure).
- **Backlog/known:** very small deposits can still round a bucket child to `0.00` and hit `transactions.amount > 0` — pre-existing, not introduced here.

## Wave 2 — Accounts frontend  ✅
- ✅ nav (both links) + routes; /goals stubbed as "Coming in Wave 3" placeholder page
- ✅ /accounts page (grouped by kind, reconcile chip, stale/default badges, archived section, recent transfers)
- ✅ AccountModal / AccountTransferModal / AdjustBalanceModal
- ✅ account picker in Deposit / AddExpense / EditTransaction modals (defaults to is_default, null allowed)
- ✅ Dashboard "cash by location" + reconciliation chip
- ✅ independent verification: PASS — all 4 gates green, no new lint/tsc, default-clear logic respects the partial unique index, reconcile math consistent Accounts↔Dashboard, RLS payloads carry user_id, no Wave 3/4 scope creep

### Wave 2 deviations from PLAN (all judged sound)
1. `Transaction.account_id` field added to types.ts (Wave 1 added the column, not the field).
2. Dashboard `*_goal` removed from the one `allocation_settings.select()` + `setGoals({})` — goal bars vanish cleanly until Wave 3; limits restored (select had been 400ing entirely).
3. EditTransactionModal propagates `account_id` to child rows (scoped by parent_id, on value-change only) — cosmetic; view counts only parent rows.
4. Accounts page extras: collapsible archived section w/ restore, recent-transfers list.

### Carried into later waves
- **Wave 3:** repopulate Dashboard `goals` state from `goals`(funding='bucket') + `goal_progress` to restore bucket goal bars.
- **Wave 4 / polish:** AccountModal has no rollback if the row write fails *after* the default-clear succeeds → user silently loses their default flag. Consider a `before insert/update` trigger on `accounts` to enforce single-default server-side instead of client-side clearing. — ✅ done Wave 4 (`accounts_single_default` trigger; client-side clear now redundant but harmless).
- Mobile header now 7 nav items in a row — proper mobile menu eventually.

## Wave 3 — Goals frontend + cleanup  ✅
- ✅ /goals page (status filter, progress bars, projection line via src/lib/goals.ts, achieved treatment)
- ✅ GoalModal (funding-conditional field, DB constraints enforced client-side, mode locked on edit) / GoalContributionModal
- ✅ Dashboard bucket goal bars restored (query goals funding='bucket' → bucket→target map)
- ✅ Settings "Savings goals" section + all supporting code removed; Link to /goals added; grep confirms 0 *_goal refs in src/
- ✅ tsc down to the 2 pre-existing Analytics 'month' errors only; build + lint + 23 tests green
- ✅ independent verification: PASS — tsc down to the 2 pre-existing Analytics errors, all DB constraints mirrored client-side, RLS payloads carry user_id, Dashboard bars restored, no scope creep

### Wave 3 deviations (judged sound)
- Projection hint for bucket/account-funded goals reads "Tracks your {bucket} bucket" / "Tracks {account}" (those modes have no contributions, so the literal "add contributions" hint would mislead). manual/deposit_pct get the exact PLAN text.
- GoalModal locks the funding-mode select on edit (changing it strands contributions / breaks goal_progress).

### Wave 3 follow-up (user feedback)
- `goals.emoji` → `goals.icon` (stores a lucide icon name). No emoji anywhere in the app now — `src/lib/goalIcons.ts` is the curated set; GoalModal has an icon-grid picker, achieved badge uses `Trophy`.
- Added a **Paused** filter tab (shows when >0) so paused goals are reachable to resume; filter auto-falls-back to Active if its tab empties. Pause toast now says where to find it.
- Bigger goal-card icons: header tile 44px w/ 22px glyph, action buttons 18px glyph in a 36px hit-area.
- Goals page: aggregate "Across N goals in progress" card — total target / saved / still-to-save + overall % bar (active + paused goals).

### Round 2 (user feedback): branding + dedicated /admin
- **New logo** — `~/Downloads/logo.png` processed to transparent PNG → `public/logo.png` + `favicon.png` + `apple-touch-icon.png`; replaced the "S" text mark in Nav / Footer / AppShell / AuthLayout. `index.html` meta rewritten (proper description + og/twitter tags, no em-dashes).
- **No em-dashes** in site/landing/meta copy (Hero, Story, Footer, index.html) and the goal/settings strings touched this round.
- **Dedicated `/admin` section** (not mixed into Settings): `src/pages/Admin.tsx`, redirects non-admins. Admin status comes only from the server — `useAdmin()` (`src/lib/admin.ts`) calls the `admin` function's `whoami` action (react-query cached); nothing admin-related is in the client bundle. Sidebar "Admin" link for admins only. Tabs: Overview (counts) + Email.
- **`admin` edge function** replaces `send-announcement` (deleted; never deployed). Actions: `overview`, `feed`, `send` (`audience: all|user`, optional `post_to_feed` → publishes to `/whats-new` + notification). JWT + `ADMIN_EMAILS` gate.
- **Email templates** — `src/lib/emailTemplates.ts` (blank / feature / maintenance / onboarding / re-engagement). Composer picks a template, picks recipients (all subscribers or one user by email), edits Markdown, previews, sends. Send is confirmed via a real `ConfirmDialog` (`src/components/app/ConfirmDialog.tsx`, shadcn AlertDialog) — no `window.confirm`.
- **Email branding** — `_shared/email.ts` `emailShell` rebuilt: dark navy chrome matching the app, SIPE logo in the header, brand-blue (`#38bdf8` / `#0284c7`) links + CTA (`emailButton` helper) instead of the old generic purple/indigo. `weekly-review` body, `admin` Markdown, and the `unsubscribe` page all moved onto the shared `EMAIL` palette; the stale `goals.emoji` reference in the weekly email is gone. Bulk sends carry a per-recipient unsubscribe link.
- **Admin users** — `admin` function `users` action (profiles + email prefs). `/admin` gets a **Users** tab (searchable table: email, name, joined, news on/off). The Email composer's "one user" field is now a searchable `UserPicker` dropdown, not a raw text input (still accepts a typed address as fallback). Shared `adminCall` + `useAdmin`/`useAdminUsers` hooks in `src/lib/admin.ts`.

## Wave 4 — Email & notifications surface  ✅
- ✅ `user_bucket_balances(uuid)` SECURITY DEFINER fn (mirrors `bucket_balances` math, verified equal via psql) + `accounts_single_default` BEFORE trigger (Wave 2 polish, carried) — folded into the single migration file
- ✅ `_shared/weekly-review.ts` + `weekly-review` + `weekly-review-batch`: bucket balances now read via `.rpc("user_bucket_balances")` not `.from("bucket_balances")`; bucket-funded goal `current_amount` also falls back to the RPC balance (goal_progress bucket branch is empty under service role)
- ✅ `_shared/goals.ts` — Deno port of `crossedMilestone` / `highestMilestone` (+ used in the batch milestone detection)
- ✅ NEW `supabase/functions/unsubscribe/index.ts` (`--no-verify-jwt`) — token-only GET/POST; styled per-list preference page; `_shared/email.ts` `unsubscribeUrl()` now points at this function
- ✅ `send-announcement` verified; tidied so a failed send no longer writes a dedupe `email_log` row (was blocking retry forever)
- ✅ `weekly-review-batch` idempotency check now filters `status = 'sent'` (a `failed` row no longer suppresses the week); goal notifications gated on `email_preferences.goal_updates`
- ✅ Settings `Email` tab — 4 toggles bound to `email_preferences` (load on mount, upsert-on-change, optimistic + revert); "Send weekly summary now" test button moved here from the Allocation tab; disabled email input on Profile left as-is (read-only, already shows the real address)
- ✅ `NotificationsBell` — sidebar footer (expanded + collapsed) + mobile header; unread count via head/count query; 15-item dropdown; click → mark read + navigate; "Mark all read"; polls on mount, on open, every 60s
- ✅ `WhatsNew` modal (mounted in AppShell) — latest published announcement vs `localStorage["sipe:lastSeenAnnouncement"]`; `src/lib/markdown.ts` (`renderMarkdown`, 7 tests) + `components/app/Markdown.tsx` render helper
- ✅ `src/pages/WhatsNew.tsx` + `/whats-new` protected route — full published list, newest first; visiting it also stamps lastSeen
- ✅ CLAUDE.md — edge-fn table (all 8 fns), deploy commands, `CRON_SECRET` / `ADMIN_EMAILS` secrets, "Email automation" subsection → PLAN Appendix A
- ✅ gates: 30 tests (23 + 7 markdown) · lint unchanged (8 err / 13 warn baseline) · tsc still exactly the 2 Analytics `month` errors · build green · all 13 migrations apply clean on postgres:15 via psql

### Wave 4 deviations from PLAN (need orchestrator judgement)
1. **Bucket-funded goal amounts in the batch email**: PLAN scoped Wave 4 to "the bucket-balance RPC swap" only. `goal_progress`'s bucket branch also depends on `bucket_balances` (empty under service role), so bucket-funded goals would email at 0%. Fixed inside `buildWeeklyReview` (fetch `funding,bucket`; use RPC balance for `funding='bucket'`) rather than touching the `goal_progress` view — keeps Wave 3 behaviour untouched. Account-funded goals are correct already (`account_balances` has no `auth.uid()` filter).
2. **`accounts_single_default` trigger** included (PLAN marked it optional / "only if low-risk"). BEFORE INSERT/UPDATE OF is_default, `WHEN (new.is_default)` guard prevents recursion; verified against the partial unique index.
3. **`unsubscribe` is an edge function, not an app route** (PROGRESS Wave 1 dev #5 left it open). `_shared/email.ts` `unsubscribeUrl()` switched from `${APP_URL}/unsubscribe` to `${SUPABASE_URL}/functions/v1/unsubscribe`.
4. **`send-announcement` / `weekly-review-batch` failure handling** tightened (see above) — resolves the PROGRESS "failed send suppresses retry" carry.
5. Settings Profile email input left as a disabled read-only field (already bound to `user.email`) rather than removed — PLAN said "remove or wire to the real address"; it is already the real address.

### Carried into Wave 5 / later
- `weekly-review-batch` goal-notification milestone detection is still "highest milestone reached this week" (best-effort), not true prev→cur crossing — `crossedMilestone()` needs a pre-week baseline the email builder doesn't fetch. `_shared/goals.ts` exports the real fn for when that baseline is added.
- ~~No announcement-authoring UI~~ — done in Round 2: the `/admin` → Email composer.
- Deno functions not type-checked locally (no `deno` binary in sandbox) — reviewed by hand, same as Wave 1.
- Mobile header now 8 items incl. the bell — the "proper mobile menu" debt grows.

## Wave 5 — Full verification  ✅
- ✅ Wave 4 verification: PASS (all gates; migrations + fn + trigger checked against real Postgres; markdown XSS-safe; scope clean)
- ✅ whole-system pass: `npm ci` → build/lint/test all green from clean; all 13 migrations apply from scratch; 7/7 end-to-end flows trace intact; changed-file inventory all in-scope
- ✅ orchestrator: removed the now-redundant client-side default-clear in AccountModal (trigger handles it) — tsc/build re-checked green
- ✅ Backlog has enough detail to start ops/costs cold
- **Verdict: SHIP (Waves 1–4 as a unit)**
- ✅ committed: branch `feat/accounts-goals-email` (single commit, 47 files)

---

## Done log
- 2026-09-03 · Wave 1 (backend foundation) · orchestrator sign-off · **uncommitted** (holding until build+tsc green after Wave 3)
- 2026-09-03 · Wave 2 (accounts frontend) · orchestrator sign-off · **uncommitted**
- 2026-09-03 · Wave 3 (goals frontend + cleanup) · orchestrator sign-off · **uncommitted**
- 2026-09-03 · Wave 4 (email & notifications) · orchestrator sign-off · **uncommitted**
- 2026-09-03 · Wave 5 (full verification) · SHIP verdict · committed to `feat/accounts-goals-email`.
  **Not deployed** — deploy runbook: PLAN.md Appendix A. All SQL is one idempotent file,
  `supabase/migrations/20260903000000_accounts_goals_email.sql`, validated on postgres:16
  (applies clean + re-runs no-op; goals migrate; `*_goal` columns drop; `user_bucket_balances`
  + single-default trigger verified). Project ref `drtbrleydafwietdhlng`.

---

## Design system & responsive pass — in progress (started 2026-09-08)

Spec: [../design/DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md),
[../design/AVOIDING_AI_VIBES.md](../design/AVOIDING_AI_VIBES.md),
[../design/RESPONSIVE.md](../design/RESPONSIVE.md).

- ✅ Three design docs written (system, anti-AI-slop / production checklist, responsive contract).
- ✅ Foundations: `viewport-fit=cover`; global 16px mobile input rule + `prefers-reduced-motion`
  + `focus-visible` ring in `index.css`; `PageContainer` + `PageHeader` primitives.
- ✅ Mobile nav rebuilt in `AppShell`: sticky top bar + fixed bottom tab bar (Dashboard,
  Accounts, Transactions, Analytics) + "More" bottom sheet (Goals, Debts, Settings, Admin,
  Sign out). Replaces the inline-links header that overflowed below ~600px.
- ✅ `ResponsiveModal` (vaul drawer < md, Radix dialog ≥ md). Migrated all 10 hand-rolled
  overlays: Deposit, AddExpense, EditTransaction, Goal, GoalContribution, Account,
  AccountTransfer, AdjustBalance, Transfer (bucket), WhatsNew, + the inline Links modal.
- ✅ Page roots → responsive container (`px-4` floor, `max-w-[1400px]`, bottom-nav clearance).
- ✅ `h1` normalised to `text-2xl sm:text-3xl` across every page (was `text-xl`…`text-4xl`).
- ✅ Transactions table → card list < md; filter grid reflows; period pickers scroll on mobile.
- ✅ Analytics donut/legend stacks < sm; bar chart `maxBarSize` so bars fit narrow screens.
- ✅ `TransactionDetailSheet` opens as a bottom sheet on mobile.
- ✅ Route-level code splitting in `App.tsx` (main bundle 1.22 MB → 617 kB; recharts isolated).
- ✅ Shared `src/lib/forms.ts` (field class) + `src/lib/swatches.ts` (picker palette)
  + `src/lib/dates.ts` (`dateInputToISO` — anchors picked dates at local midday so the
  calendar date survives a `toISOString()` round-trip; applied to all 7 date-writing modals).
- ✅ `PageHeader` rolled out to every page (Dashboard, Transactions, Accounts, Goals, Debts,
  Links, Analytics, Settings, Admin). Header action buttons collapse to short labels on mobile.
- ✅ Per-route `document.title` via `usePageTitle` hook (all 11 protected pages).
- ✅ Loading skeletons: `src/components/app/Skeletons.tsx` (`ListSkeleton`, `CardGridSkeleton`);
  Dashboard shows a full skeleton while loading (no more KES-0 flash), Transactions / Goals /
  Accounts / Links / Debts swapped bare "Loading…" for shaped skeletons.
- ✅ Admin users table → card list < sm. Settings mobile tab strip scrolls instead of squishing.
- ✅ `text-green-500` → `text-primary` in AddExpenseModal.
- ✅ Loading skeletons extended to WhatsNew, LinkDetail, Analytics, Settings (+ its links sub-panel).
- ✅ Visible close button on mobile drawers (`DrawerClose` in `ResponsiveModal`).
- ✅ `DataList` generic (table ≥ breakpoint / cards below); Transactions migrated to it.
- ✅ `react-query` adoption: Dashboard, Transactions, Accounts, Goals, Debts, Links, Analytics
  all moved off `useEffect`+`reloadKey`/`load()` to `useQuery` + `queryClient.invalidateQueries`.
  Stable module-level empty defaults (`EMPTY_*`) keep downstream `useMemo` deps stable.
- ✅ Fixed 2 long-standing type errors in Analytics (`row.month` → `row.key`); `tsc` now clean.
- `Settings` deliberately left on `useEffect`: its allocation %, limits and name are
  controlled form fields seeded once from the server, which is the correct pattern, not the
  anti-pattern react-query replaces. Its `templates` / `links` lists could move to `useQuery`
  later but it is low value.
- ⬜ Pre-existing lint errors remain (ternary-as-statement in Dashboard/Debts, edge-fn regex
  escape, tailwind `require`) — not touched.

---

## Backlog (not being built now)

**ops/costs API integrations.** Client projects (lexinon, toefl-academic `costs`, global-dream-link
`ops`, lufa, encestarglobal, …) expose an admin route backed by Pretium; the user bills the owners
for hosting and records deposits manually. Foundation shipped in this build: `accounts.provider_slug`,
`accounts.route_kind`, `accounts.sync_config jsonb`, `accounts.last_synced_at`, and a
`supabase/functions/sync-account/` stub (501) with a documented `SyncAdapter` interface + empty
`ADAPTERS` registry. Still to build (needs the route URLs + API/auth docs from the user):
per-provider adapters; credential storage in Supabase Vault keyed by `sync_config.auth_ref`;
a sync trigger (prefer a per-account HMAC webhook each project calls on deposit, like
`paystack-webhook`; fallback pg_cron polling); movement idempotency by provider id; a "Sync now"
button + per-account status/error on `/accounts`; reconciliation rules per provider (accrued vs
to-pull).

**Other deferrals:** multi-currency (KES-only for now) · team/shared accounts · push/SMS
(in-app + email only) · goal templates · CSV / M-Pesa
statement import · scheduled account-staleness reminder email.
