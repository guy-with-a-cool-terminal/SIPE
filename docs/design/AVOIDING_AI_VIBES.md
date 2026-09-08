# Not looking "vibe-coded": a production-readiness guide

SIPE was built fast with AI assistance. That is fine, and normal now. What separates a
credible product from an obvious "I generated this last weekend" build is not the amount
of AI used, it is whether the **hundred small decisions** were made deliberately and
consistently. This doc is the checklist for that.

Read alongside [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md). Where that doc says *what* the
system is, this one says *what to avoid* and *how to tell if you're done*.

---

## Part 1 — The tells. What makes software read as AI-generated.

### 1.1 Visual tells

| Tell | What it looks like | The fix |
|---|---|---|
| **Generic gradient hero + glassmorphism everywhere** | Purple-to-blue radial glow, `backdrop-blur` on every surface, a floating card with a subtle border. | SIPE already leans on this hard (`--gradient-hero`, `.glass`, `.glow`, `.noise`, `.animate-pulse-glow`). Keep the ambient background, but stop reaching for blur+glow as the answer to "make this look designed". Solid surfaces with one clear hierarchy read as more confident. |
| **Inconsistent spacing** | `p-6` here, `p-8` there, `p-7` in one modal, `mb-5` vs `mb-6` vs `mb-8` for the same kind of gap. | Pick from the small vocabulary in DESIGN_SYSTEM §4.1 and grep for offenders. SIPE has `p-7` in exactly one file (`WhatsNew`) — that is the tell. |
| **Type scale drift** | The word "Dashboard" is `text-xl`, "Transactions" is `text-4xl`, on sibling pages. | One `PageHeader` component. See DESIGN_SYSTEM §3.2. |
| **Emoji as UI** | ✅ ✨ 🚀 in headings, buttons, toasts. | SIPE mostly avoids this (good). The `✓` and `✗` in `TransactionDetailSheet` / `AddExpenseModal` split math are borderline — prefer a lucide `Check` icon. |
| **Over-rounded + over-shadowed** | `rounded-3xl` on everything, drop shadows stacked three deep. | Radius has a job: `xl` controls, `2xl` panels, `3xl` modals. Not decorative. |
| **The default component library look** | Untouched shadcn/ui: the exact default border, the exact default `ring`, `sonner` bottom-right with no styling. | SIPE has a real token layer, so this is mostly handled — but audit that every `ui/` primitive actually picks up SIPE tokens and isn't rendering stock slate. |
| **Icons that don't match** | Mixed icon weights, random icon choices ("why is 'Debts' a landmark?"). | One set (lucide), one size rhythm (`size-4` inline, `size-5` headers), and icons that describe the noun. `Landmark` for Debts is a stretch — `HandCoins` or `Scale` fits better. |
| **Centered everything** | Every section `text-center max-w-2xl mx-auto`. | Fine for a landing page. In the app, left-align and use real layout. |

### 1.2 Copy tells

| Tell | Example | The fix |
|---|---|---|
| **Marketing voice inside the product** | "Compounding doesn't care about your invoice schedule." on a landing card is great. The same register inside a settings panel is not. | App copy is functional and terse. Marketing copy has personality. Don't blur them. |
| **Exclamation marks** | "Saved!" "Nice work!" | Toasts state what happened: "Deposit recorded", "Split into your buckets". |
| **Fake enthusiasm in empty states** | "No transactions yet — but exciting things are coming! 🎉" | "No transactions yet. Paystack payments land here automatically." (SIPE already does this well — protect it.) |
| **Hedging / LLM throat-clearing** | "It's worth noting that…", "Simply click…", "Please note that…" | Cut. "Delete this deposit and add a new one" not "You'll simply need to delete this deposit and then add a new one". |
| **Inconsistent terminology** | "deposit" vs "income" vs "payment" vs "earning" for the same thing. | Pick one per concept and put it in a glossary. SIPE mixes "deposit", "income", "earnings", "payment received" — decide. |
| **Em-dashes everywhere** | The classic LLM punctuation. | Repo rule already: no em-dashes in copy. Use `·`, commas, parens. |

### 1.3 Behavioral / build tells

