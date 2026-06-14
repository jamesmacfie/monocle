# Surfaces (declarative UI primitive)

> **Status: implemented.** A background-owned, owner-namespaced store of
> declarative UI surfaces (overlays + badges) that content and the new tab
> render through one generic host. Focus Mode and user-script automations are
> the first consumers.

A **surface** is a piece of persistent, declarative UI that the background owns
and content renders — modeled on toasts (the background holds the UI state,
content listens and renders), but persistent and URL-scoped. Surfaces are the
reusable primitive any feature or automation composes on instead of shipping
its own content components and messages.

The key constraint: **surfaces are data, never markup**. A trusted bundled
component (`shared/components/SurfaceHost.tsx`) renders the fixed fields below,
so there is no arbitrary HTML/JS — the same store-safe-harbor posture as the
rest of the codebase (see [store-submission.md](./store-submission.md) and the
"no arbitrary-DOM op" decision in [workflow-automation.md](./workflow-automation.md)).

---

## The model

```ts
// shared/types/surface.ts
type SurfaceKind = "overlay" | "badge"

type SurfaceContent = {
  icon?: IconName        // a Lucide name; rendered by the icon registry
  title?: string
  text?: string
  countdownTo?: number   // epoch ms; the host shows a live mm:ss until it elapses
}

type Surface = {
  id: string                       // unique within an owner
  kind: SurfaceKind
  urlMatch?: { allowUrls?: string[]; denyUrls?: string[] }  // reuses matchesUrlPattern
  blocking?: boolean               // overlay only: intercept pointer/scroll
  content: SurfaceContent
}
```

- **overlay** — full-viewport panel; `blocking: true` makes it a hard block
  (the content shadow root is closed, so the page can't remove it).
- **badge** — a small corner chip (used on the new tab, which is never blocked).
- **`countdownTo`** is a generic live countdown — not specific to any feature.
- **`urlMatch`** gates where a surface applies. Absent = everywhere. (A badge
  typically omits it so it always shows on the new tab.)

---

## The store (`background/surfaces.ts`)

Owner-namespaced, persisted under `monocle-surfaces` (survives MV3
service-worker death within a session):

| Function | Use |
| --- | --- |
| `setOwnerSurfaces(ownerId, surfaces[])` | Replace all of an owner's surfaces (the feature path). Passing an **empty array deletes the owner entry entirely**, so the replace-path doubles as a clear. |
| `clearOwnerSurfaces(ownerId)` | Remove an owner's surfaces. |
| `upsertSurface(ownerId, surface)` | Add/replace one surface by id (the automation path). |
| `removeSurface(ownerId, surfaceId)` | Remove one surface. |
| `getSurfacesForUrl(url)` | Every surface (all owners) whose `urlMatch` admits `url`. |
| `initSurfaces()` | Startup: drop per-session (`userscript:*`) owners; features rebuild their own in `init`. |

Every mutation persists, then broadcasts `monocle-surfaces-changed` to all tabs
via `broadcastToAllTabs` (`background/utils/browserTabs.ts`).

**Owner ids.** Features use their feature id (e.g. `focus-mode`). User-script
automations use `userscript:<scriptId>` — that prefix marks them per-session, so
`initSurfaces` clears them on a fresh browser start.

---

## The host (`shared/components/SurfaceHost.tsx`)

One generic renderer, mounted like `ToastContainer`:

- `<SurfaceHost kinds={["overlay"]} />` in `content/scripts.tsx` (closed shadow
  root, beside the palette).
- `<SurfaceHost kinds={["badge"]} />` in `newtab/NewTabApp.tsx`.

On mount, on SPA navigation (`content/utils/spaNavigation.ts`,
`trackSpaNavigation` — shared with the user-script trigger service), and on
every `monocle-surfaces-changed` broadcast, it sends `get-surfaces { url }` and
renders the returned surfaces of the kinds it owns. It uses inline styles so the
one component works in both the content shadow root and the normal new-tab DOM,
and renders icons through the shared icon registry.

---

## Message

`get-surfaces { url }` → `{ surfaces: Surface[] }` (handler:
`background/messages/surfaces.ts`). The background returns every surface whose
`urlMatch` admits the URL; the host filters by kind locally. See
[messaging.md](./messaging.md).

---

## Producing surfaces

**Features** push surfaces from their lifecycle. Focus Mode projects an overlay
+ badge from its session and blocklist (`background/features/focus/surfaces.ts`,
`projectFocusSurfaces`) and calls `setOwnerSurfaces`/`clearOwnerSurfaces` on
start/stop/expiry/config-change. See [focus-mode.md](./focus-mode.md).

**Automations** push surfaces with the `showSurface` / `hideSurface` user-script
engine ops (owner `userscript:<id>`). `content.title` / `content.text` are
interpolated (`{{var}}`); `urlMatch` is not (an address, never a template). See
[user-scripts.md](./user-scripts.md).

---

## Adding a new surface kind

Surfaces are intentionally a small, closed vocabulary. To add a kind:

1. Extend `SurfaceKind` and (if needed) `SurfaceContent` in
   `shared/types/surface.ts`.
2. Add a renderer branch in `SurfaceHost.tsx`.
3. Extend the `showSurface` Zod schema (`shared/types/userScriptValidation.ts`)
   if automations should produce it.
4. Land type + renderer + schema + tests together.

Resist adding a free-form HTML/markup field — that breaks the store posture and
the "data, not code" contract.

## Related docs

- [features.md](./features.md) — the Feature-module registry (features push surfaces).
- [focus-mode.md](./focus-mode.md) — the first feature consumer.
- [user-scripts.md](./user-scripts.md) — the `showSurface`/`hideSurface` ops.
- [messaging.md](./messaging.md) — `get-surfaces` and `monocle-surfaces-changed`.
