# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SIPE (Smart Income, Profit & Expenses) is a personal-finance tool for Kenyan freelancers. Its core mechanic: every income payment is automatically split into four configurable buckets — **S**avings, **I**nvestments, **P**ay yourself, **E**xpenses — using percentages the user sets in Settings (must total 100%).

Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui on the frontend; Supabase (Postgres + Auth + Deno 2 edge functions) on the backend; Paystack for payments (KES).

## Commands

```bash
npm run dev          # Dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
```

### Supabase Edge Functions

```bash
npx supabase functions deploy record-deposit --no-verify-jwt
npx supabase functions deploy create-payment-link --no-verify-jwt
npx supabase functions deploy paystack-webhook --no-verify-jwt
npx supabase functions deploy weekly-review --no-verify-jwt
npx supabase functions deploy weekly-review-batch --no-verify-jwt
npx supabase functions deploy client-reminders-batch --no-verify-jwt   # daily cron, same x-cron-secret
npx supabase functions deploy unsubscribe --no-verify-jwt
npx supabase functions deploy admin                      # JWT required (admin dashboard + outbound email)
npx supabase functions deploy sync-account               # JWT required (stub)
npx supabase functions deploy project-health --no-verify-jwt   # daily cron (x-cron-secret) + "Check now" (JWT checked inside)
npx supabase functions deploy project-metrics --no-verify-jwt  # push link, x-project-key header
npx supabase functions deploy project-invite             # JWT required
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set CRON_SECRET=$(openssl rand -hex 32) # gates weekly-review-batch
supabase secrets set ADMIN_EMAILS=njugunabriian.dev@gmail.com   # comma-separated; gates the admin function
```

### Local Supabase

```bash
supabase start       # starts local stack (API :54321, DB :54322, Studio :54323)
supabase stop
supabase db reset    # re-runs all migrations from scratch
```

## Architecture

### Frontend (`src/`)

- **`App.tsx`** — router setup + `QueryClient` provider + `AuthProvider`
- **`contexts/AuthContext.tsx`** — Supabase auth state; exports `useAuth()` → `{ user, session, loading, signOut }`
- **`integrations/supabase/client.ts`** — single Supabase client instance (reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
- **`integrations/supabase/types.ts`** — all DB types + `formatKES()` helper
- **`components/app/ProtectedRoute.tsx`** — guards authenticated routes
- **`pages/`** — one file per route; data fetching is done directly with the Supabase client + React Query

Routes: `/` `/login` `/register` `/forgot-password` `/reset-password` `/d/:token` `/calculators` `/join/:token` (public) | `/dashboard` `/accounts` `/transactions` `/analytics` `/goals` `/debts` `/quotes` `/quotes/:id` `/invoices` `/invoices/:id` `/clients` `/projects` `/projects/:id` `/links` `/links/:id` `/settings` `/whats-new` (protected)

### Backend (`supabase/`)

Edge functions handle all write operations. All accept JSON POST unless noted:

| Function | Auth | Purpose |
|---|---|---|
| `record-deposit` | JWT required | Manual income entry → splits into 4 bucket child rows; optional `account_id`; funds `deposit_pct` goals; optional `document_id` (+`method`, `reference`) also records it as a payment on that invoice |
| `create-payment-link` | JWT required | Creates Paystack hosted page, stores in DB |
| `paystack-webhook` | HMAC only | Receives `charge.success` from Paystack, auto-splits income into the default account |
| `weekly-review` | JWT required | User-initiated: emails the caller their weekly summary via Resend. Sender: `noreply@cnbcode.com` |
| `weekly-review-batch` | `x-cron-secret` header == `CRON_SECRET` | Cron: emails every opted-in user their weekly summary. Idempotent within a calendar week via `email_log` (status `sent`). Best-effort `notifications` rows for goal milestone / behind events (gated on `goal_updates`). |
| `admin` | JWT; `whoami` is open to any signed-in user, every other action requires the caller's email in `ADMIN_EMAILS` | Backs the `/admin` section. Body `{ action }`: `whoami` (`{admin:boolean}` — the UI's gate), `overview` (dashboard counts), `users` (profiles + email prefs), `feed` (announcement rows), `send` (`{ subject, body_md, cta_label?, cta_url?, audience: "all"\|"user", email?, post_to_feed? }` — emails product-news subscribers or one user; `post_to_feed` also publishes to `/whats-new` + writes `notifications`; dedupe via `email_log`; per-recipient unsubscribe link). |
| `client-reminders-batch` | `x-cron-secret` header == `CRON_SECRET` | Cron (daily): for users with `business_profiles.auto_reminders`, emails clients about unpaid invoices 2 days before due, then 1, 7, 14 days late. One email per stage per invoice (`email_log` kind `client_reminder_<stage>`, ref_id = document); failures aren't logged so they retry. From `"<Business> via SIPE" <noreply@cnbcode.com>`, reply-to the business email; writes a `notifications` row. |
| `unsubscribe` | token only (`--no-verify-jwt`) | Public GET/POST `?token=<uuid>` → styled per-list email-preference page; matches `email_preferences.unsubscribe_token`. Linked from every marketing email footer. |
| `project-health` | `x-cron-secret` (all launched projects, daily) or JWT + `{project_id}` (one, max every 2 min) | Baseline auto-checks from public info: RDAP domain renewal, uptime/HTTPS, MX, homepage HTML (title/description, Open Graph, JSON-LD, FAQ, analytics), `/sitemap.xml` `/robots.txt` `/llms.txt`. Logic in `_shared/site-health.ts`. Only fetches public IPs (≤3 redirects, 10s, 2 MB); blocked/failed = `unknown`, never `fail`; never overwrites items marked `na`. Writes `project_baseline_items` + `site_up` / `domain_days_left` metrics. |
| `project-metrics` | `x-project-key` (sha256 in `project_keys`) | Push link: `{metric, value, date?}` or `{metrics:[...]}` (≤50) → `project_metrics` (source `push`), upsert per metric+day. Can only add numbers to its own project. |
| `project-invite` | JWT; owner/cofounder | Creates/updates a pending `project_members` row and emails "<Name> invited you to <Project> on SIPE" (Resend). Always returns the `/join/:token` link too. |
| `sync-account` | JWT required | STUB (501) — documented `SyncAdapter` interface + empty `ADAPTERS` registry for future ops/costs integrations |

