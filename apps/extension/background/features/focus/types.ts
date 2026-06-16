// Architecture: background feature layer (Focus Mode). Focus's own types. These
// were once a shared contract (shared/types/focus.ts) when content had bespoke
// focus UI; now that Focus renders through the generic Surfaces primitive,
// nothing outside the background needs them. Durable config lives in
// monocle-feature-config; the session lives in monocle-feature-state. The
// session is timestamp-based — "active" is computed from endsAt. See
// docs/focus-mode.md.

export type FocusConfig = {
  blockedUrlPatterns: string[]
  defaultDurationMinutes: number
}

export const FOCUS_FEATURE_ID = "focus-mode"

export const focusConfigDefaults: FocusConfig = {
  blockedUrlPatterns: [],
  defaultDurationMinutes: 25,
}

export type FocusSessionMode = "indefinite" | "timed" | "pomodoro"

export type FocusSession = {
  startedAt: number
  // Absent for an indefinite session.
  endsAt?: number
  mode: FocusSessionMode
}

export type FocusState = {
  session?: FocusSession
}