| Tell | Why it signals "unfinished" | The fix |
|---|---|---|
| **No loading skeletons** | Bare "Loading…" text, or layout that jumps when data arrives. | `src/components/ui/skeleton.tsx` exists and is unused. Every data view needs a skeleton that matches its final shape. |
| **No error states** | A failed fetch shows nothing, or an infinite spinner. | Every `supabase` call in a page needs an error branch that renders a retry affordance, not just `toast.error`. |
| **Console noise** | `console.log`, React key warnings, `act()` warnings, hydration mismatches. | `npm run build` and the browser console must be clean. `AddExpenseModal` has an `eslint-disable` for exhaustive-deps — each of those is a small debt. |
| **Dead routes / TODO UI** | Buttons that do nothing, "Coming soon" tabs. | `Settings` "Integrations" tab and `sync-account` are explicitly stubbed — make sure the UI says so plainly and doesn't look broken. |
| **The tab title never changes** | Every route is "SIPE: automatic money allocation for freelancers". | Per-route `document.title`. |
| **No focus management** | Tab key does nothing useful, modals don't trap focus, closing a modal drops focus to `<body>`. | Move modals onto Radix/vaul primitives (they handle this). |
| **Timezone / rounding bugs** | `new Date(dateString)` parsed as UTC, money that doesn't sum to the parent. | SIPE's split math is tested (good). The `new Date(fd.get("date"))` pattern in modals parses `YYYY-MM-DD` as UTC midnight, which can land on the previous day in UTC+3 — worth an audit. |
| **One breakpoint** | Works at 1440px and 375px, broken at every width between. | See RESPONSIVE.md. Test at 320, 360, 390, 768, 1024, 1280, 1440. |
| **No keyboard/paste handling on forms** | Pasting "KES 40,000" into a number field silently fails. | Accept and sanitize, or say why not. |
| **Identical placeholder data / lorem** | Seeded demo data that's obviously fake. | SIPE uses real-shaped examples ("Client X — Logo design"). Keep that. |

---

## Part 2 — Production-readiness checklist

Tick these before calling any surface "done". Grouped by area.

### 2.1 Consistency (the highest-leverage category)

- [ ] Every protected page uses `PageContainer` + `PageHeader`. Zero hand-rolled `p-6 md:px-8…` roots.
- [ ] Every modal is `ResponsiveModal` or `ConfirmDialog`. Zero hand-rolled overlays.
- [ ] Every money value goes through `formatKES()`.
- [ ] Every bucket reference goes through `BUCKET_META`.
- [ ] The field input class is imported from one place, not redefined per file.
- [ ] The swatch palette is imported from one place.
- [ ] One spacing vocabulary (DESIGN_SYSTEM §4.1). Grep for `p-7`, `gap-5`, `mb-7`, stray one-offs.
- [ ] One type scale (DESIGN_SYSTEM §3.1). Grep every `text-3xl`/`text-4xl`/`text-5xl` in `src/pages` and `src/components/app`.
- [ ] Button variants match the four in DESIGN_SYSTEM §5.1. No bespoke button styling.
- [ ] Sentence case everywhere. No Title Case headings or buttons.

### 2.2 Responsive (see RESPONSIVE.md for the full contract)

- [ ] Mobile nav works below 600px (current inline-links header does not).
- [ ] No horizontal body scroll at 320px on any route.
- [ ] Tables reflow to cards below `md`.
- [ ] Modals are bottom drawers below `md`; submit button reachable above the keyboard.
- [ ] Inputs are ≥16px on mobile (no iOS focus-zoom).
- [ ] Charts fit their container at 360px (no clipped bars, legend wraps).
- [ ] Content respects safe-area insets (notch, home indicator).
- [ ] Touch targets ≥44px.
- [ ] Tested at 320 / 360 / 390 / 768 / 1024 / 1280 / 1440.

### 2.3 States

- [ ] Loading: skeleton matching final layout, not "Loading…".
- [ ] Empty: says what fills it, offers the action.
- [ ] Error: message + retry, survives offline.
- [ ] Partial: a list with 1 item looks right; with 200 items it paginates or virtualizes.
- [ ] Optimistic updates roll back visibly on failure (NotificationsBell does this well — copy the pattern).
- [ ] Disabled/submitting: buttons show it and can't double-fire (`if (saving) return` is used inconsistently — make it universal).

### 2.4 Accessibility

- [ ] `focus-visible` ring on every interactive element.
- [ ] Every icon-only control has an accessible name.
- [ ] Modals trap + restore focus (free from primitives).
- [ ] Color is never the only signal.
- [ ] Contrast AA for all text at its rendered size.
- [ ] `prefers-reduced-motion` honored.
- [ ] Forms: real `<label>` association (SIPE wraps inputs in `<label>` — good), inline error text tied to the field.
- [ ] Keyboard: full app usable without a mouse.

### 2.5 Performance & polish

