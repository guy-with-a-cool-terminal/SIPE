# SIPE Design System

The single reference for how SIPE looks and behaves. If a screen disagrees with this
doc, the screen is wrong. Keep this doc and the code in sync — when you change a token,
change it here.

Sister docs:
- [AVOIDING_AI_VIBES.md](./AVOIDING_AI_VIBES.md) — what makes software read as "vibe-coded" and how we avoid it.
- [RESPONSIVE.md](./RESPONSIVE.md) — breakpoints, the mobile/tablet/desktop contract, and the current audit.

---

## 1. Product voice

SIPE is a money tool for Kenyan freelancers with irregular income. The tone is
**calm, plain, and slightly dry** — never hype, never a lecture, never an exclamation
mark in the product UI. Copy rules:

- Currency is **KES only**. Always render money through `formatKES()` from
  `src/integrations/supabase/types.ts`. Never hand-format with `toLocaleString`.
- No em-dashes in user-facing copy (see the repo memory). Use commas, colons, parentheses,
  or the middot `·` as a separator.
- Sentence case for everything: headings, buttons, labels, table headers. Not Title Case.
- Numbers that change or align vertically get `tabular-nums`.
- Verbs on buttons: "Record deposit", "Add expense", "Save changes". Not "Submit", not "OK".
- Empty states say what will fill them ("Paystack payments land here automatically"), not
  just "No data".

---

## 2. Color

All color lives as HSL channel triples in CSS custom properties in
[`src/index.css`](../../src/index.css) and is surfaced to Tailwind in
[`tailwind.config.ts`](../../tailwind.config.ts). **Never write a raw hex or `rgb()` in a
component** except the fixed goal/account swatch palette (see §2.3).

### 2.1 Core tokens (dark theme — the only theme today)

| Token | Value (HSL) | Use |
|---|---|---|
| `--background` | `222 47% 6%` | app canvas (also painted by `--gradient-hero`) |
| `--foreground` | `200 30% 96%` | primary text |
| `--card` | `222 40% 9%` | raised surfaces (rarely used raw — prefer `.glass`) |
| `--muted` | `222 30% 12%` | inset fills |
| `--muted-foreground` | `215 20% 65%` | secondary text, labels, captions |
| `--secondary` | `222 35% 14%` | chips, toggles, hover fills |
| `--primary` | `200 95% 70%` | the single accent — links, active nav, CTAs, positive money |
| `--primary-glow` | `195 100% 78%` | primary hover only |
| `--primary-foreground` | `222 47% 6%` | text/icons on a primary fill |
| `--destructive` | `0 75% 60%` | overspend, delete, errors, negative reconciliation |
| `--warning` | `45 100% 60%` | 80–99% of a limit; "approaching" states |
| `--border` | `217 30% 18%` | all hairlines |
| `--input` | `217 30% 16%` | form field fill |
| `--ring` | `200 95% 70%` | focus ring |

Semantics:
- **Primary is the only accent.** Green is not in the palette; "positive" money is
  `text-primary`, not green. (The one exception, `text-green-500` in
  `AddExpenseModal`, is a bug — it should be `text-primary`.)
- **Destructive is reserved** for money the user has lost control of (overspent bucket,
  failed reconciliation) and for irreversible actions. Don't use it for validation hints
  that the user can still fix in place — use `text-warning` or plain `text-muted-foreground`.

### 2.2 Bucket colors

The four SIPE buckets each have a fixed hue. These are identity colors — do not
substitute, reorder, or theme them.

| Bucket | Token | Hue | Meaning |
|---|---|---|---|
| S — Savings | `--bucket-s` | `195 100% 70%` icy blue | cushion |
| I — Invest | `--bucket-i` | `175 80% 60%` teal | compounding |
| P — Pay yourself | `--bucket-p` | `220 95% 75%` periwinkle | salary |
| E — Expenses | `--bucket-e` | `260 75% 75%` lavender | bills |

Usage pattern (already consistent across the app, keep it): a rounded square badge with
the bucket letter, `backgroundColor: hsl(var(--bucket-x) / 0.15)` and
`color: hsl(var(--bucket-x))`. Pull names/colors from `BUCKET_META`, never re-type them.

### 2.3 Fixed swatch palette

