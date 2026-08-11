# Phot.AI — AI Angles Design System

A recreated design system for Phot.AI's **AI Angles** product suite, sourced from the "AI Angles.fig" Figma file (21 pages, 254 frames).

## What is Phot.AI?

Phot.AI is a suite of AI tools for e‑commerce and performance marketing teams. The attached Figma covers the **AI Angles** vertical — an AI‑powered creative strategy workspace that helps brands generate marketing angles, competitive intelligence, ad creatives, and go‑to‑market strategies from a product URL or brand profile.

The file indicates several connected products / surfaces:

| Surface            | Purpose |
|--------------------|---------|
| **Home**           | Landing dashboard — entry points to every tool |
| **Brand**          | Brand setup: identity, visuals, messaging, design rules, audience (ICPs), store/product catalog |
| **Product Hub**    | Catalog of products the brand sells (grid + list) |
| **Angle Lab**      | Core AI product — generates marketing *angles* (hooks, strategies, scripts) from a product |
| **Ad Intelligence**| Competitor/industry ad monitoring, reports, social media scraping |
| **Trends**         | Trend discovery feed |
| **Social Signal**  | Creator / social listening signals |
| **Competition**    | Competitor benchmarking |
| **Integration**    | Connect ad accounts, stores, channels |
| **Uploads**        | Asset library (images, videos, products) |
| **Your Generations** | Output history |
| **Feedbacks**      | In‑app feedback flow |

## Sources

- **Figma:** "AI Angles.fig" — mounted as a virtual filesystem (21 pages, 254 frames, ~215k nodes). Read with `fig_ls` / `fig_read`. The `/Cover` page has the hero art; `/Components`, `/external-shared`, and per‑page `components/` folders hold the UI kit.
- No codebase was attached. If Phot.AI's React repo is available, please import it via the Import menu so components can be matched 1:1 instead of reconstructed from Figma pseudocode.

## Index

- `README.md` — this file (brand context, content & visual fundamentals, iconography)
- `colors_and_type.css` — design tokens: colors, typography, spacing, radius, shadow, motion
- `assets/logos/` — Phot mark (`phot-mark.svg`), wordmark (`phot-wordmark.svg`), Figma-sourced P glyph (`phot-oscape-glyph.svg`)
- `assets/icons/` — 42 Vuesax-style stroke SVGs at 24×24 (home, search, magicpen, sparkles, shop, trend-up, tick-circle, close-circle, arrow-*, upload, export, etc.)
- `assets/brand/` — `cover-bg.png` (marketing hero), `avatar-sample.png` (sample product image)
- `preview/` — individual Design System cards surfaced in the Design System tab (colors, type, spacing, radius, shadows, buttons, badges, inputs, cards, navbar, menus, logo, icon sheet)
- `ui_kits/ai-angles/` — interactive React + JSX recreation of the AI Angles web app; open `ui_kits/ai-angles/index.html` to click through Home → Angle Labs → Ad Intelligence → Brand Studio
- `SKILL.md` — Agent Skill manifest so this system is drop‑in for Claude Code

> **Fonts.** Not bundled. `Inter Tight` and `Inter` load from Google Fonts in `colors_and_type.css`. Licensed `Euclid Circular A/B` (Swiss Typefaces) are used on the real Phot.AI marketing surfaces — if you own the licence, drop the files into `fonts/` and update the `--font-display` / `--font-body` vars.

---

## CONTENT FUNDAMENTALS

**Voice.** Direct, practical, a little informal. Phot.AI talks to marketers and small‑team founders, not engineers. Sentences are short, instructional, and lean on active verbs ("Generate", "Create", "Optimise", "Publish"). Marketing copy is confident but avoids hype words like "revolutionary" or "unleash".

**Person.** Second‑person "you" throughout ("**what you Creating today?**", "Upload **your** product image"). Features speak from the product's perspective using first‑person plural sparingly ("we'll pull in your assets"). Never "I".

**Casing.** Sentence case is the default for everything — section titles, buttons, menu items, form labels. Title Case appears only on proper product names (**AI Angles**, **Angle Labs**, **Ad Intelligence**, **Social Signal**). Observed inconsistencies in the file (e.g. "what you Creating today?", "Give it a Try") are artefacts — when in doubt, sentence case.

**Tone knobs.**
- *Empowering, not preachy.* "Create Your Idea" beats "Let us help you create".
- *Concrete over abstract.* "Generate angle", "Optimise listing" — the CTA names the outcome.
- *UK/US English mix* (Optimise / Personalise with an S) — keep British spellings for product surface copy, US spellings for new US‑facing marketing.

**Emoji.** Used sparingly and only decoratively — the Cover uses 🏞️ as a mascot glyph; product surfaces do NOT use emoji in buttons, labels, or body text. Icons come from the Vuesax set instead.