- [ ] `npm run build` clean, no warnings.
- [ ] Browser console clean on every route.
- [ ] Route-level code splitting (`React.lazy`) — the app currently imports all 11 pages eagerly in `App.tsx`.
- [ ] Fonts: `font-display: swap` is set (good). Consider self-hosting Inter to drop the render-blocking Google Fonts request.
- [ ] Images have explicit `width`/`height` or `aspect-ratio` to avoid layout shift (`logo.png` at `size-8` is fine; check any future ones).
- [ ] No layout shift when data loads (skeletons reserve space).
- [ ] Lighthouse: Performance ≥90, Accessibility ≥95, Best Practices 100 on `/dashboard` (throttled mobile).
- [ ] `react-query` actually used for caching — several pages fetch directly in `useEffect` with a manual `reloadKey`, bypassing the `QueryClient` that's already set up. Not wrong, but inconsistent and misses dedupe/refetch.

### 2.6 Trust signals (this is a money app)

- [ ] Numbers reconcile visibly (SIPE's `Δ` reconciliation row is exactly right — more of this).
- [ ] Destructive actions confirm and say what else they affect ("removes the transaction and its splits").
- [ ] Money math is tested (splits are — extend to reconciliation, projections, period math).
- [ ] Dates display in the user's locale + timezone consistently (`en-KE` is used, but parsing is UTC — audit).
- [ ] No flash of wrong data (e.g. showing KES 0 before the real balance loads — use a skeleton, not a zero).
- [ ] Errors from Supabase are translated to human text, not raw Postgres messages, for expected cases (unique violation, RLS denial).
- [ ] The "read-only, delete and re-add" constraints (deposit amounts) are explained where the user hits them (EditTransactionModal does this well).

---

## Part 3 — How to work so it stays consistent

1. **Extract on the second copy, not the third.** The `field` const is in 5 files; the
   swatch array in 2; the modal shell in 9. Each was a reasonable local choice that
   nobody went back to consolidate. Budget time for consolidation passes.
2. **Grep before you build.** Before adding a KPI card, `grep -rn "uppercase tracking-wide"`
   and match what's there.
3. **One reference implementation per pattern.** "Transaction rows look like the ones on
   the Dashboard." "Modals look like `DepositModal` (post-migration)." Name the canonical
   example in the PR.
4. **Review diffs for new tokens.** Any new hex, any new `text-[Npx]`, any new
   `duration-*` in a PR is a yellow flag — is it justified or is it drift?
5. **Test the in-between widths.** Most AI-built responsive bugs live between 400 and
   900px, because the model only "saw" phone and desktop.
6. **Read the copy out loud.** If it sounds like a pep talk or a disclaimer, rewrite it.
7. **Keep this doc honest.** When you fix an item, delete it from the "drift" and "tells"
   tables so the doc reflects reality.

---

## Part 4 — SIPE-specific verdict (2026-09)

What already reads as deliberate and should be protected:

- The four-bucket color identity and badge pattern — consistent everywhere.
- Reconciliation UX (`Accounts ... Buckets ... Δ`) — genuinely good, a real product idea.
- Empty-state copy — functional, no fake hype.
- Tested split math with a documented rounding rule.
- Sentence case and the dry voice in the app.
- `EditTransactionModal` explaining *why* deposit amounts are locked.

Fixed in the 2026-09-08 pass:

- ~~Nine bespoke modal overlays~~ → one `ResponsiveModal` (drawer/dialog), all migrated.
- ~~`h1` sizes ranging from `text-xl` to `text-4xl`~~ → one `PageHeader`, `text-2xl sm:text-3xl`.
- ~~Mobile nav broken below ~600px~~ → bottom tab bar + top bar + "More" sheet.
- ~~Tables only scroll horizontally on mobile~~ → Transactions + Admin reflow to cards.
- ~~No loading skeletons~~ → `Skeletons.tsx`, adopted on the main data views.
- ~~No `prefers-reduced-motion`, thin focus states~~ → both added to `index.css` base layer.
- ~~Every browser tab titled identically~~ → `usePageTitle` on all routes.
- ~~All routes eagerly imported~~ → `React.lazy` per route (main bundle 1.22 MB → 617 kB).
- ~~`text-green-500` in one modal~~ → `text-primary`.
- ~~`p-7` in one modal, `p-8` in the rest~~ → modal padding centralised in `ResponsiveModal`.

Still open (see PROGRESS.md): unlabeled icon buttons (partial), the `react-query`
inconsistency, skeletons on the long tail of lists, a visible mobile-drawer close button.

None of this was hard. It was a consistency pass, not a redesign.
