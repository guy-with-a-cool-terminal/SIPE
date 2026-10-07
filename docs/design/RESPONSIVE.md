# Responsive & mobile contract

How SIPE behaves across screen sizes, the audit of where it currently breaks, and the
plan. Read with [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) §4.

---

## 1. Breakpoints

Tailwind defaults. SIPE only ever needs four of them:

| Token | Min width | SIPE meaning |
|---|---|---|
| (base) | 0 | phone, portrait. **Design here first.** |
| `sm` | 640px | large phone / phone landscape / small tablet portrait |
| `md` | 768px | **the shell switch** — sidebar appears, drawers become dialogs, tables appear |
| `lg` | 1024px | tablet landscape / small laptop — two-column content |
| `xl` | 1280px | desktop — four-up bucket row, wider gutters |
| `2xl` | 1400px (custom) | content stops growing (`max-w-[1400px]`) |

Rules:
- **Mobile-first.** Base classes are the phone layout; `sm:`/`md:`/`lg:` add to it. Never
  `md:hidden` a thing the phone needs; never base-style for desktop and walk back.
- **`md` is the one hard switch.** Below `md` = "app in a webview" mode (bottom nav,
  drawers, cards). At `md`+ = "app on a desktop" mode (sidebar, dialogs, tables).
- Test widths: **320, 360, 390, 414, 768, 1024, 1280, 1440**. The bugs are between 400 and 900.
- Prefer `dvh` over `vh` for full-height mobile layouts (dynamic viewport, accounts for
  the mobile URL bar). `max-h-[90vh]` in the modals should be `90dvh`.

---

## 2. The layout contract per zone

### 2.1 Page container

Recipe applied to every protected page root:

```jsx
<div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 xl:px-12
                pt-5 sm:pt-8 pb-24 md:pb-10">
```

- `px-4` floor. `p-6` (old) is too tight once a `.glass p-5` card sits inside it at 320px.
- `pb-24 md:pb-10` clears the fixed mobile bottom nav.
- Left/right safe-area padding is handled once, globally, on the shell's `<main>` region
  rather than per page.

### 2.2 Navigation

**Desktop (`md`+):** unchanged — collapsible left sidebar.

**Mobile (`<md`):** replace the current all-links-inline header with:

1. A slim **top bar** (`h-14`, sticky, `bg-background/80 backdrop-blur`): logo left,
   `NotificationsBell` right. Scrolls with the page or stays sticky — sticky is fine at 56px.
2. A **fixed bottom tab bar** (`fixed bottom-0 inset-x-0`, `h-16` + safe-area padding,
   `bg-background/95 backdrop-blur border-t`): 5 slots.
   - Dashboard, Accounts, Transactions, Analytics, **More**
   - Each: icon (`size-5`) above a `text-[10px]` label, active = `text-primary`, whole
     slot is a ≥44px tap target, `aria-current="page"` on the active one.
   - "More" opens a `Sheet side="bottom"` listing the rest: Goals, Debts, Settings,
     Admin (if admin), and Sign out.
3. The primary page action (e.g. "Deposit earnings") is **not** in the nav — it stays in
   `PageHeader`, collapsed to a compact button or a `+` on mobile.

Why bottom tabs over a hamburger: this is a frequent-use money app; the four primary
destinations should be one thumb-tap away. A hamburger hides everything behind two taps.

### 2.3 Modals → drawers

`ResponsiveModal` (DESIGN_SYSTEM §5.4):
- `<md`: `vaul` `Drawer` from the bottom. `max-h-[90dvh]`, rounded top, drag handle,
  internal scroll region, **sticky footer** holding the submit button so the keyboard
  never covers it, `pb-[env(safe-area-inset-bottom)]`.
- `md+`: centered `Dialog`, styled as today's `.glass rounded-3xl p-8 max-w-md` card.

### 2.4 Tables → cards

