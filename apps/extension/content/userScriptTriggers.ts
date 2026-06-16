// Architecture: content layer. The page-side user-script trigger service:
// pulls armed trigger specs for the current URL from the background
// (`get-user-script-triggers`), then watches the page and reports fires
// back (`user-script-trigger-fired`). Content holds NO script steps and
// executes nothing on its own — the background re-validates every fire
// (background/userScripts/triggerEngine.ts) and the engine enforces
// cooldowns/concurrency. Mechanics: one shared MutationObserver serves all
// elementAppears selectors (per-trigger throttled, floor 250ms);
// SPA navigation is detected best-effort content-side (popstate/hashchange
// plus a low-frequency href poll) to avoid the webNavigation install-time
// permission; oncePerPage bookkeeping is per document, so real navigation
// resets it naturally. Initialized from entrypoints/content.tsx; top frame
// only (the content script does not run in iframes).
import type { UserScriptPageTriggerSpec } from "../shared/types"
import { sendRuntimeMessageSafe } from "../shared/utils/extension-api"
import { trackSpaNavigation } from "./utils/spaNavigation"
import { findElement } from "./workflow/dom"

const MATCHED_TEXT_CAP = 500

type ArmedElementTrigger = {
  scriptId: string
  selector: Parameters<typeof findElement>[0]
  oncePerPage: boolean
  throttleMs: number
  lastCheckedAt: number
  fired: boolean
  checking: boolean
}

type ArmedUrlTrigger = {
  scriptId: string
  on: Array<"load" | "spa">
  oncePerPage: boolean
  delayMs: number
  firedForHref: Set<string>
  firedThisPage: boolean
}

const state = {
  urlTriggers: [] as ArmedUrlTrigger[],
  elementTriggers: [] as ArmedElementTrigger[],
  observer: null as MutationObserver | null,
  currentHref: "",
  initialized: false,
}

const reportFire = (
  scriptId: string,
  type: "urlMatch" | "elementAppears",
  matchedText?: string,
): void => {
  void sendRuntimeMessageSafe({
    type: "user-script-trigger-fired",
    scriptId,
    trigger: {
      type,
      url: window.location.href,
      ...(matchedText !== undefined
        ? { matchedText: matchedText.slice(0, MATCHED_TEXT_CAP) }
        : {}),
    },
  })
}

// ---------------------------------------------------------------------------
// Arming

const armTriggers = (specs: UserScriptPageTriggerSpec[]): void => {
  state.urlTriggers = []
  state.elementTriggers = []

  for (const spec of specs) {
    if (spec.trigger.type === "urlMatch") {
      state.urlTriggers.push({
        scriptId: spec.scriptId,
        on: spec.trigger.on ?? ["load", "spa"],
        oncePerPage: spec.trigger.oncePerPage !== false,
        delayMs: spec.trigger.delayMs ?? 0,
        firedForHref: new Set(),
        firedThisPage: false,
      })
    } else if (spec.trigger.type === "elementAppears") {
      state.elementTriggers.push({
        scriptId: spec.scriptId,
        selector: spec.trigger.selector,
        oncePerPage: spec.trigger.oncePerPage !== false,
        throttleMs: Math.max(spec.trigger.throttleMs ?? 1000, 250),
        lastCheckedAt: 0,
        fired: false,
        checking: false,
      })
    }
  }

  syncObserver()
}

const refreshTriggersForUrl = async (
  fireKind: "load" | "spa",
): Promise<void> => {
  const response = await sendRuntimeMessageSafe<{
    triggers?: UserScriptPageTriggerSpec[]
  }>({
    type: "get-user-script-triggers",
    url: window.location.href,
  })

  armTriggers(response?.triggers ?? [])
  fireUrlTriggers(fireKind)
  checkElementTriggers()
}

// ---------------------------------------------------------------------------
// urlMatch

const fireUrlTriggers = (kind: "load" | "spa"): void => {
  const href = window.location.href

  for (const trigger of state.urlTriggers) {
    if (!trigger.on.includes(kind)) {
      continue
    }

    if (trigger.oncePerPage) {
      // Per document for load; per virtual location for SPA — a noisy
      // router can't re-fire on every route tick.
      if (kind === "load" && trigger.firedThisPage) {
        continue
      }
      if (trigger.firedForHref.has(href)) {
        continue
      }
    }

    trigger.firedThisPage = true
    trigger.firedForHref.add(href)

    if (trigger.delayMs > 0) {
      setTimeout(
        () => reportFire(trigger.scriptId, "urlMatch"),
        trigger.delayMs,
      )
    } else {
      reportFire(trigger.scriptId, "urlMatch")
    }
  }
}

// ---------------------------------------------------------------------------
// elementAppears — one observer, many selectors

const syncObserver = (): void => {
  const needsObserver = state.elementTriggers.some(
    (trigger) => !(trigger.oncePerPage && trigger.fired),
  )

  if (!needsObserver) {
    state.observer?.disconnect()
    state.observer = null
    return
  }

  if (state.observer) {
    return
  }

  state.observer = new MutationObserver(() => {
    checkElementTriggers()
  })
  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  })
}

const checkElementTriggers = (): void => {
  const now = Date.now()

  for (const trigger of state.elementTriggers) {
    if (trigger.checking || (trigger.oncePerPage && trigger.fired)) {
      continue
    }
    if (now - trigger.lastCheckedAt < trigger.throttleMs) {
      continue
    }

    trigger.lastCheckedAt = now
    trigger.checking = true

    findElement(trigger.selector)
      .then((element) => {
        trigger.checking = false
        if (!element) {
          return
        }
        if (trigger.oncePerPage && trigger.fired) {
          return
        }
        trigger.fired = true
        reportFire(
          trigger.scriptId,
          "elementAppears",
          element.textContent?.trim() ?? "",
        )
        syncObserver()
      })
      .catch(() => {
        trigger.checking = false
      })
  }
}

// ---------------------------------------------------------------------------
// SPA detection via the shared content utility (history events + href poll).

/**
 * Starts the trigger service for this page. Safe to call once per document;
 * does nothing on extension pages (no http(s) URL) — the background also
 * refuses such URLs.
 */
export const initializeUserScriptTriggers = (): void => {
  if (state.initialized) {
    return
  }
  state.initialized = true

  if (!/^https?:/.test(window.location.protocol)) {
    return
  }

  state.currentHref = window.location.href

  // Re-pull specs on virtual navigation: the new URL may arm a different set.
  trackSpaNavigation(() => void refreshTriggersForUrl("spa"))

  if (document.readyState === "complete") {
    void refreshTriggersForUrl("load")
  } else {
    window.addEventListener("load", () => void refreshTriggersForUrl("load"), {
      once: true,
    })
  }
}
