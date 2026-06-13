// Architecture: background feature layer (Focus Mode). Projects an active focus
// session + config into the generic Surfaces primitive: a blocking overlay
// scoped to the blocklist, and an always-on badge for the new tab. This is the
// ENTIRE focus-specific UI contract — rendering, transport, URL gating, and
// the countdown all live in the generic SurfaceHost. See docs/surfaces.md.
import type { Surface } from "../../../shared/types"
import type { FocusConfig, FocusSession } from "./types"

export const projectFocusSurfaces = (
  session: FocusSession,
  config: FocusConfig,
): Surface[] => {
  if (config.blockedUrlPatterns.length === 0) {
    // Nothing to block — only the badge marks that focus is on.
    return [focusBadge(session)]
  }

  return [
    {
      id: "block",
      kind: "overlay",
      urlMatch: { allowUrls: config.blockedUrlPatterns },
      blocking: true,
      content: {
        icon: "Shield",
        title: "Focus Mode",
        text: "This site is blocked while you focus. End Focus Mode from the Monocle palette to unblock it.",
        countdownTo: session.endsAt,
      },
    },
    focusBadge(session),
  ]
}

const focusBadge = (session: FocusSession): Surface => ({
  id: "badge",
  kind: "badge",
  content: {
    icon: "Shield",
    title: "Focus",
    countdownTo: session.endsAt,
  },
})
