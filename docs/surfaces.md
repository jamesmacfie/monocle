# Surfaces (declarative UI primitive)

> **Status: implemented.** A background-owned, owner-namespaced store of
> declarative UI surfaces (overlays, badges, modals, and pickers) that content
> and the new tab render through one generic host. Focus Mode and automation
> automations are the first consumers.

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
type SurfaceKind = "overlay" | "badge" | "modal" | "picker"

type SurfaceContent = {
  icon?: IconName        // a Lucide name; rendered by the icon registry
  title?: string
  text?: string
  countdownTo?: number   // epoch ms; the host shows a live mm:ss until it elapses
  blocks?: ContentBlock[] // shared, Zod-validated content blocks (shared/types/content.ts)
}

type Surface = {
  id: string                       // unique within an owner
  ownerId?: string                 // stamped onto returned surfaces by getSurfacesForUrl
  kind: SurfaceKind
  urlMatch?: { allowUrls?: string[]; denyUrls?: string[] }  // reuses matchesUrlPattern
  targetTabId?: number             // optional tab gate for tab-specific surfaces
  blocking?: boolean               // overlay only: intercept pointer/scroll
  content: SurfaceContent
}
```

- **overlay** — full-viewport panel; `blocking: true` makes it a hard block
  (the content shadow root is closed, so the page can't remove it).
- **badge** — a small corner chip (used on the new tab, which is never blocked).
- **modal** — a centered, dismissible card built on the shared shadcn Dialog
  (`shared/components/ui/dialog.tsx`: `Dialog`/`DialogContent`/`DialogHeader`/
  `DialogTitle`/`DialogDescription`). The first kind that renders structured
  `blocks` (via the shared `ContentBlocks` renderer) and the first surface
  triggered by a **command** (the QR-code command). Radix handles dismissal —
  the ✕ button, a backdrop click, and Escape all fire `onOpenChange`, which
  posts a `monocle-surface-action` (below). **Shadow-root note:** `DialogContent` takes
  a `container` prop threaded to the Radix Portal; `SurfaceHost` passes an
  element inside the closed content shadow root so the dialog stays themed (by
  the `:host` `--color-*` tokens) and contained — Radix's default portal to
  `document.body` would escape the shadow root.
- **picker** — the one *interactive* kind. While a picker surface is present
  the content host enters element pick-mode (`content/picker/PickerSurface.tsx`):
  it highlights the element under the cursor and, on click, resolves a stable CSS
  selector (`content/picker/selector.ts`) and posts a `monocle-surface-action`
  (`actionId: "element-picked"`) carrying a rich `PickedElement`
  (`shared/types/picker.ts`: selector + tag/id/classes/innerText/href/role,
  plus an optional `css` map — see next). An owner may also set an optional
  `content.css` (a list of CSS property
  names); content reads `window.getComputedStyle` for those at click time and
  returns them in `selection.css` (property → value) — the only place this can
  happen, since content holds the live element. The font inspector
  (`command:inspect-element-fonts`) requests the `font-*` properties this way.
  Escape posts `dismiss`. Crucially it **never mutates the page** — it captures
  the gesture and reports it; the owner decides what the selection means
  (Element Hider hides it; the font inspector copies its computed fonts).
  Content-only: the new tab never renders pickers. See
  [element-hider.md](./element-hider.md).
- **`countdownTo`** is a generic live countdown — not specific to any feature.
- **`blocks`** is the same closed, validated `ContentBlock[]` vocabulary the
  palette uses for calculations (`shared/types/content.ts` +
  `contentValidation.ts`) — structured data, never author markup.
- **`urlMatch`** gates where a surface applies. Absent = everywhere. (A badge
  typically omits it so it always shows on the new tab.)
- **`targetTabId`** optionally narrows a surface to one browser tab. This is used
  for interactive, tab-specific surfaces such as the Element Hider picker; absent
  keeps the existing URL-only behavior.
- **`ownerId`** is not part of the stored shape; `getSurfacesForUrl` stamps it
  onto each returned surface so the host can target it in a `monocle-surface-action`.

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
| `getSurfacesForUrl(url, senderTabId?)` | Every surface (all owners) whose `urlMatch` and optional `targetTabId` admit the sender. |
| `initSurfaces()` | Startup: drop per-session (`automation:*`) owners; features rebuild their own in `init`. |

Every mutation persists, then broadcasts `monocle-surfaces-changed` to all tabs
via `broadcastToAllTabs` (`background/utils/browserTabs.ts`).

**Owner ids.** Features use their feature id (e.g. `focus-mode`). Per-session
owners are prefixed so `initSurfaces` clears them on a fresh browser start:
automation automations use `automation:<scriptId>`, and commands that push a
surface use `command:<commandId>` (e.g. `command:url-as-qr-code`). Feature
owners are not prefixed — they rebuild their own surfaces in `init()`.

---

## The host (`shared/components/SurfaceHost.tsx`)

One generic renderer, mounted like `ToastContainer`:

- `<SurfaceHost kinds={["overlay", "modal", "picker"]} />` in
  `content/scripts.tsx` (closed shadow root, beside the palette).
- `<SurfaceHost kinds={["badge"]} />` in `newtab/NewTabApp.tsx`.

On mount, on SPA navigation (`content/utils/spaNavigation.ts`,
`trackSpaNavigation` — shared with the automation trigger service), and on
every `monocle-surfaces-changed` broadcast, it sends `monocle-surfaces-get { url }` and
renders the returned surfaces of the kinds it owns. It uses inline styles so the
one component works in both the content shadow root and the normal new-tab DOM,
and renders icons through the shared icon registry.

---

## Messages

- `monocle-surfaces-get { url }` → `{ surfaces: Surface[] }` (handler:
  `background/messages/surfaces.ts`). The background returns every surface whose
  `urlMatch` admits the URL and whose optional `targetTabId` matches the sender
  tab (each stamped with its `ownerId`); the host filters by kind locally.
- `monocle-surface-action { ownerId, surfaceId, actionId, value?, selection? }` (handler:
  `background/messages/surfaceAction.ts`) — a user interaction the host reports
  back. The host captures the gesture; the background decides what it means.
  - `actionId: "dismiss"` is universal: any surface can be closed → `removeSurface`.
  - Any **other** action is routed to the surface's **owner**:
    - **Feature** owners (a bare feature id) are dispatched to the feature's
      `handleAction` — the same entry point that backs `monocle-feature-action-execute`
      — with the picker `selection` and the sender tab in the
      `FeatureActionContext`. So a feature reacts to a surface gesture exactly
      as to a settings-page button.
    - **Command** owners (`command:<id>`) are dispatched to a handler the command
      registered via `background/commands/surfaceActionHandlers.ts`
      (`registerCommandSurfaceActionHandler`) at module load — the command-side
      equivalent of `handleAction`, receiving the same `{ selection, tab }`
      context. The font inspector uses this to read the picked element's
      computed fonts and copy them. (automation owner routing is still future
      work; unknown owners are a no-op.)
  - `selection` is the `PickedElement` set by the `picker` kind (including its
    optional captured `css`).

See [messaging.md](./messaging.md).

---

## Producing surfaces

**Features** push surfaces from their lifecycle. Focus Mode projects an overlay
+ badge from its session and blocklist (`background/features/focus/surfaces.ts`,
`projectFocusSurfaces`) and calls `setOwnerSurfaces`/`clearOwnerSurfaces` on
start/stop/expiry/config-change. See [focus-mode.md](./focus-mode.md).

**Automations** push surfaces with the `showSurface` / `hideSurface` automation
engine ops (owner `automation:<id>`). `content.title` / `content.text` are
interpolated (`{{var}}`); `urlMatch` is not (an address, never a template). See
[automations.md](./automations.md). Automations intentionally produce only
`overlay`/`badge` surfaces. Their schema rejects modal/picker-only fields such
as `blocks` and `css`, so richer interactive surfaces stay command/feature-owned.

**Commands** push surfaces directly from their `execute(context)` (which runs in
the background) by calling the store with an owner id `command:<commandId>`. The
"Website URL as QR code" command (`background/commands/tools/urlAsQrCode.ts`)
generates a QR **SVG** synchronously (`background/utils/qr.ts` — the MV3 worker
has no canvas) and `upsertSurface`s a `modal` whose content is a single `image`
block, URL-gated to the page it was triggered on.

---

## Adding a new surface kind

Surfaces are intentionally a small, closed vocabulary. To add a kind:

1. Extend `SurfaceKind` and (if needed) `SurfaceContent` in
   `shared/types/surface.ts`.
2. Add a renderer branch in `SurfaceHost.tsx`.
3. Extend the `showSurface` Zod schema (`shared/types/automationValidation.ts`)
   if automations should produce it.
4. Land type + renderer + schema + tests together.

Resist adding a free-form HTML/markup field — that breaks the store posture and
the "data, not code" contract.

## Related docs

- [features.md](./features.md) — the Feature-module registry (features push surfaces).
- [focus-mode.md](./focus-mode.md) — the first feature consumer.
- [automations.md](./automations.md) — the `showSurface`/`hideSurface` ops.
- [messaging.md](./messaging.md) — `monocle-surfaces-get` and `monocle-surfaces-changed`.
