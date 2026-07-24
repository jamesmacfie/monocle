# Design — Monocle marketing

A locked design system for the static Monocle marketing and documentation site.
Every page in this folder uses the same tokens, navigation, footer voice, and
truth-status language. Extend this file when the system changes; do not invent a
page-local theme.

## Audience and tone

- Audience: prospective users, extension-store reviewers, and developers.
- Primary job: explain what the current build does, what is opt-in, and what is
  still in development.
- Tone: technical, candid, calm. Prefer bounded claims over superlatives.

## Genre

Modern-minimal, using the existing dark Raycast-derived Monocle surface rather
than a light-paper SaaS treatment.

## Macrostructure family

- Product pages: Split Studio — concise claim beside code, product UI, or a
  concrete status panel.
- Application examples: Workbench — used only when the product surface itself
  is the evidence.
- Guides, reviewer material, and privacy: Long Document — readable prose with
  compact tables and inline section heads.

## Theme

- `--color-paper`: near-black, faintly cool.
- `--color-paper-2` / `--color-paper-3`: progressively lighter elevations.
- `--color-ink`: near-white primary text.
- `--color-ink-2`: readable secondary text.
- `--color-accent`: Monocle mint, reserved for focus, active state, and small
  status markers.
- Warning and risk states use amber tokens, never mint alone.

The exact OKLCH values live in `assets/tokens.css`, the source of truth.

## Typography

- Display: Geist, weight 700, normal.
- Body: Geist, weight 400.
- Mono: Geist Mono, weight 400–500, for code, permissions, and status labels.
- Display tracking: `-0.025em` to `-0.04em`.
- Reading measure: 60–70 characters.

## Spacing

The site uses the named four-point scale in `assets/tokens.css`. Components use
tokens; raw spacing values are reserved for optical one-pixel adjustments.

## Motion

- Product demo: one purposeful command-palette loop.
- Navigation and buttons: direct hover/press feedback.
- Long-form pages: no scroll choreography; the text is immediately present.
- Reduced motion: no spatial movement and no looping demo animation.

## Navigation and footer

- Navigation: N5-style detached compact bar on wide screens, collapsed to a
  disclosure menu on small screens.
- Footer: Ft5 statement close, followed by the minimum useful links: source,
  reviewer notes, privacy, and development installation.
- Store buttons are forbidden until live listing URLs exist. Use “Build from
  source” or an explicit “Store release pending” status instead.

## Trust language

Every page must preserve these distinctions:

1. Baseline features process and store data locally in the extension profile.
2. Unsplash background and DuckDuckGo icon requests are built-in remote fetches.
3. Outbound automation, OpenAI generation, Native Bridge, and peer-extension
   integrations are explicit opt-ins with separate permissions or approvals.
4. Native Bridge leaves the extension/browser boundary but stays on the local
   device; HTTP and OpenAI requests can leave the device.
5. “No telemetry” is supportable. “Nothing leaves your device” is not.

## CTA voice

- Primary: short filled action such as “Build from source”.
- Secondary: outlined or typographic link such as “Read reviewer notes”.
- Status is never styled as an install action.

## What pages must share

- Wordmark, mint accent, Geist/Geist Mono, compact navigation, footer links.
- A visible route to `privacy.html` and `reviewers.html`.
- The same feature-status vocabulary: available, opt-in, experimental, pending.

## Per-page allowances

- Home and product pages may use the existing CSS product figures.
- Guides and reviewer pages use typography, tables, and status panels only.
- No invented metrics, testimonials, browser chrome, or store-availability copy.

## Exports

`assets/tokens.css` is the canonical drop-in export. Equivalent mappings for
other systems follow.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(14% 0.006 264);
  --color-paper-2: oklch(17.5% 0.007 264);
  --color-paper-3: oklch(22% 0.008 264);
  --color-ink: oklch(97% 0.002 264);
  --color-ink-2: oklch(74% 0.006 264);
  --color-muted: oklch(56% 0.008 264);
  --color-accent: oklch(80% 0.17 168);
  --color-focus: oklch(84% 0.19 168);
  --font-display: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2.5rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(14% 0.006 264)", "$type": "color" },
    "ink": { "$value": "oklch(97% 0.002 264)", "$type": "color" },
    "accent": { "$value": "oklch(80% 0.17 168)", "$type": "color" },
    "focus": { "$value": "oklch(84% 0.19 168)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist, system-ui, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "Geist, system-ui, sans-serif", "$type": "fontFamily" },
    "mono": { "$value": "Geist Mono, ui-monospace, monospace", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" },
    "xl": { "$value": "2.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
.dark {
  --background: 14% 0.006 264;
  --foreground: 97% 0.002 264;
  --card: 17.5% 0.007 264;
  --card-foreground: 97% 0.002 264;
  --primary: 80% 0.17 168;
  --primary-foreground: 20% 0.02 264;
  --muted: 22% 0.008 264;
  --muted-foreground: 74% 0.006 264;
  --border: 100% 0 0 / 0.1;
  --ring: 84% 0.19 168;
  --radius: 0.75rem;
}
```