Webhook URL pattern: `{SUPABASE_URL}/functions/v1/paystack-webhook?uid={user_id}` — user ID in query param avoids email-matching ambiguity; Paystack signature verified via HMAC-SHA512.

Shared Deno helpers live in `supabase/functions/_shared/` (`kes`, `week`, `email`, `tips`, `goals`, `weekly-review` builder). `weekly-review` / `-batch` read bucket balances via the `user_bucket_balances(uuid)` SECURITY DEFINER function, **not** the `bucket_balances` view — the view filters on `auth.uid()` and is empty under the service-role key.

### Database

No ORM — direct PostgREST queries via Supabase client. RLS on every table (users see only their own rows).

**Core tables**: `profiles` (1:1 auth.users), `allocation_settings` (S/I/P/E percentages, sum-to-100 constraint), `transactions`, `payment_links`

**Accounts / goals**: `accounts` + `account_transfers` + `account_adjustments` (money locations; `account_balances` view), `goals` + `goal_contributions` (`goal_progress` view). `transactions.account_id` tags a txn to an account.

**Email / notifications**: `email_preferences` (per-user toggles + `unsubscribe_token`), `announcements` (service-role authored; readable once `published_at <= now()`), `notifications` (in-app feed; own SELECT/UPDATE, INSERT service-role only), `email_log` (`unique(user_id, kind, ref_id)`, dedupe + audit).

**`bucket_balances` view**: computed per user — sums income vs. expenses per bucket. Queried on the Dashboard. Filters on `auth.uid()`, so service-role callers use `user_bucket_balances(uuid)` (SECURITY DEFINER) instead.

**Quotes & invoices** (`20261007000000_invoicing.sql`): `business_profiles` (1:1 user; issuer identity, logo, brand color, bank/M-Pesa details, numbering, and the defaults every new document is prefilled from, edited in Settings › Business), `clients`, `documents` (`kind` quote|invoice, one table), `document_items`, `document_payments`. Money columns on `documents` are computed by triggers, never written by the client; an invoice flips `sent`↔`paid` from its payments. Numbers (`{prefix}-{YYYY}-{0001}`) are assigned only by the `finalise_document(id)` RPC, which also freezes `issuer_snapshot` / `client_snapshot`; only drafts can be deleted, finalised invoices are locked (void + duplicate to correct). `convert_quote_to_invoice(id)` RPC. `documents.counts_as_income = false` marks pass-through money (brokerage, a float): its payments are written straight to `document_payments` and never go through `record-deposit`, so they stay out of buckets, transactions and analytics (default from `business_profiles.default_counts_as_income`; migration `20261008000000_pass_through_invoices.sql`). Public share link `/d/:token` reads via `get_public_document(token)` (SECURITY DEFINER, anon, never drafts). Logos live in the public `brand` storage bucket under `{user_id}/`. One renderer, `components/invoicing/DocumentPaper.tsx`, serves preview, print-to-PDF (`window.print()` + `@media print` in `index.css`; shell chrome is `print:hidden`) and the public page.

**Bills** (`expense_templates`): `amount` is paid every `every_months` (1, 3, 6 or 12; migration `20261110000000_bill_frequency.sql`). Anything that totals bills per month uses `monthlyEquivalent()` from `lib/planner.ts`, never the raw amount.

