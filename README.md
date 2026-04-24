# SIPE — Smart Income, Profit & Expenses

SIPE is a personal-finance tool built for Kenyan freelancers and small business owners. Every payment received is automatically split into four buckets so you always know what's yours to spend, save, invest, or pay out.

## The SIPE buckets

| Bucket | Meaning | Default % |
|--------|---------|-----------|
| **S** | Savings | 20% |
| **I** | Investments | 15% |
| **P** | Pay yourself | 50% |
| **E** | Expenses | 15% |

Percentages are configurable per user in **Settings**.

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase — Postgres, Auth, Edge Functions (Deno)
- **Payments**: Paystack (KES) — webhook + hosted Payment Pages

## Features

- Email/password auth with protected routes
- Dashboard with bucket balances and monthly income/spend summary
- Paystack payment link creation (hosted pages shared with clients)
- Automatic payment recording via Paystack webhook
- Manual deposit entry
- Expense recording per bucket
- Transaction history with search, date range, and amount filters
- Configurable S/I/P/E split with live percentage validator

## Edge functions

| Function | Purpose | JWT |
|----------|---------|-----|
| `record-deposit` | Manual income entry + auto-split | ✅ required |
| `create-payment-link` | Create Paystack hosted page | ✅ required |
| `paystack-webhook` | Receive Paystack `charge.success` events | ❌ public (HMAC verified) |

Deploy:

```bash
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy record-deposit
supabase functions deploy create-payment-link
```

## Required secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
```

## Paystack webhook URL

Each user gets a personalised webhook URL shown in the Settings page:

```
https://<your-project>.supabase.co/functions/v1/paystack-webhook?uid=<user-id>
```

Paste this into Paystack Dashboard → Settings → API Keys & Webhooks.

## Local development

```bash
npm install
npm run dev        # dev server on port 8080
npm run build      # production build
npm run lint       # eslint
npm run test       # vitest
```

Env vars (`.env`):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
