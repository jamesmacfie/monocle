# Element Hider

Element Hider is the third feature module (`background/features/elementHider/`).
It lets a user click an element on a page and hide it on that site, with the
hide re-applied on every subsequent load. It is deliberately **not** a bespoke
hiding subsystem — it is the first consumer of three generic architecture
extensions, each reusable by future features:

1. The generic **`picker` surface** (`docs/surfaces.md`) — element selection.
2. Generic **`monocle-surface-action` owner routing** — the picked element is reported
   back to the owning feature, which decides what it means.
3. **Feature-owned automations** (`docs/features.md`, `docs/automations.md`) —
   the page-load re-hide runs through the existing automation engine.

## Data model

Config lives in `monocle-feature-config` under `element-hider` and is the single
source of truth:

```ts
type ElementHiderRule = {
  id: string         // crypto.randomUUID()
  urlPattern: string // sensible default: a domain pattern *://host/*
  selector: string   // stable CSS selector generated in content
  label?: string     // the element's text (or selector), for the settings list
}
type ElementHiderConfig = { rules: ElementHiderRule[] }
```

Validated by `elementHiderConfigSchema` (`urlPattern` via the shared
`validateUrlPattern`, bounded `selector`). There is no separate runtime state.

## Flows

**Pick → hide.**

1. "Hide element on this page" (`element-hider-pick`) `execute()` pushes a
   `picker` surface scoped to the active tab's URL and tab id, owner
   `element-hider`.
2. The content `SurfaceHost` enters pick-mode: highlight on hover, and on click
   it resolves a stable selector (`content/picker/selector.ts`) and posts
   `monocle-surface-action { ownerId:"element-hider", actionId:"element-picked",
   selection }`. Content never hides anything.
3. `surfaceAction` routes the action to the feature's `handleAction`
   (`docs/surfaces.md` owner routing). The feature derives a **domain** pattern
   (`*://host/*`, preserving non-default ports) from the sender tab URL, appends
   a rule, removes the picker surface, and **hides immediately** on that tab via
   a one-shot `hideElement` workflow.

**Page-load re-hide.** `automations(config)` (`automations.ts`) projects one
read-only `Automation` per saved rule — an `elementAppears` trigger scoped by
the rule's `urlRules`, followed by a single `hideElement` step. Isolating rules
matters because workflows abort on first failure; a stale selector must not
block unrelated hides on the same site. These flow through the merged automation
registry (`background/automations/registry.ts`), so the trigger engine arms them
on matching pages and the engine runs them, reusing the existing `hideElement`
content op (scoped `display:none !important`, reversible). The projected
documents are never stored; the config is the source of truth.

**Manage.** The settings page renders the rules through the generic
`record-list` field (one row per rule, Delete per row); "Manage hidden elements"
opens it. Feature automations show read-only under "Managed by features" on the
Automations page (`docs/automations.md`), with a link back here.

## Mechanism choice

Hiding uses the reversible `hideElement` op (CSS `display:none`), not destructive
`removeElement`: it survives SPA re-renders, is idempotent, and leaves room for a
future "unhide". Deleting a rule takes effect on the next load (the injected
style persists until then).

## Tests

`background/features/elementHider/elementHider.test.ts` (per-rule projection,
every projected doc valid against `AutomationSchema`, deterministic ids,
`handleAction` element-picked/delete), `content/picker/selector.test.ts`
(selector round-trip + describe payload), `content/picker/PickerSurface.dom.test.tsx`
(gesture suppression + pick callback), `background/automations/registry.test.ts`
(merge), `background/messages/surfaceAction.test.ts` (owner routing).

Manual smoke is still required — see the checklist in the feature plan and
`CLAUDE.md`.
