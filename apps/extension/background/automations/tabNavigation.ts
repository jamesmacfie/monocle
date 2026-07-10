// Architecture: background layer. Generic browser-tab navigation waits used
// by the automation engine; this module has no automation run-state knowledge.
import { getBrowserAPI } from "../../shared/utils/extension-api"

export const NAVIGATION_COMPLETE_TIMEOUT_MS = 15_000
const NO_NAVIGATION_GRACE_MS = 1500

export type NavigationWaitResult =
  | { kind: "navigated" }
  | { kind: "noNavigation" }
  | { kind: "timeout" }

/** Resolves when the tab completes loading, or after a bounded timeout. */
export const waitForTabComplete = (tabId: number): Promise<void> =>
  new Promise((resolve) => {
    const onUpdated = getBrowserAPI().tabs?.onUpdated

    if (!onUpdated?.addListener) {
      setTimeout(resolve, 1000)
      return
    }

    let settled = false
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      onUpdated.removeListener?.(listener)
      clearTimeout(timeoutId)
      resolve()
    }

    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ): void => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish()
      }
    }

    const timeoutId = setTimeout(finish, NAVIGATION_COMPLETE_TIMEOUT_MS)
    onUpdated.addListener(listener)
  })

export const waitForNavigationAfterAction = (
  tabId: number,
  timeoutMs: number,
): Promise<NavigationWaitResult> =>
  new Promise((resolve) => {
    const onUpdated = getBrowserAPI().tabs?.onUpdated

    if (!onUpdated?.addListener) {
      setTimeout(
        () => resolve({ kind: "noNavigation" }),
        NO_NAVIGATION_GRACE_MS,
      )
      return
    }

    let settled = false
    let navigationStarted = false

    const finish = (result: NavigationWaitResult): void => {
      if (settled) {
        return
      }
      settled = true
      onUpdated.removeListener?.(listener)
      clearTimeout(graceId)
      clearTimeout(timeoutId)
      resolve(result)
    }

    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ): void => {
      if (updatedTabId !== tabId) {
        return
      }
      if (changeInfo.status === "loading") {
        navigationStarted = true
        clearTimeout(graceId)
      } else if (changeInfo.status === "complete") {
        navigationStarted = true
        finish({ kind: "navigated" })
      }
    }

    const graceId = setTimeout(() => {
      if (!navigationStarted) {
        finish({ kind: "noNavigation" })
      }
    }, NO_NAVIGATION_GRACE_MS)
    const timeoutId = setTimeout(() => finish({ kind: "timeout" }), timeoutMs)
    onUpdated.addListener(listener)
  })

export const readTabPageContext = async (
  tabId: number,
): Promise<{ url?: string; title?: string } | null> => {
  try {
    const tab = await getBrowserAPI().tabs.get(tabId)
    return {
      ...(typeof tab?.url === "string" ? { url: tab.url } : {}),
      ...(typeof tab?.title === "string" ? { title: tab.title } : {}),
    }
  } catch {
    return null
  }
}