**Specific examples from the file:**
- Hero heading: `what you Creating today?`
- Tool card titles: `Angle Labs`, `Ad Intelligence`, `Brand Studio`
- Tool card subtitles: `Upload your product image or simply describe your LinkedIn campaign goal`
- CTA buttons: `Give it a Try`, `Generate angle`, `Optimise listing`, `Create Your Idea`
- Navigation: `Overview`, `Competition`, `Social Signal`, `Trends`, `Performance`
- Scoring/metric chips: `90/100` (green pill, bold), used inline next to section labels

**Microcopy patterns.**
- Chip‑shaped badges above titles label the *type of action*: `Create Your Idea`, `Analyse`, `Publish`.
- Inline score pills (`90/100`) sit next to section names to show confidence/health.
- Empty states speak as instructions, not apologies: "Add your first product to get started" pattern.

---

## VISUAL FOUNDATIONS

### Color

The palette is dominated by a single saturated **Phot Purple** (`#6729F3`) against **pure white** surfaces and near‑black text. It's a high‑contrast, product‑first palette — not pastel, not neon.

- **Brand:** Phot Purple `#6729F3` (used 9,435× across the file). A lighter lavender `#9E87FE` is used on dark backgrounds (Cover page, filled avatars).
- **Text:** Near‑black `#1A1A1A` (body, titles) and `#33323A` (secondary ink). Muted is `#8B8C8F`, disabled is `#9B9AA1`.
- **Surface:** White `#FFFFFF` is the default canvas. `#F3F4FF` is a tinted lavender surface used for selected/highlight states. `#FBFBFB` / `#F3F3F3` / `#ECECEC` for subtle fills and rails.
- **Borders:** `#D9D9D9` primary, `rgba(56,54,71,0.15)` hairlines.
- **Semantic:**
  - Success `#27A644` (pill text) with tint `#DEF2E5`
  - Info/Link `#027BFF`
  - Danger `#F34129`
  - Highlight lavender tint `#E5CAFF`
- **Dark accent:** `#290D68` (Cover page indigo) with magenta blob overlay `rgba(252,79,246,0.5)` at 20% opacity.

The brand mark itself is a 24×24 purple rounded square with a stylized white "P" glyph. See `assets/logos/`.

### Type

- **Display / product UI:** `Inter Tight` — Regular 400, Medium 500, SemiBold 600, Bold 700, Black 900. Used at 12/13/14/16/20/26/32/36/50 px.
- **Body / legacy:** `Inter` — Regular, Medium, SemiBold, Bold.
- **Marketing / cover display:** `Euclid Circular B` Bold at 76–80 px (Cover hero). `Euclid Circular A` Regular/Medium appears on card subtitles inside product surfaces — these are marketing‑flavoured moments.
- **Weights in use:** 400 body, 500 UI labels & buttons, 600 section headings, 700 bold titles & score pills.
- **Letter‑spacing:** `-0.02em` on large display (36 px+). `-0.15 px` on 14 px UI labels. `+0.01 em` / `+0.02 em` on bold score pills (`90/100`) and small caps buttons.
- **Line‑height:** `100%` on display/title, `20 px` (i.e. ~1.4) on 14 px body.

> **Substitution flag:** `Euclid Circular A` and `Euclid Circular B` are commercial (Swiss Typefaces) and no files ship with the Figma. We substitute **Inter Tight** (Google Fonts) for Euclid Circular B and **Inter** for Euclid Circular A as the closest geometric sans matches with similar x‑height. **Please upload the licensed Euclid files to `fonts/` if Phot.AI owns them.**

### Spacing & rhythm

- 4 px base grid. Common steps: 4, 8, 12, 14, 16, 20, 24, 32, 48.
- Card padding: typically 24 or 32 px. Sidebar item padding: 8 px vertical × 12 px horizontal.
- Section gaps: 32 px between major blocks, 20 px between cards, 12 px between list items.

### Radius

- 6 px — small chips, icon buttons
- 8 px — inputs, secondary buttons, sidebar items
- 12 px — card corners (standard)
- 16 / 16.79 px — feature cards (tool cards on Home)
- 46.64 px — pill buttons ("Create Your Idea" chip)
- 50% — avatars, circular status dots

### Elevation / shadow

Shadows are understated and used only on raised surfaces.

- `0 3.731px 171.629px rgba(0,0,0,0)` — feature card ambient glow (near‑invisible, exists for depth cue)
- `0 1px 2px rgba(0,0,0,0.05)` — resting UI elements
- `0 4px 12px rgba(0,0,0,0.10)` — menus, popovers
- `0 8px 24px rgba(0,0,0,0.15)` — modals

### Borders