`<md`: stacked cards, one per row, label/value pairs. `md+`: the `<table>`.
Applies to: `Transactions` (deposits + expenses), `Admin` (users), `Accounts` (transfers
list is already card-shaped — fine), `LinkDetail` (payments list — already cards).

### 2.5 Content grids

| Content | base | sm | lg | xl |
|---|---|---|---|---|
| Dashboard KPI row | 1 | 3 | 3 | 3 |
| Bucket cards | 2 | 2 | 2 | 4 |
| Cash-by-location | 2 | 4 | 4 | 4 |
| Goals cards | 1 | 2 | 2 | 3 |
| Accounts cards | 1 | 2 | 2 | 3 |
| Analytics donut + legend | **column** | row | row | row |
| Debts (I owe / owed to me) | 1 (stacked) | 1 | 2 | 2 |
| Settings tabs | horizontal scroll strip | wrap | wrap | wrap |

The bucket cards stay 2-up even on the smallest screens — the 2×2 grid is part of the
SIPE mental model, and the cards are designed to be dense.

---

## 3. Audit — current state (2026-09)

> **Update 2026-09-08:** rows 1–8, 9, 13, 14, 15 are **fixed** (nav rebuild, `ResponsiveModal`,
> Transactions/Admin card reflow, global 16px inputs, `PageHeader`, filter grid, `AuthLayout`
> heading, `dvh` in modals, donut stack, `max-w` container, period-picker scroll,
> `viewport-fit=cover`). Rows 10, 12, 16, 17, 18 remain. Row 11 (`SipeFlow` labels) accepted as-is.

Severity: **P0** breaks the page · **P1** clearly wrong · **P2** polish.

