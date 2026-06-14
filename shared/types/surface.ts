// Architecture: shared/ type layer. The Surfaces primitive — a declarative,
// background-owned description of persistent UI that content/new-tab render
// through one generic host (shared/components/SurfaceHost.tsx). Modeled on
// toasts (background owns the UI state, content listens + renders) but
// persistent and URL-scoped. Surfaces are DATA, never markup: a trusted
// bundled component renders the fixed fields below, so there is no arbitrary
// HTML/JS — the same store-safe-harbor posture as the rest of the codebase.
// Any feature, user-script automation, OR command can push surfaces. See
// docs/surfaces.md.
import type { ContentBlock } from "./content"
import type { IconName } from "./icons"

// `modal` is a centered, dismissible card over a dimmed backdrop — the first
// kind that renders structured `blocks` (see below) and the first surface
// triggered by a command (e.g. "Website URL as QR code"). See
// docs/v_next/03-surfaces-and-persistent-ui.md.
export type SurfaceKind = "overlay" | "badge" | "modal"

// The renderable payload. Every field is declarative and optional; the host
// renders what is present. `countdownTo` is a generic live-countdown (epoch
// ms) — the host ticks 1s and shows mm:ss until it elapses. `blocks` is the
// shared, Zod-validated content-block vocabulary (./content.ts) — structured
// data, never author markup — rendered by the same ContentBlocks component the
// palette uses.
export type SurfaceContent = {
  icon?: IconName
  title?: string
  text?: string
  countdownTo?: number
  blocks?: ContentBlock[]
}

// Optional URL gate (reuses the command url-rule pattern via matchesUrlPattern).
// Absent = the surface applies everywhere.
export type SurfaceUrlMatch = {
  allowUrls?: string[]
  denyUrls?: string[]
}

export type Surface = {
  // Unique within an owner. The store namespaces by owner, so two owners may
  // reuse the same id without colliding.
  id: string
  // The owning namespace (feature id, `userscript:<id>`, or `command:<id>`).
  // Not part of the stored shape — `getSurfacesForUrl` stamps it onto each
  // returned surface so the host can target it in a `surface-action` (e.g.
  // dismiss). The store key is the namespace itself.
  ownerId?: string
  kind: SurfaceKind
  urlMatch?: SurfaceUrlMatch
  // Overlay only: intercept pointer/scroll (a hard block).
  blocking?: boolean
  content: SurfaceContent
}

// Response to get-surfaces: the surfaces whose urlMatch admits the sender URL.
// The host filters by kind locally (it knows which kinds it renders).
export type GetSurfacesResponse = {
  surfaces: Surface[]
}
