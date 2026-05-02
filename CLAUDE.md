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
supabase functions deploy record-deposit
supabase functions deploy create-payment-link
supabase functions deploy paystack-webhook --no-verify-jwt   # public webhook, no JWT
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
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

Routes: `/` `/login` `/register` (public) | `/dashboard` `/transactions` `/links` `/links/:id` `/settings` (protected)

### Backend (`supabase/`)

Three edge functions handle all write operations. All accept JSON POST:

| Function | Auth | Purpose |
|---|---|---|
| `record-deposit` | JWT required | Manual income entry → splits into 4 bucket child rows |
| `create-payment-link` | JWT required | Creates Paystack hosted page, stores in DB |
| `paystack-webhook` | HMAC only | Receives `charge.success` from Paystack, auto-splits income |

Webhook URL pattern: `{SUPABASE_URL}/functions/v1/paystack-webhook?uid={user_id}` — user ID in query param avoids email-matching ambiguity; Paystack signature verified via HMAC-SHA512.

### Database

No ORM — direct PostgREST queries via Supabase client. RLS on every table (users see only their own rows).

**Core tables**: `profiles` (1:1 auth.users), `allocation_settings` (S/I/P/E percentages, sum-to-100 constraint), `transactions`, `payment_links`

**`bucket_balances` view**: computed per user — sums income vs. expenses per bucket. Queried on the Dashboard.

**Split pattern**: every income creates one parent row (`parent_id = NULL`) + four child rows (one per bucket, `parent_id` set). This is the accounting core — don't break it.

**Trigger**: `on_auth_user_created` auto-creates profile + default allocation_settings on signup.

## Environment

`.env` (frontend):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Supabase secret (edge functions only, not in `.env`):
```
PAYSTACK_SECRET_KEY
```

## Key Conventions

- **Currency**: KES only. Use `formatKES()` from `integrations/supabase/types.ts` for display.
- **Idempotency**: Paystack webhook checks `paystack_ref` uniqueness before inserting — duplicate webhooks are safe.
- **Path alias**: `@/` maps to `src/` (tsconfig + vite config).
- **shadcn/ui**: components live in `src/components/ui/`. Add new ones via `npx shadcn-ui@latest add <component>`.