Goal and account accent pickers use one shared 8-color palette. It is intentionally raw
hex (user-chosen labels, not theme tokens). Keep the two lists identical:

```
#22c55e  #3b82f6  #a855f7  #ec4899  #f97316  #eab308  #14b8a6  #64748b
```

Today this is duplicated in `GoalModal.tsx` and `AccountModal.tsx`. It should move to
`src/lib/swatches.ts` and be imported by both.

### 2.4 Gradients & effects

- `--gradient-hero` — fixed on `body`, the ambient background. Don't add competing
  page-level gradients.
- `.glass` — the standard raised surface: `--gradient-card` + `backdrop-blur(20px)` +
  1px border. This is the default container for cards, modals, and panels.
- `.glow` / `.animate-pulse-glow` — landing page only. Never in the app shell.
- `.noise` — landing page only.
- `.text-gradient` — marketing headlines only. App headings are solid `foreground`.

---

## 3. Typography

One family: **Inter** (loaded via Google Fonts `@import` in `index.css`), fallback
`system-ui, sans-serif`. `h1–h3` and `.font-display` get `letter-spacing: -0.01em` and
`font-weight: 700`.

> **Known issue:** `index.css` labels Inter as `font-display` and the marketing pages
> lean on it as if it were a display face. It is not — it is the body face. This is
> fine (Inter is a strong workhorse) but the naming misleads. Treat `.font-display`
> as "the heading weight of our one font", nothing more.

### 3.1 Type scale (target — see §3.2 for current drift)

| Role | Classes | Notes |
|---|---|---|
| Page title (`h1`) | `text-2xl sm:text-3xl font-bold tracking-tight` | one per page, in `PageHeader` |
| Page subtitle | `text-sm text-muted-foreground` | optional, one line |
| Section heading (`h2`) | `text-base font-semibold` | inside a page |
| Card title | `text-sm font-medium` | |
| Body | `text-sm` | the app's default reading size |
| Caption / label | `text-xs text-muted-foreground` | often `uppercase tracking-wide` |
| Big number (KPI) | `text-2xl font-bold tabular-nums` | `text-xl` inside a 4-up grid |
| Marketing `h1` | `text-4xl sm:text-5xl lg:text-7xl` | landing + auth only |

### 3.2 Status

Fixed (2026-09-08): every app page now renders one `PageHeader` at `text-2xl sm:text-3xl`.
`AuthLayout` `h1` is `text-4xl sm:text-5xl`. `LinkDetail` keeps a bespoke header card (its
title is dynamic content, not a page label) but at the same size. Remaining bespoke
header: `WhatsNew` page (intentional Sparkles eyebrow variant).

---

## 4. Spacing & layout

### 4.1 Scale

Tailwind's default 4px scale. In practice SIPE uses a small vocabulary — stay inside it:

- **Gaps between cards:** `gap-3` (12px) in grids, `gap-4` (16px) for larger cards.
- **Card padding:** `p-4` (dense: dashboard tiles), `p-5` (standard), `p-6` (roomy: link cards).
- **Stacked form fields:** `space-y-4`.
- **Section rhythm on a page:** `mb-5` to `mb-8` between blocks.
- **Radius:** `--radius` is `1rem`. Use `rounded-xl` (12px) for controls/inputs/small
  cards, `rounded-2xl` (16px) for panels, `rounded-3xl` for modals. `rounded-full` for
  pills, badges, and the primary CTA buttons.

### 4.2 Page container

Every protected page's root element uses this exact recipe (applied across all pages):

```
<div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12 pt-5 sm:pt-8 pb-24 md:pb-10">
```

- `max-w-[1400px]` matches the Tailwind container's `2xl` cap and stops KPI rows from
  stretching to absurd widths on 27" monitors. (`max-w-2xl` / `max-w-4xl` on the reading
  pages — WhatsNew, Admin — instead of `1400px`.)
- `px-4` floor (16px) — `p-6` (24px) is too tight at 320px once you add a card's own padding.
- `pb-24 md:pb-10` — clears the mobile bottom nav (see RESPONSIVE.md §2.2).

Previously pages hard-coded `p-6 md:px-8 xl:px-12 py-6 md:py-8 w-full` with no `max-w` and
no bottom-nav clearance.

### 4.3 App shell

