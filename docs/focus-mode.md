# Focus Mode

> **Status: implemented.** Focus Mode is the first consumer of the
> [Feature-module registry](./features.md) and the [Surfaces primitive](./surfaces.md):
> a blocklist of URL patterns, an on/off + timed/Pomodoro session model, and a
> hard-block overlay + new-tab badge expressed entirely as declarative surfaces
> (no focus-specific UI or messages).

Focus Mode helps the user stay off distracting sites. While a focus session is
active, navigating to any site that matches the **blocklist** is met with a
full-page, hard-block overlay; a countdown shows on both the overlay and the
new-tab page when the session is timed.

It is a **feature** (not a command) because it owns durable config (the
blocklist), runtime session state, and page UI. See [features.md](./features.md)
for the registry it plugs into.

---

## Config (durable) — `monocle-feature-config["focus-mode"]`

```ts
type FocusConfig = {
  blockedUrlPatterns: string[]      // urlRules-style patterns, validated by validateUrlPattern
  defaultDurationMinutes: number    // used by "Start for default duration" / Pomodoro
}
// defaults: { blockedUrlPatterns: [], defaultDurationMinutes: 25 }
```

Edited from **Options → Features → Focus Mode**, rendered by the generic
`SchemaForm` from the feature's `settings.schema`:

- a `text-list` field "Blocked sites" (each pattern validated with the existing
  `validateUrlPattern`; matching reuses `matchesUrlPattern` from
  `background/utils/urlFilter.ts`).
- a `number` field "Default duration (minutes)".
- settings-page action buttons "Start focus" / "Stop focus" (wired through
  `execute-feature-action` → the feature's `handleAction`).

Patterns use the same syntax as command URL rules ([url-filtering.md](./url-filtering.md)):
`*://*.youtube.com/*`, `reddit.com`, `*://news.ycombinator.com/*`.

---

## Session (runtime) — `monocle-feature-state["focus-mode"]`

```ts
type FocusSession = {
  startedAt: number
  endsAt?: number                          // absent = indefinite
  mode: "indefinite" | "timed" | "pomodoro"
}
type FocusState = { session?: FocusSession }
```

The session is **timestamp-based**: "active" is computed, never polled.
`isActive(now)` = a session exists and (`!endsAt || endsAt > now`). This means:

- **No per-second background work.** The overlay and new-tab widget compute the
  remaining time locally from `endsAt` with a 1s `setInterval` (the
  `newtab/components/Clock.tsx` pattern).
- **A single `chrome.alarms` alarm** (`feature:focus-mode:end`) fires at
  `endsAt` to clear the session, so blocking stops precisely at expiry even with
  no user interaction. `init()` re-arms it after a service-worker restart if a
  timed session is still in the future.

`background/features/focus/session.ts` owns `startSession(mode, minutes?)`,
`stopSession()`, `isActive`, `remainingMs`, and `syncFocusSurfaces` (the single
place focus touches UI). `background/features/focus/block.ts` owns
`isUrlBlocked(url, config)`.

---

## Commands

A single **Focus Mode** group (`background/features/focus/commands.ts`) with
state-aware labels (async `name`, `remainOpenOnSelect`, modeled on
`background/commands/newTab/clock.ts`):

- **Start Focus** (indefinite)
- **Start for 30 Minutes** / **Start for 60 Minutes**
- **Start Pomodoro** (`defaultDurationMinutes`)
- **Stop Focus** (shown only while active; label shows remaining time)
- **Configure Focus Mode** (via `createConfigureFeatureCommand`)

---

## UI: built entirely on the Surfaces primitive

Focus Mode owns **no** content/new-tab components and **no** focus-specific
messages. It expresses its UI as declarative [surfaces](./surfaces.md):
`background/features/focus/surfaces.ts` (`projectFocusSurfaces`) turns the
active session + config into

- a **blocking overlay** scoped to the blocklist (`urlMatch.allowUrls =
  blockedUrlPatterns`, `blocking: true`, content = Focus icon + message + the
  session's `countdownTo`), and
- an always-on **badge** (the new tab; icon + `countdownTo`).

`session.ts` calls `setOwnerSurfaces("focus-mode", …)` on start and
`clearOwnerSurfaces("focus-mode")` on stop/expiry; `onConfigChange` re-projects
so blocklist edits take effect live; `init()` reconciles after a SW restart. The
generic `SurfaceHost` (mounted in the closed content shadow root and on the new
tab) renders these — the hard block's containment, the live countdown, the
URL gating, and the cross-tab refresh are all generic surface behavior. See
[surfaces.md](./surfaces.md).

"Hard block" is intentional: there is no per-page dismiss/snooze. The only way
out is ending the focus session (or waiting out a timed one).

---

## Manual checks

- Options → Features → Focus Mode: add a blocked site; click Start (and Start
  30 min).
- Visit the blocked site → full-page overlay with countdown; confirm the page
  underneath cannot dismiss it; SPA navigation within the site keeps it.
- New-tab page shows a non-blocking countdown; a non-blocked site shows no
  overlay.
- Stop (or let a short timed session expire) → overlay clears across all open
  tabs (broadcast / alarm).
- Edit the blocklist while active → open tabs re-evaluate live.

## Related docs

- [features.md](./features.md) — the registry Focus Mode is built on.
- [surfaces.md](./surfaces.md) — the declarative overlay/badge primitive Focus
  Mode renders through.
- [url-filtering.md](./url-filtering.md) — the URL-pattern syntax the blocklist
  reuses.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — the new-tab app the badge
  surface mounts into.
