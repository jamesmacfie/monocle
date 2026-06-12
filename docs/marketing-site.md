# Monocle — One-Page Marketing Site Spec

<!-- Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 -->

This is a complete build spec for the Monocle marketing one-pager, written to be
handed to a designer and a developer. It contains the design direction, the full
visual language (tokens included), the page architecture, the complete HTML
skeleton, all final copy, screenshot capture instructions, and interaction
specs. Unlike the rest of `docs/`, this file describes a **site to be built**,
not current extension behavior.

Design system stamp (goes at the top of the site's CSS, verbatim):

```css
/* Hallmark · macrostructure: Workbench · genre: atmospheric · nav: N9 · footer: Ft5
 * theme: custom · vibe: "late-night, keyboard-lit, phosphor mint, precise"
 * paper: oklch(15% 0.015 270) · accent: oklch(79% 0.16 167)
 * display: Bricolage Grotesque · body: Geist · mono: Geist Mono
 * axes: dark / geometric-sans / chromatic-phosphor
 * studied: no · context: inferred · 2026-06-12
 */
```

---

## 1. Brief

| | |
| --- | --- |
| **Audience** | Developers and keyboard-first power users — the Raycast / Vim / VS Code crowd. They already believe in command palettes; they need to see that this one is real, fast, and theirs. |
| **One job** | Get the visitor to install the extension (Chrome Web Store / Firefox AMO). Everything on the page serves that single action. |
| **Tone** | Technical, late-night, precise. The page should feel like the product: a dark room lit by a phosphor-mint prompt. Confident, never shouty. |
| **Shape** | Workbench — the product screenshots *are* the content. Short functional headings, real captures, minimal marketing prose. Reference register: Raycast, Linear, Arc. |

**Positioning line** (use verbatim in meta description, store listings, OG image):

> A command palette for your browser.

**Elevator paragraph** (source of truth for all derivative copy):

> Monocle puts a fast, keyboard-driven command palette on top of every page you
> visit and on your new tab page. Open it with a shortcut, start typing, and run
> browser actions, jump through history and bookmarks, switch themes, manage
> Firefox containers, or trigger commands a website has added for itself. No
> mouse required. Works in Chrome and Firefox.

### Honest-copy rules (non-negotiable)

- **No invented numbers.** No user counts, no "10× faster", no star ratings.
  There are no metrics yet; the page doesn't pretend otherwise.
- **No testimonials, no logo wall.** None exist. Skip the section entirely
  rather than fabricate it.
- **Every claim on the page is in the approved-claims table** (§ 10). If a
  claim isn't there, it doesn't ship.
- **No banned phrases:** "seamless", "supercharge", "unleash", "empower",
  "reimagine", "next-generation", "in today's digital landscape",
  "where X meets Y".

---

## 2. Visual language

### 2.1 Color — tokens (complete, copy verbatim)

The palette is built from the two real brand inputs: the dark slate of the
product's palette panel, and the mint of the brand mark
(`public/monocle-mark.svg`, `#12e0a0`). All colors are OKLCH; never inline a
raw color value in the page CSS — add a token instead.

```css
:root {
  /* paper — dark slate, tinted toward the product panel hue (270°) */
  --color-paper:    oklch(15% 0.015 270);  /* page background */
  --color-paper-2:  oklch(19% 0.018 270);  /* elevated: demo palette, sticky bar, code blocks */
  --color-paper-3:  oklch(24% 0.020 270);  /* second elevation: kbd chips, hovered rows */

  /* ink */
  --color-ink:      oklch(93% 0.008 260);  /* headings, primary text */
  --color-ink-2:    oklch(76% 0.010 260);  /* body text */
  --color-muted:    oklch(60% 0.012 260);  /* captions, meta, annotations */

  /* rules */
  --color-rule:     oklch(30% 0.015 270);  /* hairlines, figure borders */
  --color-rule-2:   oklch(25% 0.015 270);  /* secondary dividers */

  /* accent — brand mint (#12e0a0 normalized to OKLCH) */
  --color-accent:     oklch(79% 0.16 167); /* CTA fill, active row indicator, mark */
  --color-accent-ink: oklch(17% 0.020 270);/* text on accent fills */
  --color-focus:      oklch(82% 0.19 167); /* :focus-visible rings only */

  /* atmospheric bloom (background only, see § 8.3) */
  --bloom-mint: oklch(79% 0.16 167 / 0.07);
}
```

**Accent discipline.** The mint appears on: the logo mark, the primary CTA
fill, the active row in the demo palette, link underlines on hover, and the two
background blooms. That's it — under 5 % of the page's surface. The accent
reads as a phosphor glow precisely because it is scarce. Never set headings or
body text in mint, never carpet a section in it, never use gradient text.

**Dark canvas discipline.** The whole page is dark. No white sections, no
light-mode variant in v1. Elevation is expressed by stepping paper lightness
(`paper` → `paper-2` → `paper-3`), not by drop shadows on hairlines.

### 2.2 Typography

Three faces, all free, self-hosted woff2 (no Google Fonts request at runtime):

| Role | Face | Weights | Used for |
| --- | --- | --- | --- |
| Display | **Bricolage Grotesque** | 600, 800 | H1, section headings, footer statement, wordmark |
| Body | **Geist** | 400, 500 | Lede, paragraphs, captions, buttons |
| Mono | **Geist Mono** | 400, 500 | kbd chips, command names in the demo palette, code block, annotations, meta lines |

```css
:root {
  --font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --font-body:    "Geist", system-ui, sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, monospace;

  --text-xs:  0.75rem;
  --text-sm:  0.875rem;
  --text-md:  1rem;
  --text-lg:  1.25rem;
  --text-xl:  1.5rem;
  --text-2xl: 2rem;
  --text-display-s: clamp(2rem, 3vw + 1rem, 3rem);
  --text-display:   clamp(2.75rem, 5vw + 1rem, 5.5rem);
}
```

Rules:

- Display set tight: `letter-spacing: -0.03em; line-height: 1.02` on the H1,
  `-0.02em / 1.1` on section headings.
- Body at `--text-md`/`--text-lg`, `line-height: 1.6`, measure 45–75ch. The
  hero lede caps at `60ch`.
- Headlines wrap safely: `overflow-wrap: anywhere; min-width: 0` on display
  elements.
- Mono is a seasoning, not a meal: kbd chips, annotations, the code block, the
  demo palette rows, meta lines. Body prose is never mono.
- No section eyebrows, no `01 · FEATURES` numbered kickers, and never the
  label-left/heading-right hanging-header pattern. Workbench headings are
  small and functional (`--text-2xl` / `--text-display-s`), stacked plainly.

### 2.3 Spacing, radius, rules

```css
:root {
  --space-2xs: 0.25rem;  --space-xs: 0.5rem;  --space-sm: 0.75rem;
  --space-md:  1rem;     --space-lg: 1.5rem;  --space-xl: 2.5rem;
  --space-2xl: 4rem;     --space-3xl: 6rem;   --space-4xl: 8rem;

  --radius-sm: 6px;   /* kbd chips, buttons */
  --radius-md: 10px;  /* demo palette rows, code block */
  --radius-lg: 14px;  /* screenshot figures, demo palette shell */

  --rule-hair: 1px;
  --page-gutter: clamp(1rem, 4vw, 2.5rem);
  --page-max: 72rem; /* 1152px content column */
}
```

Major sections separate by `--space-3xl` minimum (`--space-4xl` around the
tour). The screenshot frames are the dividers — no horizontal rules between
tour blocks.

### 2.4 Motion

Exactly three primitives. Nothing else moves.

1. **Demo palette loop** — the hero palette auto-plays a scripted ~8 s
   sequence (§ 5.2). This is the page's signature motion.
2. **Section fade-in** — tour blocks fade up `12px → 0` over `300ms` with
   `--ease-out` when they enter the viewport, once, via
   IntersectionObserver. Opacity + transform only.
3. **Button/figure hover** — buttons brighten `120ms`; screenshot figures lift
   with a soft mint glow shadow (`0 8px 40px var(--bloom-mint)`), `150ms`.

```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 300ms;
}
@media (prefers-reduced-motion: reduce) {
  /* demo palette renders its final frame statically (filtered list, row
     highlighted); fade-ins become instant; hovers keep color change only */
}
```

Never animate layout properties, never bounce, never animate the focus ring.

### 2.5 Voice

Short declaratives. Specific verbs. Name the keystroke, the feature, the
browser — never the feeling. Calibration examples (these are the actual page
copy, see § 6): "Run your browser from the keyboard." · "⌘⇧K. Type. Enter." ·
"Commands that know where you are."

---

## 3. Logo and identity

Source assets already in the repo:

- `public/monocle-mark.svg` — the mark: a monocle lens containing a `>` prompt
  chevron, with a curved handle. Stroke `#12e0a0`. **This is the primary
  brand element.**
- `public/logo.svg` — decorative burst shape (`#26ffb8`). Not used on this
  page.

### Placement

| Location | Treatment |
| --- | --- |
| **Nav, top-left** | Mark at 28×28px + wordmark "Monocle" in Bricolage Grotesque 600, `--text-lg`, ink. Lockup gap `--space-xs`. The mark keeps its mint stroke — it is one of the page's few accent uses. |
| **Footer meta row** | Mark at 20×20px + "Monocle" in `--text-sm`. |
| **Favicon** | The mark on transparent, exported at 16/32/180 (apple-touch on `--color-paper`). |
| **OG image** | See § 8.4. |

Clear space around the lockup: ≥ the lens diameter on all sides. Never recolor
the mark, never place it on mint, never add a container/badge behind it. The
wordmark is always "Monocle" — never "MonocleApp", never all-caps.

---

## 4. Page architecture

Single page, nine regions, in DOM order:

```
┌──────────────────────────────────────────────────────────┐
│ NAV (N9) — mark+wordmark left · "Install" CTA right      │
├──────────────────────────────────────────────────────────┤
│ HERO — centered                                          │
│   H1: Run your browser from the keyboard.                │
│   lede · [Add to Chrome] [Add to Firefox] · kbd hint     │
│   ┌────────────────────────────────┐                     │
│   │  LIVE DEMO PALETTE (HTML/CSS)  │  ← mint bloom       │
│   │  auto-plays scripted search    │     behind          │
│   └────────────────────────────────┘                     │
├──────────────────────────────────────────────────────────┤
│ THREE KEYS — 3-up horizontal step strip                  │
│   ⌘⇧K Open · Type Search · ↵ Run (⌘↵ alternate)          │
├──────────────────────────────────────────────────────────┤
│ TOUR (5 screenshot blocks, alternating 7/5 split)        │
│   1. The palette, on any page          [capture]         │
│   2. A calm new tab                    [capture]         │
│   3. Ten themes, previewed live        [capture]         │
│   4. Commands that know where you are  [capture]         │
│   5. History · Bookmarks · Containers  [3-up captures]   │
├──────────────────────────────────────────────────────────┤
│ SITE SDK — code block left, copy right                   │
├──────────────────────────────────────────────────────────┤
│ PERMISSIONS — short honest note, no imagery              │
├──────────────────────────────────────────────────────────┤
│ FINAL CTA — one browser-detected install button          │
├──────────────────────────────────────────────────────────┤
│ FOOTER (Ft5) — statement sentence + meta line            │
└──────────────────────────────────────────────────────────┘
  + STICKY CTA BAR (C4) — appears after tour block 2,
    hides when the final CTA section is in view
```

Nav is N9 edge-aligned minimal: wordmark hard-left, one CTA hard-right,
nothing in between. Do not add links to fill the space — the emptiness is the
design. The page is one viewport-width column, `--page-max` centered,
`--page-gutter` inline padding.

---

## 5. HTML structure (complete skeleton)

Vanilla HTML/CSS plus one small JS file (demo palette + sticky bar +
IntersectionObserver). No framework. Class names below are the contract
between designer and developer.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Monocle — a command palette for your browser</title>
  <meta name="description" content="Monocle puts a fast, keyboard-driven command palette on every page and your new tab. Press Cmd+Shift+K, type, and run browser actions, tabs, history, bookmarks, and site commands. Chrome and Firefox." />
  <meta property="og:title" content="Monocle — a command palette for your browser" />
  <meta property="og:description" content="Press Cmd+Shift+K on any page. Search tabs, history, bookmarks, and hundreds of browser commands. No mouse required." />
  <meta property="og:image" content="/og.png" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/tokens.css" />
  <link rel="stylesheet" href="/site.css" />
</head>
<body>

  <header class="nav-edge">
    <a class="wordmark" href="/">
      <img src="/monocle-mark.svg" alt="" width="28" height="28" />
      Monocle
    </a>
    <a class="btn btn--outline" href="#install">Install</a>
  </header>

  <main>
    <!-- HERO -->
    <section class="hero" id="top">
      <h1 class="hero__headline">Run your browser from the&nbsp;keyboard.</h1>
      <p class="hero__lede">
        Monocle is a command palette for Chrome and Firefox. Press
        <kbd data-key="palette">⌘⇧K</kbd> on any page, type what you want —
        tabs, history, bookmarks, browser actions, site commands — and hit
        Enter.
      </p>
      <div class="hero__ctas" id="install">
        <a class="btn btn--accent" href="{{CHROME_STORE_URL}}">Add to Chrome</a>
        <a class="btn btn--outline" href="{{FIREFOX_AMO_URL}}">Add to Firefox</a>
      </div>
      <p class="hero__hint">Free · open development · works in Chrome and Firefox (MV3)</p>

      <!-- Live demo palette — real HTML/CSS, not a screenshot -->
      <div class="demo" role="img"
           aria-label="The Monocle command palette: a search field filtering a list of browser commands such as Reload current tab, Capture screenshot, and Close duplicate tabs.">
        <div class="demo__input">
          <span class="demo__query" data-demo-query></span><span class="demo__caret"></span>
          <span class="demo__placeholder">Search for commands…</span>
        </div>
        <p class="demo__group-label">Suggestions</p>
        <ul class="demo__list" data-demo-list>
          <li class="demo__row" data-keywords="reload refresh tab">
            <span class="demo__name">Reload current tab</span>
            <span class="demo__meta"><kbd>⌘</kbd><kbd>R</kbd> Command</span>
          </li>
          <li class="demo__row" data-keywords="capture screenshot page">
            <span class="demo__name">Capture screenshot</span>
            <span class="demo__meta">Command</span>
          </li>
          <li class="demo__row" data-keywords="mute audio tab sound">
            <span class="demo__name">Mute current tab</span>
            <span class="demo__meta">Command</span>
          </li>
          <li class="demo__row" data-keywords="close duplicate tabs">
            <span class="demo__name">Close duplicate tabs</span>
            <span class="demo__meta">Command</span>
          </li>
          <li class="demo__row" data-keywords="bookmark add save page">
            <span class="demo__name">Add Bookmark</span>
            <span class="demo__meta">Group</span>
          </li>
          <li class="demo__row" data-keywords="bookmarks browse folders">
            <span class="demo__name">Bookmarks</span>
            <span class="demo__meta">Group</span>
          </li>
          <li class="demo__row" data-keywords="history search visited">
            <span class="demo__name">History</span>
            <span class="demo__meta">Group</span>
          </li>
          <li class="demo__row" data-keywords="theme switch dark nord dracula">
            <span class="demo__name">Themes</span>
            <span class="demo__meta">Group</span>
          </li>
        </ul>
        <div class="demo__footer">
          <span>Run <kbd>↵</kbd></span>
          <span>Actions <kbd data-key="alt">⌥</kbd></span>
        </div>
      </div>
    </section>

    <!-- THREE KEYS -->
    <section class="keys" aria-labelledby="keys-heading">
      <h2 id="keys-heading" class="keys__heading">Three keys.</h2>
      <ol class="keys__steps">
        <li class="keys__step">
          <kbd class="keys__cap" data-key="palette">⌘⇧K</kbd>
          <h3>Open</h3>
          <p>The palette appears over whatever page you're on — or front and center on your new tab.</p>
        </li>
        <li class="keys__step">
          <kbd class="keys__cap">a–z</kbd>
          <h3>Type</h3>
          <p>Search is instant, and results are ranked by how you actually use them. Favorites float to the top.</p>
        </li>
        <li class="keys__step">
          <kbd class="keys__cap">↵</kbd>
          <h3>Run</h3>
          <p>Enter runs the command. <kbd data-key="mod">⌘</kbd><kbd>↵</kbd> runs its alternate action — like "open in a new tab."</p>
        </li>
      </ol>
    </section>

    <!-- TOUR -->
    <section class="tour" aria-label="Product tour">

      <article class="tour__block">
        <div class="tour__copy">
          <h2>Every command, one search away.</h2>
          <p>Reload, mute, capture a screenshot, close duplicate tabs, clear
          browsing data, manage windows — the actions your browser hides in
          menus, surfaced behind a single shortcut. Groups expand into nested
          pages, and forms take input inline without leaving the keyboard.</p>
        </div>
        <figure class="tour__figure">
          <img src="/img/tour-palette.webp" width="1440" height="900" loading="eager"
               alt="The Monocle palette open over a webpage, listing browser commands with keyboard shortcuts and an actions footer." />
          <figcaption>The palette, over any page. <span class="annotation">Ranked by your usage</span></figcaption>
        </figure>
      </article>

      <article class="tour__block tour__block--flip">
        <div class="tour__copy">
          <h2>A calm new tab.</h2>
          <p>Monocle can replace your new tab page: a large clock, a daily
          background photo with photographer credit, and the palette front and
          center. Same commands, same shortcuts, zero clutter.</p>
        </div>
        <figure class="tour__figure">
          <img src="/img/tour-newtab.webp" width="1440" height="900" loading="lazy"
               alt="Monocle's new tab page: a large clock over a full-screen photograph, with the command palette open beneath it." />
          <figcaption>New tab, replaced. <span class="annotation">Clock can be toggled off</span></figcaption>
        </figure>
      </article>

      <article class="tour__block">
        <div class="tour__copy">
          <h2>Ten themes, previewed live.</h2>
          <p>Solarized, Monokai, Nord, the Catppuccin family, One Dark,
          Dracula, and more — plus System, Light, and Dark modes. Arrow
          through the list and the palette restyles under your cursor before
          you commit.</p>
        </div>
        <figure class="tour__figure">
          <img src="/img/tour-themes.webp" width="1440" height="900" loading="lazy"
               alt="The Themes command open in Monocle, showing a searchable list of color themes with the palette previewing the highlighted theme." />
          <figcaption>Themes preview as you move. <span class="annotation">↑↓ to preview, ↵ to keep</span></figcaption>
        </figure>
      </article>

      <article class="tour__block tour__block--flip">
        <div class="tour__copy">
          <h2>Commands that know where you are.</h2>
          <p>On github.com, Monocle adds repo, pull request, and issue
          navigation — Conversation, Commits, Checks, Files Changed — and a
          Toggle Star action. They appear only there. Per-command URL rules
          decide visibility, and you manage your own allow and deny lists from
          the palette itself.</p>
        </div>
        <figure class="tour__figure">
          <img src="/img/tour-site.webp" width="1440" height="900" loading="lazy"
               alt="Monocle open on a GitHub pull request, showing GitHub-specific commands like Files Changed, Checks, and Toggle Star." />
          <figcaption>GitHub commands, only on GitHub. <span class="annotation">URL rules decide visibility</span></figcaption>
        </figure>
      </article>

      <article class="tour__block tour__block--triptych">
        <div class="tour__copy">
          <h2>Your library, off the mouse.</h2>
          <p>History grouped by time — Today, Yesterday, Last Week. Bookmarks
          browsed by folder. And on Firefox, Multi-Account Containers: open a
          fresh tab in any container, or reopen the current page in a
          different one.</p>
        </div>
        <div class="tour__trio">
          <figure class="tour__figure tour__figure--sm">
            <img src="/img/tour-history.webp" width="720" height="540" loading="lazy"
                 alt="Monocle's History group, with entries grouped under Today and Yesterday, each showing favicon, title, and visit time." />
            <figcaption>History, by time period</figcaption>
          </figure>
          <figure class="tour__figure tour__figure--sm">
            <img src="/img/tour-bookmarks.webp" width="720" height="540" loading="lazy"
                 alt="Monocle's Bookmarks group showing bookmark folders and entries." />
            <figcaption>Bookmarks, by folder</figcaption>
          </figure>
          <figure class="tour__figure tour__figure--sm">
            <img src="/img/tour-containers.webp" width="720" height="540" loading="lazy"
                 alt="Firefox container commands in Monocle: open a new tab in a chosen container profile." />
            <figcaption>Containers, on Firefox</figcaption>
          </figure>
        </div>
      </article>

    </section>

    <!-- SITE SDK -->
    <section class="sdk" aria-labelledby="sdk-heading">
      <div class="sdk__copy">
        <h2 id="sdk-heading">Your site can join in.</h2>
        <p>Any page can register its own commands through
        <code>window.Monocle</code> — open its search, jump to a section, run
        a saved query — with no extension permissions and no build step.</p>
        <ul class="sdk__points">
          <li><strong>Session-only.</strong> Commands live as long as the page does.</li>
          <li><strong>Non-privileged.</strong> Site commands run in the page; they can't touch browser APIs or bind global shortcuts.</li>
          <li><strong>Validated at the boundary.</strong> Strict schema, size limits, safe icons — checked before the extension sees a thing.</li>
        </ul>
        <a class="link-arrow" href="{{REPO_URL}}/blob/main/docs/site-sdk.md">Read the SDK reference →</a>
      </div>
      <pre class="sdk__code"><code>window.Monocle.commands.register({
  namespace: "docs",
  name: "Docs",
  icon: { type: "lucide", name: "BookOpen" },
  commands: [{
    id: "open-search",
    type: "action",
    name: "Open Site Search",
    placement: "root",
    onExecute() {
      document
        .querySelector("[type='search']")
        ?.focus()
    },
  }],
})</code></pre>
    </section>

    <!-- PERMISSIONS -->
    <section class="perms">
      <h2>Permissions, on demand.</h2>
      <p>Monocle installs with the minimum it needs. History, bookmarks, and
      container access are optional permissions — the palette asks the first
      time you use a command that needs one, and execution is re-checked in
      the background every time.</p>
    </section>

    <!-- FINAL CTA -->
    <section class="cta-final">
      <h2 class="cta-final__line">Press <kbd data-key="palette">⌘⇧K</kbd> and keep your hands where they are.</h2>
      <a class="btn btn--accent btn--lg" data-store-detect href="{{CHROME_STORE_URL}}">Install Monocle</a>
      <p class="cta-final__alt">
        <a href="{{CHROME_STORE_URL}}">Chrome</a> ·
        <a href="{{FIREFOX_AMO_URL}}">Firefox</a> ·
        <a href="{{REPO_URL}}">Build from source</a>
      </p>
    </section>
  </main>

  <!-- STICKY CTA BAR -->
  <aside class="sticky-cta" data-sticky-cta hidden>
    <span class="sticky-cta__label"><kbd data-key="palette">⌘⇧K</kbd> for your browser</span>
    <a class="btn btn--accent" href="#install">Install</a>
  </aside>

  <footer class="foot-stmt">
    <p class="foot-stmt__line">Menus are where commands go to&nbsp;hide.</p>
    <div class="foot-stmt__meta">
      <span class="wordmark wordmark--sm">
        <img src="/monocle-mark.svg" alt="" width="20" height="20" /> Monocle
      </span>
      <nav class="foot-stmt__links">
        <a href="{{REPO_URL}}">GitHub</a>
        <a href="{{REPO_URL}}/tree/main/docs">Docs</a>
        <a href="{{REPO_URL}}/blob/main/docs/site-sdk.md">Site SDK</a>
      </nav>
      <span class="muted">© 2026 James Macfie · PolyForm Noncommercial 1.0.0</span>
    </div>
  </footer>

  <script src="/site.js" defer></script>
</body>
</html>
```

### 5.1 Platform-aware keys

Every `<kbd data-key>` is rewritten once on load from `navigator.platform`:
macOS shows `⌘⇧K` / `⌘` / `⌥`; Windows/Linux shows `Ctrl+Shift+K` / `Ctrl` /
`Alt`. Default markup is macOS (matches the screenshots). `data-store-detect`
on the final CTA swaps the href/label to the Firefox listing when the UA is
Firefox.

### 5.2 Demo palette behavior

The hero palette is **real HTML/CSS styled with the site tokens** — not a
screenshot, and never wrapped in fake browser chrome (no traffic-light dots,
no URL bar). It is a faithful recreation of the product's palette: input row,
"Suggestions" group label, command rows with name + meta, footer with
`Run ↵ · Actions ⌥`.

**v1 — scripted loop (ship this):**

1. 0.0 s — list at rest, placeholder visible, caret blinking (1 s steps).
2. 1.2 s — types `dup` letter by letter (~110 ms/char); placeholder hides;
   rows filter via `data-keywords` until only "Close duplicate tabs" remains.
3. 3.0 s — the row gains the active state: `--color-paper-3` fill with a 2px
   mint left edge.
4. 4.0 s — the `↵` chip in the footer flashes once (opacity pulse).
5. 5.5 s — query clears, full list restores, loop idles 2.5 s and repeats.

`prefers-reduced-motion: reduce` → render step 3 as a static frame, no loop.
Pause the loop when the demo scrolls out of view.

**v2 — interactive (nice-to-have, behind the same markup):** clicking the demo
or pressing the palette shortcut focuses a real input; typing filters the
canned rows; Enter on rows like "Themes" or "History" smooth-scrolls to the
matching tour block; Enter on "Install Monocle" (added to the canned list in
v2) jumps to the CTAs. The marketing page nav becomes a demo of the product.

### 5.3 Sticky CTA bar

Hidden until the visitor scrolls past the second tour block; hides again when
the final CTA section enters the viewport (IntersectionObserver, no scroll
handlers). `--color-paper-2` at 92 % opacity with `backdrop-filter: blur(8px)`,
hairline top border, `min-height: 56px`, content row `--page-max` aligned.

---

## 6. Copy deck (single source of truth)

| Slot | Copy |
| --- | --- |
| `<title>` | Monocle — a command palette for your browser |
| Meta description | Monocle puts a fast, keyboard-driven command palette on every page and your new tab. Press Cmd+Shift+K, type, and run browser actions, tabs, history, bookmarks, and site commands. Chrome and Firefox. |
| H1 | Run your browser from the keyboard. |
| Hero lede | Monocle is a command palette for Chrome and Firefox. Press ⌘⇧K on any page, type what you want — tabs, history, bookmarks, browser actions, site commands — and hit Enter. |
| Hero CTAs | Add to Chrome · Add to Firefox |
| Hero hint | Free · open development · works in Chrome and Firefox (MV3) |
| Steps heading | Three keys. |
| Step 1 | **Open** — The palette appears over whatever page you're on — or front and center on your new tab. |
| Step 2 | **Type** — Search is instant, and results are ranked by how you actually use them. Favorites float to the top. |
| Step 3 | **Run** — Enter runs the command. ⌘↵ runs its alternate action — like "open in a new tab." |
| Tour 1 H2 | Every command, one search away. |
| Tour 2 H2 | A calm new tab. |
| Tour 3 H2 | Ten themes, previewed live. |
| Tour 4 H2 | Commands that know where you are. |
| Tour 5 H2 | Your library, off the mouse. |
| SDK H2 | Your site can join in. |
| Permissions H2 | Permissions, on demand. |
| Final CTA | Press ⌘⇧K and keep your hands where they are. → **Install Monocle** |
| Footer statement | Menus are where commands go to hide. |
| Footer meta | © 2026 James Macfie · PolyForm Noncommercial 1.0.0 |

Body paragraphs are final in the HTML skeleton (§ 5). H1 alternates, if the
primary tests poorly: "Every browser action. One keystroke." /
"Your whole browser, behind one shortcut." Keep ≤ 50 characters.

---

## 7. Screenshot specs

### 7.1 Capture rules (all screenshots)

- Capture from a **production build** with the **default dark theme**, palette
  fully populated, at **2× device pixel ratio**. Window 1440×900 logical;
  crop per shot below. Export PNG → encode WebP (quality ~82, ≤ 200 KB each);
  keep PNG originals in the repo under `site/assets-src/`.
- **Curated content only.** Build a throwaway browser profile: no real
  history, bookmarks named like a believable dev's (e.g. "MDN — Array",
  "WXT docs", "Tailwind v4"), no personal emails/avatars anywhere.
- The underlying webpage should be **dim and quiet** so the palette carries
  the frame — a dark documentation page or the product's own new tab works;
  avoid busy news sites and anything brand-loud.
- **No editor/fake chrome added in post.** Real captures, cropped clean. Each
  image sits in a `<figure>` with a `--color-rule` hairline border and
  `--radius-lg`; that's the only framing.
- Existing `docs/images/*.jpg` are reference-quality only — re-capture
  everything for the site (they're JPEG, mixed sizing, and show Google's
  homepage with personal locale data).

### 7.2 Shot list

| File | Shows | Must be visible |
| --- | --- | --- |
| `tour-palette.webp` (1440×900) | Palette open over a quiet dark page | Search input with placeholder; ≥ 7 command rows (Reload current tab with ⌘R chips, Capture screenshot, Mute current tab, Close duplicate tabs, Add Bookmark, Bookmarks, Clear Browser Data); footer `Run ↵ · Actions Alt`; one row highlighted |
| `tour-newtab.webp` (1440×900) | New tab page | Large clock, background photo with photographer credit visible bottom corner, palette open beneath the clock |
| `tour-themes.webp` (1440×900) | Themes command open | Searchable theme list (Nord, Dracula, Catppuccin variants, One Dark, Solarized visible); palette mid-preview in a recognizably different theme than default |
| `tour-site.webp` (1440×900) | A public GitHub PR page (use a Monocle repo PR) | GitHub-specific rows: Conversation, Commits, Checks, Files Changed, Toggle Star; the GitHub URL visible enough to make the point |
| `tour-history.webp` (720×540 crop) | History group | "Today" and "Yesterday" group labels, entries with favicon + title + time |
| `tour-bookmarks.webp` (720×540 crop) | Bookmarks group | Folder rows + bookmark rows, believable curated names |
| `tour-containers.webp` (720×540 crop) | Firefox container commands | Container profiles with their colored dots; captured in Firefox |
| `og.png` (1200×630) | OG/social card | See § 8.4 — composed, not captured |

Alt text for each image is final in the HTML skeleton (§ 5) — use it verbatim.

### 7.3 Annotations

Each main tour figure carries **one** margin annotation (the
`<span class="annotation">` in the figcaption): `--font-mono`, `--text-xs`,
`--color-muted`, connected to the figure edge by a 24px hairline leader.
One per figure, never more. The annotation copy is final in § 5.

---

## 8. Other imagery

### 8.1 What this page does NOT use

No stock photography, no AI-generated illustration, no abstract 3D blobs, no
icon grid, no device mockups, no fake browser chrome. The product UI and
typography are the entire visual diet.

### 8.2 kbd chips

`<kbd>` is a first-class visual element sitewide: `--font-mono` `--text-sm`,
`--color-paper-3` fill, hairline `--color-rule` border, `--radius-sm`,
`padding: 2px 7px`, baseline-aligned. The Three Keys section sets them large
(`--text-2xl`, padding 10px 18px) as the step icons — keycaps are the page's
iconography.

### 8.3 Background blooms

Exactly two fixed radial gradients on `<body>`, mint at 7 % alpha
(`--bloom-mint`), never animated:

```css
body::before { /* behind hero demo */
  background: radial-gradient(640px 480px at 50% 480px, var(--bloom-mint), transparent 70%);
}
body::after  { /* behind footer statement */
  background: radial-gradient(560px 420px at 80% 100%, var(--bloom-mint), transparent 70%);
}
```

Each covers ≤ 25 % of the viewport. They read as the palette's glow on a dark
desk — atmosphere, not decoration.

### 8.4 OG image (`og.png`, 1200×630)

Composed in the site's own language: `--color-paper` ground, one mint bloom
upper-right, mark at 96px top-left, "Run your browser from the keyboard." in
Bricolage Grotesque 800 at ~88px ink, positioning line beneath in Geist
`--color-muted`, and a cropped top edge of the demo palette bleeding off the
bottom. No screenshot-of-a-screenshot.

---

## 9. Interaction states & accessibility

- **Buttons** (`.btn`): all 8 states styled. `--accent` variant: mint fill,
  `--color-accent-ink` text; hover brightens fill ~6 % L; active translates
  down 1px; focus-visible shows a 2px `--color-focus` ring offset 2px
  (instant, never animated); disabled drops to 40 % opacity. `--outline`
  variant: hairline border, ink text, hover fills `--color-paper-2`.
- **Links**: ink with `--color-rule` underline; hover swaps underline to
  accent. Link text always stands alone ("Read the SDK reference →", never
  "click here").
- **Contrast**: ink on paper and ink-2 on paper clear WCAG AA / APCA body
  thresholds; accent-ink on accent must be verified ≥ 7:1 — if the mint fill
  fails with dark text in final QA, darken `--color-accent-ink`, never
  lighten the mint.
- **Keyboard**: logical tab order top-to-bottom; the demo palette is
  `role="img"` with a full aria-label in v1 (decorative animation), and a
  real focusable combobox pattern only in v2; sticky bar is last in tab order
  and `hidden` removes it entirely.
- **Reduced motion**: § 2.4 — demo renders static final frame, fades become
  instant, hover keeps color only.
- **Mobile non-negotiables**: no horizontal scroll at 320/375/414/768px;
  `overflow-x: clip` on html and body; image grid tracks use
  `minmax(0, 1fr)`; no button or nav link wraps to two lines; hit targets
  ≥ 44×44px below 640px.

### Responsive collapse

| Region | ≤ 960px | ≤ 640px |
| --- | --- | --- |
| Nav | unchanged | unchanged (already two elements) |
| Hero | unchanged, centered | H1 steps down one size; CTAs stack full-width; demo palette goes edge-to-edge minus gutter, rows truncate with ellipsis |
| Three keys | 3-up → vertical stack | keycaps step down to `--text-xl` |
| Tour blocks | 7/5 split → single column, copy above figure | annotations fold inline into the figcaption (no leader lines) |
| Tour trio | 3-up → vertical stack | unchanged |
| SDK | code below copy | code block scrolls horizontally inside its own container, never the page |
| Sticky bar | unchanged | label truncates; Install button keeps 44px height |
| Footer | meta row wraps to two lines | statement steps down via clamp floor |

---

## 10. Approved claims inventory

Every factual statement on the page, with its source. Nothing outside this
table may be claimed.

| Claim | Source |
| --- | --- |
| Works in Chrome and Firefox, both MV3 | README, `wxt.config.ts` build targets |
| Default shortcut ⌘⇧K / Ctrl+Shift+K | README |
| Searches tabs, history, bookmarks, browser actions, settings, site commands | README features |
| Results ranked by usage; favorites | `docs/search-and-ranking.md` |
| ⌘↵ runs alternate action (e.g. open in new tab) | README, `docs/execution-and-actions.md` |
| New tab: clock, daily background photo + photographer credit, palette | README, `docs/new-tab-and-theme.md` |
| Ten themes incl. Solarized, Monokai, Nord, Catppuccin, One Dark, Dracula + System/Light/Dark; live preview | README |
| History grouped Today/Yesterday/Last Week/Last Month/Older | README |
| Bookmarks browsable by folder | README |
| Firefox Multi-Account Containers support | README (Firefox only) |
| GitHub commands: Conversation, Commits, Checks, Files Changed, Toggle Star; only on github.com | README, `docs/commands/websites.md` |
| User-managed allow/deny URL rules | README, `docs/url-filtering.md` |
| `window.Monocle` SDK: session-only, non-privileged, validated | README, `docs/site-sdk.md` |
| Optional permissions requested on demand; re-checked at execution | README, `docs/permissions.md` |
| License: PolyForm Noncommercial 1.0.0; author James Macfie | `package.json`, LICENSE |

**Do not claim:** user counts, ratings, speed benchmarks, "private/no
tracking" (unverified — add only with a written privacy policy), workflow
automation (partially implemented), or that the SDK is "an app store."

---

## 11. Build notes & open items

- **Stack**: static HTML + `tokens.css` + `site.css` + one `site.js` (demo
  loop, platform keys, sticky bar, fade-ins). No framework, no build step
  required; host anywhere static.
- **Fonts**: self-host woff2 subsets (latin) — Bricolage Grotesque 600/800,
  Geist 400/500, Geist Mono 400/500. ≤ 5 font files, `font-display: swap`.
- **Performance budget**: total page ≤ 1 MB; LCP is the H1 (text, instant);
  hero image `loading="eager"`, all tour images `loading="lazy"` with
  explicit width/height (no CLS).
- **Placeholders to resolve before launch** (search for `{{` in the HTML):
  - `{{CHROME_STORE_URL}}` — Chrome Web Store listing (not yet published;
    see `docs/store-submission.md` for blockers).
  - `{{FIREFOX_AMO_URL}}` — Firefox AMO listing.
  - `{{REPO_URL}}` — public GitHub repository URL.
  - Until store listings exist, point both install CTAs at
    `{{REPO_URL}}#installation` and change labels to "Get Monocle" — never
    ship dead store links.
- **Slop checklist for final QA** (the page fails review if any are true):
  gradient text · fake browser chrome around screenshots · invented metrics
  or testimonials · eyebrow section numbering · more than 3 motion
  primitives · accent on > 5 % of the page · any non-token color or font in
  the CSS · horizontal scroll at 320px.