- **Desktop (`md+`):** fixed left sidebar, `w-52` expanded / `w-14` collapsed, state in
  `localStorage`. Content area is `flex-1 min-w-0`.
- **Mobile (`<md`):** top bar (logo + notifications) that scrolls away, plus a **fixed
  bottom tab bar** for the 4 primary destinations and a "More" sheet for the rest. The
  current mobile header (all 7 nav links inline with `gap-4`) overflows below ~600px and
  must be replaced. See RESPONSIVE.md §3.

---

## 5. Components

### 5.1 Buttons

| Variant | Classes | When |
|---|---|---|
| Primary | `bg-primary text-primary-foreground rounded-full font-semibold px-4 py-2 hover:bg-primary-glow transition` | one per view — the main action |
| Secondary | `border border-border rounded-full font-semibold px-4 py-2 hover:bg-secondary/40 transition` | Export, Transfer, secondary actions |
| Ghost | `text-muted-foreground hover:text-foreground transition` | icon buttons, tertiary links |
| Destructive | `bg-destructive text-destructive-foreground hover:bg-destructive/90` | confirm-delete only, inside `AlertDialog` |

- Full-width form submit: `w-full ... py-3 rounded-xl` (not `rounded-full`).
- Every button with an icon: `flex items-center gap-2` (or `gap-1.5` for small).
- **Minimum hit target 44×44px on touch.** `px-4 py-2` on a pill clears this; bare icon
  buttons (`p-1`) do not — pad to `p-2.5` or wrap in a 44px box on mobile.
- On mobile, primary page-header buttons collapse to icon + short label or icon-only with
  an `aria-label`. "Deposit earnings" → a `+` FAB or "Deposit".

### 5.2 Inputs

Shared field class (currently copy-pasted as a local `const field` in five modals — extract to `src/lib/forms.ts`):

```
mt-1.5 w-full bg-input border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary
```

- Label pattern: `<label className="block"><span className="text-sm text-muted-foreground">Label</span><input .../></label>`.
- **Font size on inputs must be ≥16px on mobile** or iOS Safari zooms on focus. `text-sm`
  (14px) triggers the zoom — inputs need `text-base` at `<sm`, or set it globally.
- Add `focus:ring-2 focus:ring-primary/20` for a visible focus state (only `AuthLayout`'s
  `Field` does this today; the app modals only shift the border).
- Native `<select>` and `<input type="date">` are used throughout and are fine — they get
  the OS picker on mobile, which is what we want. Keep them.

### 5.3 Surfaces

- `.glass rounded-2xl p-5` — the default panel.
- Card grids: `grid grid-cols-2 gap-3` on mobile for the 4 bucket cards (never 1-up — the
  2×2 grid is part of the SIPE mental model), `sm:grid-cols-2` for KPI pairs,
  `xl:grid-cols-4` for the full bucket row.
- Dashboard KPI row is deliberately `grid-cols-1 sm:grid-cols-3` — stacked on the smallest
  screens, 3-up otherwise. Keep.

### 5.4 Modals — use `ResponsiveModal`

All nine hand-rolled modals currently render a bespoke
`fixed inset-0 ... grid place-items-center` overlay with a `max-w-md` glass card. This is
inconsistent (three different close-affordance patterns, one uses `Sheet`, one is
`AlertDialog`) and hostile on mobile: a `max-w-md` card with `p-8` on a 360px screen,
no drag-to-dismiss, and the on-screen keyboard covers the submit button.

**Standard:** `src/components/app/ResponsiveModal.tsx`
- `<md`: `vaul` bottom drawer, `max-h-[90dvh]`, drag handle, sticky footer above the
  keyboard, safe-area padding.
- `md+`: centered Radix `Dialog` styled as the existing `.glass rounded-3xl` card.
- Props: `open`, `onClose`, `title`, `description?`, `footer?` (sticky), children (scroll region).
- Focus trap, `Esc` to close, scroll lock, and `aria-labelledby` come from the primitives
  for free — the hand-rolled version has none of these.

`AlertDialog` (via `ConfirmDialog`) stays as-is for destructive confirmations.
`TransactionDetailSheet` stays a `Sheet` but should be `side="bottom"` on mobile.

### 5.5 Tables

`<table>` is used on `Transactions` and `Admin`, wrapped in `overflow-x-auto`. Horizontal
scroll inside a fixed-width panel is an acceptable desktop fallback but a poor primary
mobile experience.

