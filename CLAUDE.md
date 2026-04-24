# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server on port 8080
npm run build        # production build
npm run lint         # eslint
npm run test         # vitest single pass
npm run test:watch   # vitest watch mode
```

Run a single test file: `npx vitest run src/test/example.test.ts`

### Supabase

```bash
supabase start                              # start local stack
supabase db push                            # apply migrations to linked project
supabase db reset                           # reset local DB and reseed
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy record-deposit
supabase functions deploy create-payment-link
supabase secrets set PAYSTACK_SECRET_KEY=...
```

## Architecture

### What SIPE does

SIPE is an income allocation app for freelancers. Every payment is split into four buckets: **S**avings, **I**nvest, **P**ay yourself, **E**xpenses. The split percentages must sum to 100 and are configurable per user.

### Frontend

Vite + React 18 + TypeScript. The `@/` path alias maps to `src/`. shadcn/ui components live in `src/components/ui/` (generated, don't edit manually). App-specific components are in `src/components/app/` and `src/components/landing/`.

**Routing** (`src/App.tsx`): public routes (`/`, `/login`, `/register`) and protected routes wrapped in `<ProtectedRoute><AppShell />` (`/dashboard`, `/transactions`, `/links`, `/links/:id`, `/settings`).

**Auth** (`src/contexts/AuthContext.tsx`): wraps Supabase Auth. Use the `useAuth()` hook to get `user`, `session`, `loading`, and `signOut`.

**Data fetching**: pages use raw `supabase.from(...)` calls with `useState`/`useEffect` directly — TanStack Query is installed but not used in pages.

**Types** (`src/integrations/supabase/types.ts`): shared types (`Transaction`, `BucketBalance`, `AllocationSettings`, `Profile`), the `Bucket = "S" | "I" | "P" | "E"` union, `BUCKET_META` (display name + CSS color var per bucket), and `formatKES` formatter.

**Supabase client** (`src/integrations/supabase/client.ts`): singleton using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`.

### Database schema

| Table / View | Purpose |
|---|---|
| `profiles` | User display name, email, currency (default KES) |
| `allocation_settings` | Per-user S/I/P/E percentages (must sum to 100) |
| `transactions` | All income and expense rows |
| `payment_links` | Paystack payment pages created by users |
| `bucket_balances` | View: allocated / spent / balance per bucket |

**Transaction tree model**: every income deposit creates one parent row (`parent_id = null`, no bucket) plus four child allocation rows (one per bucket, `parent_id` pointing to the parent). Dashboard income totals filter on `parent_id IS NULL` to avoid double-counting. The `bucket_balances` view only counts rows with a non-null bucket.

All tables use RLS — users can only access their own rows. The `handle_new_user` trigger auto-creates a `profiles` row and `allocation_settings` row (with default 20/15/50/15 split) on signup.

### Edge Functions (Deno)

All three functions are in `supabase/functions/` and run on Deno (not Node). They import Supabase from `https://esm.sh/@supabase/supabase-js@2.45.0`.

| Function | Trigger | What it does |
|---|---|---|
| `paystack-webhook` | Paystack `charge.success` webhook (no JWT) | Verifies HMAC-SHA512 signature, finds user by email, creates parent + 4 allocation transactions, links to `payment_links` if slug matches |
| `record-deposit` | Frontend (JWT required) | Manually records an income deposit and creates parent + 4 allocation transactions |
| `create-payment-link` | Frontend (JWT required) | Creates a Paystack Payment Page via API, stores result in `payment_links` |

Required edge function secrets: `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (plus `SUPABASE_URL` and `SUPABASE_ANON_KEY` which are auto-injected).

The webhook URL shown in Settings is `{SUPABASE_URL}/functions/v1/paystack-webhook` — users paste it into Paystack Dashboard → Settings → Webhooks.

### Environment variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