| # | Sev | Where | Problem | Fix |
|---|---|---|---|---|
| 1 | **P0** | `AppShell` mobile header | All 7 nav links + bell rendered inline with `gap-4`. Overflows / wraps into an unusable pile below ~600px. | Bottom tab bar + top bar + More sheet (§2.2). |
| 2 | **P0** | All 9 app modals | Hand-rolled `fixed inset-0 grid place-items-center p-4` → `max-w-md p-8` card. On a 360px phone: 32px of dead gutter, `p-8` inside, submit button under the keyboard, no drag-dismiss, no focus trap. | `ResponsiveModal` (§2.3). |
| 3 | **P1** | `Transactions`, `Admin` | `<table>` in `overflow-x-auto` — horizontal scrolling is the only way to read rows on mobile. | Card reflow (§2.4). |
| 4 | **P1** | Inputs everywhere | `text-sm` (14px) on `<input>` → iOS Safari zooms the viewport on focus and doesn't zoom back. | `text-base` on inputs at `<sm`, or a global `@media (max-width: 640px) { input,select,textarea { font-size: 16px } }`. |
| 5 | **P1** | `Dashboard` header | `h1` is `text-xl`; every other page is `text-3xl md:text-4xl`. Visible inconsistency. | `PageHeader`, `text-2xl sm:text-3xl`. |
| 6 | **P1** | `Transactions` filter bar | `grid md:grid-cols-6` → base is 1 column, so 6 stacked full-width controls including two side-by-side `w-1/2` amount inputs that get tiny. Acceptable but cramped; date inputs overflow at 320px. | `grid-cols-2 sm:grid-cols-3 md:grid-cols-6`; let search span 2. |
| 7 | **P1** | `AuthLayout` | `h1` is `font-display text-5xl` with no responsive step — 48px wraps awkwardly / clips at 320px. Right visual panel correctly `hidden lg:flex`. | `text-4xl sm:text-5xl`. |
| 8 | **P1** | Modals with `max-h-[90vh]` | `vh` includes the area behind the mobile URL bar → content clipped. Also only 4 of 9 modals set any max-height, so `AddExpenseModal` in split mode with 4+ rows overflows the viewport with no scroll on the short ones. | `max-h-[90dvh] overflow-y-auto` on all (handled by `ResponsiveModal`). |
| 9 | **P2** | `Analytics` donut + legend | `flex items-center gap-5` with a `w-36` donut + legend list — does not fit at 360px, legend text truncates to nothing. | `flex-col sm:flex-row`. |
| 10 | **P2** | `Analytics` bar chart | 12-month view = 24 bars at `barSize={28}` → overflows container on mobile. | Drop `barSize` at `<sm`, or cap range to 6 months. |
| 11 | **P2** | `SipeFlow` (landing) | Fixed `viewBox="0 0 400 240"` SVG scales fine, but the `grid grid-cols-4` footer labels (`text-[11px]`) truncate hard at 320px. | Acceptable; consider 2-col at `<sm`. |
| 12 | **P2** | `NotificationsBell` dropdown | `w-80 max-w-[calc(100vw-2rem)]` — good. But `direction`/`align` are passed per-call and on mobile the top-bar bell should open a centered/full-width sheet, not a corner dropdown. | On `<md`, render the panel as a `Sheet side="bottom"`. |
| 13 | **P2** | Page roots | `w-full` with no `max-w` — KPI cards stretch edge-to-edge on a 27" monitor, line lengths get silly. | `max-w-[1400px] mx-auto` via `PageContainer`. |
| 14 | **P2** | `Dashboard` period picker + `Transactions` tabs | `w-fit` pill groups with 4 options + `px-3/px-5` — the "All time / This week / This month / Last month" row is ~360px wide and just fits at 360, clips at 320. | Allow horizontal scroll (`overflow-x-auto` + `flex-nowrap`) or shorten labels at `<sm`. |
| 15 | **P2** | `index.html` viewport | `width=device-width, initial-scale=1.0` — no `viewport-fit=cover`, so `env(safe-area-inset-*)` is always 0. | Add `viewport-fit=cover`. |
| 16 | **P2** | Landing `Nav` | Links `hidden md:flex`; below `md` there is no way to reach How it works / Buckets / Why sipe. Log in / Get sipe still show. | Acceptable (anchors, not critical) — or add a small menu. |
| 17 | **P2** | Fixed-height chart containers `h-64` | Fine, but on very short landscape phones (`<420px` tall) a 256px chart + header + page chrome forces scroll within scroll. | Low priority; `h-56 sm:h-64`. |
| 18 | **P2** | Tap targets | Bare icon buttons at `p-1` (`~24px`): modal close, dashboard card info toggle, `Debts` edit/expand, `Transactions` row edit/delete. | `p-2.5` on mobile or a 44px hit box. |

---

## 4. Implementation order

1. **Foundations** (no visual risk): `index.html` viewport, global 16px mobile input
   rule + `prefers-reduced-motion` + `focus-visible` in `index.css`,
   `PageContainer`, `PageHeader`.
2. **Nav**: rebuild `AppShell` mobile (bottom tabs + top bar + More sheet). Add
   `pb-24 md:pb-10` via `PageContainer`.
3. **`ResponsiveModal`** + migrate the 9 modals + `WhatsNew` + the inline `Links` modal.
   Mechanical once the primitive exists.
4. **Table reflow**: `Transactions` first (highest traffic), then `Admin`.
5. **Charts**: Analytics donut column-stack + bar chart mobile sizing.
6. **Polish pass**: tap targets, period-picker scroll, notification sheet on mobile,
   `AuthLayout` heading, page `max-w`.

Each step is independently shippable. Do them in order; don't batch 1–6 into one PR.

---

## 5. Definition of done (per screen)

A screen is "responsive-done" when, at **320 / 375 / 768 / 1280**:

- No horizontal body scroll.
- Every control is tappable (≥44px) and reachable (not under the keyboard or nav).
- Text is ≥12px and ≥16px for inputs.
- The primary action is visible without scrolling on a 375×667 viewport.
- Tables are cards; modals are drawers.
- Nothing is clipped by the notch or home indicator.
- It looks intentional at every width, not just the two endpoints.