**Standard:** below `md`, render the same rows as a stacked card list (`md:hidden`), and
keep the `<table>` as `hidden md:block`. The `Transactions` list already has a good card
shape to copy from the Dashboard's transaction rows.

### 5.6 Charts (`recharts` via `src/components/ui/chart.tsx`)

- Fixed pixel heights (`h-64`, `h-36`) are fine; width is always `w-full`.
- `barSize={28}` and `barGap` are set for desktop density. On mobile, a 12-month bar
  chart with 24 bars at 28px overflows — either drop `barSize` (let recharts fit) or cap
  the visible range to 6 months at `<sm`.
- Axis tick `fontSize: 11` is at the legibility floor. Don't go smaller.
- The donut + legend layout in Analytics (`flex items-center gap-5`) needs to become
  `flex-col` at `<sm` — a 144px donut plus a legend does not fit side by side at 360px.

---

## 6. Motion

- Transitions: `transition` (Tailwind's default, 150ms) for hover/color; `duration-200`
  for layout (sidebar width).
- Named keyframes in `index.css`: `fade-up` (page/section entrance), `float-up` and
  `pulse-glow` (landing only).
- `accordion-down/up` from `tailwindcss-animate` for Radix collapsibles.
- **Respect `prefers-reduced-motion`.** Add a global rule in `index.css` that neutralizes
  `float-up`, `pulse-glow`, and `animate-fade-up` when the user asks for reduced motion.
  None of the current animations check for it.
- No animation longer than 300ms in the app shell. The landing page's 500–1000ms hovers
  do not belong in the product.

---

## 7. Accessibility baseline

Non-negotiable for "production ready":

- Every icon-only button has an `aria-label` or `title`. (Nav does; the modal close
  buttons and the dashboard card info toggles mostly do not.)
- Focus visible on every interactive element — `focus-visible:ring-2 ring-ring
  ring-offset-2 ring-offset-background`. Add once to the base layer.
- Color is never the only signal: overspend shows an "over" badge as well as red; the
  reconciliation delta shows `Δ` and a sign, not just color. Keep this discipline.
- Hit targets ≥44px on touch (see §5.1).
- Modals and sheets trap focus and restore it on close — free once everything is on the
  Radix/vaul primitives, absent today.
- Contrast: `--muted-foreground` on `--background` is ~4.6:1 — passes AA for body text,
  fails for anything below 14px. Don't put `text-[11px]` / `text-[10px]` in
  `muted-foreground` on the background; only on a lighter card fill.
- `<html lang="en">` is set. Keep a real `<title>` per route (add `react-helmet` or set
  `document.title` in a small hook — today every route is "SIPE: automatic money…").

---

## 8. File map

| Concern | Location |
|---|---|
| Tokens | `src/index.css` (`:root`), mirrored in `tailwind.config.ts` |
| Money formatting | `formatKES()` in `src/integrations/supabase/types.ts` |
| Bucket metadata | `BUCKET_META` in `src/integrations/supabase/types.ts` |
| Account metadata | `KIND_META` in `src/lib/accounts.ts` |
| Goal icons | `src/lib/goalIcons.ts` |
| shadcn primitives | `src/components/ui/` |
| App-specific composed components | `src/components/app/` |
| Marketing | `src/components/landing/` |

### Proposed additions

| File | Status | Purpose |
|---|---|---|
| `src/components/app/PageHeader.tsx` | shipped | title + subtitle + actions (§3.2); adopted on every page |
| `src/components/app/ResponsiveModal.tsx` | shipped | drawer/dialog (§5.4); all modals migrated |
| `src/components/app/Skeletons.tsx` | shipped | `ListSkeleton` / `CardGridSkeleton` loading states (§5.5) |
| `src/hooks/usePageTitle.ts` | shipped | per-route `document.title` (§7) |
| `src/lib/forms.ts` | shipped | the shared `field` class + submit button (§5.2) |
| `src/lib/swatches.ts` | shipped | the 8-color picker palette (§2.3) |
| `src/lib/dates.ts` | shipped | `dateInputToISO` — timezone-safe date-input parsing |
| `src/components/app/DataList.tsx` | proposed | generic table-on-desktop / cards-on-mobile wrapper (§5.5) |
