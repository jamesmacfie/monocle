# Monocle marketing site

A static, multi-page marketing + documentation site for the Monocle browser
extension. No build step — open any `.html` file directly or serve the folder
with any static host.

```bash
# preview locally
cd apps/marketing && python3 -m http.server 8080
# → http://localhost:8080
```

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home — live demo palette, product tour, representative features, integrations, release status |
| `features.html` | Feature catalog: tabs, library, themes, Focus Mode, Tab Groups, Element Hider, calculations, snippets, and the GitHub prototype |
| `automations.html` | Automations overview — what they are, how a run unfolds, what ships today |
| `integrations.html` | Integration status and boundaries — Raycast, Native Bridge, extension peers, and the page-world site SDK |
| `developers.html` | Architecture, data flows, command schema, message protocol, storage, site SDK, stack |
| `reviewers.html` | For Web Store reviewers — single purpose, permission justifications, security model, validation, residual risks |
| `privacy.html` | Plain-language privacy policy covering local data and every optional outbound path |
| `guide-getting-started.html` | Automation guide: overview + first-run walkthrough |
| `guide-concepts.html` | How automations work — pipeline, segmentation, data-not-code |
| `guide-triggers.html` | The six triggers |
| `guide-steps.html` | Full step / operation vocabulary + control flow |
| `guide-variables.html` | Variables, interpolation, pipes, selectors |
| `guide-examples.html` | Cookbook of complete importable automation drafts |
| `guide-safety.html` | Limits, the trust model, import/export |

The seven `guide-*.html` pages share a docs-style left sidebar.

## Assets

- `assets/tokens.css` — design tokens (the Hallmark "phosphor-mint on dark
  slate" system; see `docs/marketing-site.md`).
- `assets/site.css` — all component styles.
- `assets/site.js` — platform-aware `<kbd>` rewriting, the scripted hero
  demo-palette loop, and mobile nav.
- `assets/monocle-mark.svg`, `assets/favicon.svg` — brand mark.
- `design.md` — locked visual system, truthful copy boundaries, and token exports.

## Before launch

1. **Store links.** Store listings do not exist yet, so acquisition CTAs point
   to source and the reviewer page states the remaining release blockers. Add
   Chrome Web Store and Firefox AMO URLs only after those listings are live.
2. **Screenshots.** The tour uses live HTML "mini" panels as stand-ins for
   product screenshots. For launch polish, capture real 2× screenshots per the
   shot list in `docs/marketing-site.md` §7 and drop them in.
3. **Fonts.** Geist and Geist Mono load from Google Fonts. The privacy policy
   discloses that request; self-host woff2 subsets if a third-party font request
   is undesirable.
4. **Social preview.** Add a real Open Graph image (`og.png`).

Content is sourced from the extension's own `docs/` and verified against the
codebase (commands, schema, permissions in `wxt.config.ts`). Product status,
outbound-data paths, and submission blockers are called out explicitly.
