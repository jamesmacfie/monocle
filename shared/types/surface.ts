// Architecture: shared/ type layer. The Surfaces primitive — a declarative,
// background-owned description of persistent UI that content/new-tab render
// through one generic host (shared/components/SurfaceHost.tsx). Modeled on
// toasts (background owns the UI state, content listens + renders) but
// persistent and URL-scoped. Surfaces are DATA, never markup: a trusted
// bundled component renders the fixed fields below, so there is no arbitrary
// HTML/JS — the same store-safe-harbor posture as the rest of the codebase.
// Any feature OR user-script automation can push surfaces. See docs/surfaces.md.
import type { IconName } from "./icons"

export type SurfaceKind = "overlay" | "badge"

// The renderable payload. Every field is declarative and optional; the host
// renders what is present. `countdownTo` is a generic live-countdown (epoch
// ms) — the host ticks 1s and shows mm:ss until it elapses.
export type SurfaceContent = {
  icon?: IconName
  title?: string
  text?: string
  countdownTo?: number
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