**Calculators** (`components/calculators/`): modals opened from the screen where each is needed, not a page of their own. Get ahead on a bill + Pay upfront or keep (Settings › Bills rows), Is my Expenses % enough (Settings › Allocation/Bills), What do I need to earn / Move-in cost (Goals › Plan), What could my savings earn (Dashboard prompt once Savings ≥ `SAVINGS_NUDGE_MIN`, Accounts), What to charge (Quotes/Invoices). The public `/calculators` page opens the same modals signed-out (no saved data; "Make this a goal" becomes a sign-up link). `goals.bill_id` (migration `20261110000001_goal_bill_link.sql`) links a get-ahead goal to its bill, so the Dashboard `MonthsAhead` card and the weekly email can say "2.8 months ahead on Rent"; the same card prompts once per payment that came in above a typical month to put half the extra toward the next goal. All maths is in `lib/planner.ts` (tested); starting numbers come from `usePlannerData()` (typical month = median of the last 6 complete months of income). "Make this a goal" creates a `deposit_pct` goal. Savings option rates are labelled examples the user can overwrite (kept in localStorage).

**Client priority** (`lib/clientPriority.ts`, tested; `/clients`, Dashboard `AttentionCard`): derived from finalised documents + `document_payments`, no stored scores. Tiers = 80/15/5 of the last 12 months' income-counting payments (pass-through excluded); "Needs attention" = overdue, accepted quotes not invoiced, due in 3 days, quotes expiring in 7, quiet (60d) top/key clients, ordered by kind then amount × client weight. `clients.key_client` pins a client first (migration `20261117000000_client_priority.sql`, which also adds `business_profiles.auto_reminders`). The weekly email's "Clients who need you" section uses the server-side subset in `_shared/client-attention.ts`; keep the wording in step.

**Projects** (`20261118000000_projects.sql`; `lib/projects.ts`, tested; `/projects`, `/projects/:id`, `/join/:token`): `projects` + `project_members` (the team: owner/cofounder/contributor/viewer; `mode` focus/background/parked is **per member**, Focus capped by `profiles.focus_cap`, enforced by the `project_members_guard` trigger, which also stops non-owners changing roles/shares and blocks Background for idea/building), `project_cycles` (90-day goal + plan + stop rule, one active per project), `project_checkins` (weekly, one per person per week, items tagged build/grow), `project_baseline_items` (checklist; templates per project type live in `lib/projects.ts`, auto items written by `project-health`, `derived` items computed from SIPE data), `project_metrics` (one value per project+metric+day; sources auto/push/snapshot), `project_keys` (push-link key hashes). RLS goes through `is_project_member(project, roles[])`. `project_id` on `transactions` (parent row only), `documents`, `payment_links`, `expense_templates`; the `check_project_tag` trigger only lets people who work on a project tag money to it. Teammates **never** read each other's transactions: project totals come from `project_money(project)` (SECURITY DEFINER, totals only, owner always, others only when `projects.money_shared`). Invites: `get_project_invite(token)` (anon) / `accept_project_invite(token)` (signed-in email must match; brand-new users get `signup_source='invite'` and `enabled_modules={projects}`, the focused view). `profiles.enabled_modules` (null = everything) drives the sidebar, Settings tabs and route redirects (`MODULES` in `lib/projects.ts`); Settings › Features turns modules on/off. Access-rule tests: `supabase/tests/run-projects-access.sh` (needs a throwaway Postgres; diffs against `projects_access.expected`). The weekly email's "Projects this week" uses `_shared/project-attention.ts`; keep its wording in step with `projectAttention()`.

**Split pattern**: every income creates one parent row (`parent_id = NULL`) + four child rows (one per bucket, `parent_id` set). This is the accounting core — don't break it.

**Trigger**: `on_auth_user_created` auto-creates profile + default allocation_settings + email_preferences on signup. `accounts_single_default` (BEFORE INSERT/UPDATE) enforces one `is_default` account per user.

## Environment

`.env` (frontend):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

No admin config ships to the client. The `/admin` UI calls the `admin` function's
`whoami` action (cached) to decide whether to render; the answer comes from the
server's `ADMIN_EMAILS` secret alone.

Supabase secrets (edge functions only, not in `.env`):
```
PAYSTACK_SECRET_KEY   # paystack-webhook signature verification
RESEND_API_KEY        # all outbound email
CRON_SECRET           # x-cron-secret header gate for weekly-review-batch, client-reminders-batch, project-health
ADMIN_EMAILS          # comma-separated allowlist for the admin function
```

### Email automation

The weekly review email runs on Supabase **pg_cron** → **pg_net** calling
`weekly-review-batch` on a schedule with the `x-cron-secret` header. The cron job
is created by hand in the SQL editor (the secret must not be committed). Full
steps (extensions, `cron.schedule(...)`, verification queries, manual `curl`
test) are in **`docs/roadmap/PLAN.md` Appendix A**. Outbound announcements and
one-off emails are composed and sent from the **`/admin`** section (gated by the
`admin` function against the `ADMIN_EMAILS` secret); no cron.

## Key Conventions

- **Currency**: KES only. Use `formatKES()` from `integrations/supabase/types.ts` for display.
- **Idempotency**: Paystack webhook checks `paystack_ref` uniqueness before inserting — duplicate webhooks are safe.
- **Path alias**: `@/` maps to `src/` (tsconfig + vite config).
- **shadcn/ui**: components live in `src/components/ui/`. Add new ones via `npx shadcn-ui@latest add <component>`.
