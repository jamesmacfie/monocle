# Monocle marketing site

A static, multi-page marketing + documentation site for the Monocle browser
extension. No build step — open any `.html` file directly or serve the folder
with any static host.

```bash
# preview locally
cd marketing && python3 -m http.server 8080
# → http://localhost:8080
```

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home — hero, live demo palette, product tour, feature grid, site SDK, CTA |
| `features.html` | Every command and feature: tabs, library, themes, Focus Mode, Tab Groups, Element Hider, calculations, snippets, GitHub |
| `automations.html` | Automations overview — what they are, how a run unfolds, what ships today |
| `developers.html` | Architecture, data flows, command schema, message protocol, storage, site SDK, stack |
| `reviewers.html` | For Web Store reviewers — single purpose, permission justifications, security model, validation, residual risks |
| `guide-getting-started.html` | Automation guide: overview + first-run walkthrough |
| `guide-concepts.html` | How automations work — pipeline, segmentation, data-not-code |
| `guide-triggers.html` | The six triggers |
| `guide-steps.html` | Full step / operation vocabulary + control flow |
| `guide-variables.html` | Variables, interpolation, pipes, selectors |
| `guide-examples.html` | Cookbook of complete example automations |
| `guide-safety.html` | Limits, the trust model, import/export |

The seven `guide-*.html` pages share a docs-style left sidebar.

## Assets

- `assets/tokens.css` — design tokens (the Hallmark "phosphor-mint on dark
  slate" system; see `docs/marketing-site.md`).
- `assets/site.css` — all component styles.
- `assets/site.js` — platform-aware `<kbd>` rewriting, the scripted hero
  demo-palette loop, mobile nav, and scroll reveals.
- `assets/monocle-mark.svg`, `assets/favicon.svg` — brand mark.

## Before launch — resolve these placeholders

1. **Install links.** The "Add to Chrome / Firefox / Install" CTAs point at the
   on-page `#install` anchor. Swap them for the real Chrome Web Store and
   Firefox AMO listing URLs once published (see `docs/store-submission.md` for
   blockers). Never ship dead store links — until listings exist, point them at
   the repo's install instructions and relabel to "Get Monocle".
2. **Screenshots.** The tour uses live HTML "mini" panels as stand-ins for
   product screenshots. For launch polish, capture real 2× screenshots per the
   shot list in `docs/marketing-site.md` §7 and drop them in.
3. **Fonts.** Bricolage Grotesque / Geist / Geist Mono load from Google Fonts
   for convenience. The original spec calls for self-hosted woff2 subsets to
   avoid the runtime request — swap the `<link>` for `@font-face` if desired.
4. **Repo / social.** Add real GitHub and Open Graph image (`og.png`) URLs.

Content is sourced from the extension's own `docs/` and verified against the
codebase (commands, schema, permissions in `wxt.config.ts`). No metrics,
testimonials, or unverified privacy claims are made.
