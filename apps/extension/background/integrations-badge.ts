// Architecture: background layer. Keeps the toolbar-icon badge in sync with the
// count of integration requests still awaiting the user's Accept/Reject on the
// Integrations settings page. Driven by `monocle-feature-state` storage changes
// (where pending pairings live), so any begin/accept/reject/expiry updates it
// with no extra wiring. The same count feeds the options-nav badge from the UI.
// See docs/native-messaging/ and the Integrations page.
import { getBrowserAPI } from "../shared/utils/extension-api"
import { getPendingPairings } from "./features/nativeMessaging/pairing"

const BADGE_BG = "#ef4444"

// ponytail: one provider's pending today; sum across providers when the
// extension-to-extension feature lands (it will be a second pending source).
const countPendingRequests = async (): Promise<number> =>
  (await getPendingPairings()).length

const setBadge = async (count: number): Promise<void> => {
  const action = getBrowserAPI().action
  if (!action?.setBadgeText) {
    return
  }
  try {
    await action.setBadgeText({ text: count > 0 ? String(count) : "" })
    if (count > 0) {
      await action.setBadgeBackgroundColor?.({ color: BADGE_BG })
    }
  } catch (error) {
    console.error("[integrations] failed to set toolbar badge:", error)
  }
}

export const refreshIntegrationsBadge = async (): Promise<void> => {
  await setBadge(await countPendingRequests())
}

// Recompute on every feature-state write (cheap; storage events are coarse) and
// once at startup so a request that outlived a worker restart still shows.
export const initIntegrationsBadge = (): void => {
  refreshIntegrationsBadge().catch(console.error)

  getBrowserAPI().storage?.onChanged?.addListener(
    (changes: Record<string, unknown>, areaName: string) => {
      if (areaName === "local" && "monocle-feature-state" in changes) {
        refreshIntegrationsBadge().catch(console.error)
      }
    },
  )
}
