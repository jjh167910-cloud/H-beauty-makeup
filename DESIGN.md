# حنانه بیوتی — Design System

The visual language of the Hananeh Beauty app. Source of truth lives in code:

| Layer | File |
| --- | --- |
| Tokens (colour, type, radius, elevation, motion) | `src/styles/tokens.css` |
| Base + text styles (`t-*` utilities) | `src/styles/base.css` |
| Components (`.btn`, `.chip`, `.card`, `.field` …) | `src/styles/components.css` |
| Motion, View Transitions, scroll-driven effects | `src/styles/motion.css` |
| Icon set | `src/components/salon/icons.tsx` |
| Brand mark & wordmark | `src/components/salon/logo.tsx` |
| Living style guide | open the app at `#/design` (also linked from Profile) |

## Brand

- **Name:** «حنانه بیوتی» / HANANEH BEAUTY — always written in full.
- **Wordmark:** the Persian name set in Nastaliq calligraphy, with the Latin name in tracked Bodoni capitals below.
- **Mark:** the atelier **arch** framing a calligraphic **ح**. The arch is the signature shape across the UI: hero, look cards, avatars, date picker, success state.

## Typography

| Role | Family | Why |
| --- | --- | --- |
| UI & body | **Estedad** (variable, 100–900) | Contemporary Persian sans-serif with excellent legibility at light weights |
| Brand & accents | **Noto Nastaliq Urdu** (variable) | Authentic Persian Nastaliq calligraphy for the wordmark and one accent phrase per screen |
| Latin accents | **Bodoni Moda** (optical size axis) | Fashion-house serif for the Latin wordmark, seal text and service names |

Text styles are composite tokens, named by role: `t-display`, `t-title-1…3`, `t-headline`, `t-body`, `t-callout`, `t-footnote`, `t-caption`, `t-eyebrow`, `t-latin`, `t-calligraphy` and `t-numeric`.

Rules:

- Headlines are **light** (200–300). Hierarchy comes from size and space, not boldness.
- Each screen gets at most one Nastaliq phrase, in gold.
- Never apply letter-spacing to Persian text; tracking breaks cursive joins.
- Prices use proportional figures (tabular figures widen the Persian decimal separator). Use `t-numeric` only for counters and times.

## Colour

Authored in **OKLCH** in three tiers:

1. **Primitives:** the porcelain neutral ramp, champagne gold, rose, sage and garnet.
2. **Semantic roles** (exposed to Tailwind, e.g. `bg-canvas`, `text-ink-2`, `text-gold-ink`):

| Role | Use |
| --- | --- |
| `canvas` / `surface` / `raised` / `sunken` | Page, cards, lifted elements, recessed fills |
| `ink` / `ink-2` / `ink-3` | Primary, secondary and tertiary text |
| `line` / `line-2` | Hairline and stronger borders |
| `gold` / `gold-ink` / `gold-soft` | The single accent; `gold-ink` meets contrast for text |
| `rose` | Saved / love states only |
| `sage` / `garnet` | Open, closed and draft statuses |
| `inverse` / `noir` / `champagne` | Dark surfaces and the text on them |

3. **Component tokens:** tab-bar height, dock offset, foil gradient, glass tint.

Dark mode remaps the semantic roles under `:root[data-theme="dark"]`; components never hard-code colours.

## Shape, depth, materials

- **Radius scale:** `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `pill`, plus `.arch` (semicircular top).
- **Elevation:** `shadow-1…4` and `shadow-gold`, all warm-tinted and layered.
- **Liquid Glass:** `.glass` and `.glass-dark` (translucent blur with specular edges), used for the tab bar, docks and controls over photos. They fall back to solid fills under `prefers-reduced-transparency`.
- **Foil:** the animated champagne gradient, reserved for the main call to action, the booking button and success marks.

## Iconography

Phosphor icons through one `<Icon name="…" />` API with semantic names (`book`, `compare`, `finder`, plus one icon per service category). Weights:

- `light` by default
- `fill` for active and pressed states
- `duotone` for feature tiles and list icons

## Components

Variants are data attributes and states are ARIA attributes, so styling follows semantics:

```html
<button class="btn" data-variant="gold" data-size="lg">…</button>
<button class="icon-btn" data-variant="glass" aria-pressed="true">…</button>
<button class="chip" aria-pressed="true">…</button>
<div class="card" data-variant="inverse">…</div>
<span class="status" data-tone="sage">…</span>
```

React wrappers live in `src/components/salon/ui.tsx`: `Button`, `IconButton`, `Chip`, `PageHead`, `SectionHead`, `Media`, `Avatar`, `Sheet`, `EmptyState`, `Seal` and `Ornament`.

## Motion

- **Easing:** `--ease-out` for movement, `--ease-spring` (a CSS `linear()` spring) for the tab-bar lens and success pop.
- **View Transitions:** directional slides between tabs, and a shared-element morph from a tapped look into the Discover feed.
- **Scroll-driven animations:** section reveals and hero parallax.
- **`@starting-style`:** entry animations for docks and overlays.
- Everything collapses under `prefers-reduced-motion`.

## Modern CSS used

OKLCH and `color-mix()`, cascade layers, Tailwind v4 `@theme` and `@utility`, logical properties throughout (RTL-first), container queries (`cqw`), `:has`-free ARIA state styling, `field-sizing: content`, `interpolate-size`, `text-wrap: balance / pretty`, `linear()` easing, `@starting-style`, `animation-timeline: view()`, and the View Transitions API.
