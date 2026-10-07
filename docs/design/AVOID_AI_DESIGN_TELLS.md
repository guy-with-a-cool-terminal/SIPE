# Avoid AI design tells

The rule set SIPE (and every Brian AI Studio product) is built against. Apply it while
building, then run the checklist at the end before shipping any landing page or new screen.
Companion to [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) and [AVOIDING_AI_VIBES.md](./AVOIDING_AI_VIBES.md).

AI tools build the statistical median of every page they were trained on: gradient
headlines, a badge above every heading, three identical icon cards, numbered steps,
fade-ins on everything. Visitors read that look as generic and trust the product less.

**How SIPE applies it (2026-10-07):** light theme, one accent (logo green), flat surfaces,
sections separated by whitespace and thin rules, a real invoice rendered by the product's
own `DocumentPaper` instead of a mock-up, and only claims the product can back up.

## Rules

### Color and type
- **No gradient text.** Headlines, numbers and stats in one flat color. One accent color, used sparingly.
- **No gradient or glowing buttons.** Flat fill for the one primary button, outline or text for the rest.
- **No colored glows or heavy colored shadows.** Subtle neutral shadow or a 1px border, if anything.
- **No default "AI purple"** (indigo/violet) unless it is genuinely the brand.
- **One or two typefaces.** No serif-italic "accent word" dropped into a sans headline.
- **Sentence case headings.** Not Title Case, and no ALL CAPS section labels.
- **Body text meets contrast.** At least 4.5:1, including on dark sections.

### Layout
- **No badge or eyebrow pill above headings.**
- **No two-tone heading on every section.** At most once, in the hero.
- **No identical icon cards everywhere.** Vary the treatment: plain text blocks under a top rule, a two-column list, a table, a real image. Keep icons only where they help navigation.
- **No decorative numbering** ("01 / 02", "Step 1:", numbered circles). Let verb titles carry the order, or use a line with markers.
- **No colored left border on cards or quotes.**
- **No stat banner rows** full of big, unsourced numbers.
- **Not everything centered**, and **not everything in a rounded card.**

### Motion
- **No fade-in on every element as it scrolls in.**
- **No constant pulsing, bouncing or floating**, no parallax, no animated backgrounds.
- **At most one signature animation**, with a purpose, respecting `prefers-reduced-motion`.
- **Hover states must do something** and ease in, not snap.

### Imagery
- **Real product screenshots and real output beat illustrations.**
- **No fake UI mockups** (made-up dashboards, ledgers, chat bubbles) standing in for the product.
- **No decorative line-icon illustrations**, no emoji as section icons.

### Copy
- **No em dashes.** Use a period, comma or colon.
- **No "It's not X, it's Y"**, no stacked triples, no "Unlock", "Elevate", "Seamless", "Revolutionize", "Supercharge".
- **No made-up numbers, testimonials, logos or certifications.** If a claim cannot be checked against the product or the business, cut it.
- **Say the specific thing.**
- **Write in the company's voice and for its market.**

### Structure
- **Do not clone a competitor's page section for section.** Borrow craft, not identity.
- **Lead with what only this product can say.**
- **Fewer sections, each earning its place.**

## Review checklist

- [ ] No gradient text (`bg-clip-text`, `text-gradient`, `background-clip: text`)
- [ ] No gradient or glow buttons (`bg-gradient-to-*`, colored `box-shadow`)
- [ ] No badge or eyebrow above headings
- [ ] Two-tone accent heading used at most once
- [ ] No grid where every card is icon + title + text, except navigational link cards
- [ ] No "01 / 02" or "Step 1" numbering
- [ ] No fade-in-on-scroll wrappers on every block
- [ ] At most one animation, with `prefers-reduced-motion` handled
- [ ] Headings in sentence case, no ALL CAPS labels (`grep -rn uppercase src`; inputs for codes like KRA PIN are the exception)
- [ ] Zero em dashes in copy (`grep -rn "—" src`, comments excepted)
- [ ] Every number, name, logo and certification is real and checkable
- [ ] At least one real screenshot or real product output per key page
- [ ] The page says at least one thing a competitor could not put on their site
- [ ] Body text contrast at least 4.5:1, including dark sections
