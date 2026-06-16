// Architecture: content layer utility. Best-effort SPA navigation detection:
// history events (popstate/hashchange) plus a low-frequency href poll that
// catches hash-only changes and replaceState-heavy routers. Shared by the
// automation trigger service and the SurfaceHost so the detection logic lives
// in one place. Returns a cleanup function.

const SPA_POLL_INTERVAL_MS = 1000

/**
 * Invokes `onNavigate(href)` whenever the document's URL changes without a full
 * reload. Fires only on actual href changes (deduped against the last value).
 */
export const trackSpaNavigation = (
  onNavigate: (href: string) => void,
): (() => void) => {
  let lastHref = window.location.href

  const handle = (): void => {
    if (window.location.href === lastHref) {
      return
    }
    lastHref = window.location.href
    onNavigate(lastHref)
  }

  window.addEventListener("popstate", handle)
  window.addEventListener("hashchange", handle)
  const poll = window.setInterval(handle, SPA_POLL_INTERVAL_MS)

  return () => {
    window.removeEventListener("popstate", handle)
    window.removeEventListener("hashchange", handle)
    window.clearInterval(poll)
  }
}