1 px hairlines are the norm — `rgba(56,54,71,0.15)` on dividers, solid `rgb(217,217,217)` on card outlines. Selected/focus states swap to 1 px `#6729F3`. Active navigation items use a 1 px `#1A1A1A` border instead of a fill.

### Backgrounds

- **Product surfaces:** flat white. No repeating textures.
- **Marketing/Cover:** indigo `#290D68` base with oversized blurred blob shapes (purple + magenta at low opacity) — a "AI creativity" motif that never appears inside the product.
- **Top header of Home:** a soft vertical gradient from transparent → `rgba(115,41,243,0.23)` behind the first 70 px of the canvas, creating a purple halo under the nav.
- **Full‑bleed imagery:** reserved for feature hero cards (preview thumbnails inside tool cards — `#17181C` dark frames containing product screenshots).

### Animation

The Figma doesn't express animation, but the visual language implies: subtle fade + 4–8 px translate entrances; 150–200 ms hovers; no bounces, no dramatic scale. Loaders are horizontal shimmer bars (seen in `/Brand/Loader/`), never spinners for content.

### Hover / press states

- **Hover:** 4–6% darkening of fills OR `+6%` lavender tint on white. Borders transition from `#D9D9D9` → `#6729F3`. Text links underline on hover.
- **Press:** 2 px nudge down + inner shadow `inset 0 1px 2px rgba(0,0,0,0.08)`. No scale transform.
- **Focus:** 2 px `#6729F3` outline with 2 px white offset, not a glow.

### Transparency & blur

Transparency is rare. Used for:
- Muted text `rgba(26,26,26,0.7)` for nav non‑active items
- Dividers at 15% alpha
- Cover blob shapes at 20% alpha

Glassmorphism / backdrop‑blur: **not present** in the product surfaces. Do not add it.

### Cards

The canonical card is: **white fill, 12 px radius, 1 px `#D9D9D9` border, no shadow**. Tool cards on Home step up to **16.79 px radius** and include an inner dark preview frame (8 px radius, `#17181C` fill) plus a centred chip → title → subtitle → pill‑CTA composition.

### Layout rules

- Fixed top nav: 56 px (Home) or 44 px (product surfaces with secondary tabs).
- Fixed left sidebar: 256 px wide (expanded) with logo at top.
- Content canvas: 1169 px max width on 1440 viewports.
- Product surfaces use a **top nav + sidebar + canvas** pattern. Cover/marketing pages break out to full‑bleed.

### Imagery vibe

Product screenshots inside tool cards are warm, photography‑forward, saturated. People & lifestyle shots for audience/ICP mocks. No grainy/filmic treatments, no B&W. Illustrations are minimal — the brand relies on UI, not drawings.

---

## ICONOGRAPHY

**Primary set: Vuesax Linear.** The Figma file is saturated with `vuesax/linear/*` icons (`text-block`, `folder-cloud`, `search-normal`, `add-square`, `path`, `color-swatch`, `magicpen`, `home`, `setting-3`, `profile-2user`, `audience-favorite`, `task-square`, `gallery-add`, `video-play`, `align-horizontally`, `align-vertically`, `arrow-backward`, `info-circle`, `category`, `filter`, `export`, `layer`, `grid`). Stroke‑based, 1.25–1.5 px weight, 18–24 px at UI sizes.

A handful of **Vuesax Bold** glyphs appear for filled status indicators: `tick-circle`, `close-circle`, `shop`, `coin`.

**Strategy for this system:**
1. Vuesax icons are a commercial React/SVG set; no CDN. We pull the **Iconsax** family via CDN (`iconsax-react` / static SVG mirror) — it's the same source set, same stroke, same shapes.
2. Where a direct match exists, we use Iconsax names (`Home`, `SearchNormal1`, `AddSquare`, `Magicpen`, `ColorSwatch`, `FolderCloud`, `TextBlock`, `Setting3`, `Profile2User`, `PathSquare`, `TaskSquare`, `GalleryAdd`, `VideoPlay`).
3. Where we can't pull Iconsax easily, we substitute **Lucide** at matching 1.5 px stroke — flag: this is a substitution, swap in real Vuesax SVGs if Phot.AI's icon export is available.

**Emoji.** Not used as icons. One decorative emoji exists on the Cover page (🏞️) — ignore it for product work.

**Unicode glyphs.** Not used in UI.

**Logo.** The Phot.AI mark is a purple 24×24 rounded square (`#6729F3`) with a white stylized "P" glyph. Full wordmark pairs the mark with "Phot.AI" in Euclid Circular B / Inter Tight SemiBold. See `assets/logos/`.

**Raw SVGs on disk** (copied from Figma): see `assets/icons/` for the P glyph and a starter pack of Vuesax SVGs.
