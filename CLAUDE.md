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
npx supabase functions deploy unsubscribe --no-verify-jwt
npx supabase functions deploy admin                      # JWT required (admin dashboard + outbound email)
npx supabase functions deploy sync-account               # JWT required (stub)
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

Routes: `/` `/login` `/register` (public) | `/dashboard` `/accounts` `/transactions` `/analytics` `/goals` `/debts` `/links` `/links/:id` `/settings` `/whats-new` (protected)

### Backend (`supabase/`)

Edge functions handle all write operations. All accept JSON POST unless noted:

| Function | Auth | Purpose |
|---|---|---|
| `record-deposit` | JWT required | Manual income entry → splits into 4 bucket child rows; optional `account_id`; funds `deposit_pct` goals |
| `create-payment-link` | JWT required | Creates Paystack hosted page, stores in DB |
| `paystack-webhook` | HMAC only | Receives `charge.success` from Paystack, auto-splits income into the default account |
| `weekly-review` | JWT required | User-initiated: emails the caller their weekly summary via Resend. Sender: `noreply@cnbcode.com` |
| `weekly-review-batch` | `x-cron-secret` header == `CRON_SECRET` | Cron: emails every opted-in user their weekly summary. Idempotent within a calendar week via `email_log` (status `sent`). Best-effort `notifications` rows for goal milestone / behind events (gated on `goal_updates`). |
| `admin` | JWT; `whoami` is open to any signed-in user, every other action requires the caller's email in `ADMIN_EMAILS` | Backs the `/admin` section. Body `{ action }`: `whoami` (`{admin:boolean}` — the UI's gate), `overview` (dashboard counts), `users` (profiles + email prefs), `feed` (announcement rows), `send` (`{ subject, body_md, cta_label?, cta_url?, audience: "all"\|"user", email?, post_to_feed? }` — emails product-news subscribers or one user; `post_to_feed` also publishes to `/whats-new` + writes `notifications`; dedupe via `email_log`; per-recipient unsubscribe link). |
| `unsubscribe` | token only (`--no-verify-jwt`) | Public GET/POST `?token=<uuid>` → styled per-list email-preference page; matches `email_preferences.unsubscribe_token`. Linked from every marketing email footer. |
| `sync-account` | JWT required | STUB (501) — documented `SyncAdapter` interface + empty `ADAPTERS` registry for future ops/costs integrations |

Webhook URL pattern: `{SUPABASE_URL}/functions/v1/paystack-webhook?uid={user_id}` — user ID in query param avoids email-matching ambiguity; Paystack signature verified via HMAC-SHA512.

Shared Deno helpers live in `supabase/functions/_shared/` (`kes`, `week`, `email`, `tips`, `goals`, `weekly-review` builder). `weekly-review` / `-batch` read bucket balances via the `user_bucket_balances(uuid)` SECURITY DEFINER function, **not** the `bucket_balances` view — the view filters on `auth.uid()` and is empty under the service-role key.

### Database

No ORM — direct PostgREST queries via Supabase client. RLS on every table (users see only their own rows).

**Core tables**: `profiles` (1:1 auth.users), `allocation_settings` (S/I/P/E percentages, sum-to-100 constraint), `transactions`, `payment_links`

**Accounts / goals**: `accounts` + `account_transfers` + `account_adjustments` (money locations; `account_balances` view), `goals` + `goal_contributions` (`goal_progress` view). `transactions.account_id` tags a txn to an account.

**Email / notifications**: `email_preferences` (per-user toggles + `unsubscribe_token`), `announcements` (service-role authored; readable once `published_at <= now()`), `notifications` (in-app feed; own SELECT/UPDATE, INSERT service-role only), `email_log` (`unique(user_id, kind, ref_id)`, dedupe + audit).

**`bucket_balances` view**: computed per user — sums income vs. expenses per bucket. Queried on the Dashboard. Filters on `auth.uid()`, so service-role callers use `user_bucket_balances(uuid)` (SECURITY DEFINER) instead.

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
CRON_SECRET           # x-cron-secret header gate for weekly-review-batch
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
