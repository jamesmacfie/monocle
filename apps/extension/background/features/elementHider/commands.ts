// Architecture: background feature layer (Element Hider). The palette commands.
// "Hide element on this page" pushes a generic `picker` surface onto the active
// tab (owner = the feature id, so the click is routed back to this feature's
// handleAction). It does NOT hide anything itself — content reports the picked
// element, the feature decides. "Manage hidden elements" opens the settings
// page. See docs/element-hider.md.
import type { ActionCommandNode, CommandNode } from "../../../shared/types"
import { openOptionsPage } from "../../../shared/utils/extension-api"
import { showToast } from "../../messages/showToast"
import { upsertSurface } from "../../surfaces"
import { getActiveTab, sendTabMessage } from "../../utils/browser"
import { ensureHostPermission } from "../../utils/hostPermissions"
import { ELEMENT_HIDER_FEATURE_ID } from "./types"

export const PICKER_SURFACE_ID = "picker"

const pickElementCommand: ActionCommandNode = {
  id: "element-hider-pick",
  type: "action",
  name: "Hide element on this page",
  description: "Pick an element to hide on this site",
  icon: { type: "lucide", name: "EyeOff" },
  color: "purple",
  keywords: ["hide", "element", "block", "declutter", "remove", "picker"],
  execute: async (context) => {
    const url = context?.url ?? ""
    const activeTab = await getActiveTab()

    // Picking only makes sense on real http(s) pages.
    if (!/^https?:\/\//i.test(url)) {
      if (activeTab?.id) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-toast",
          level: "warning",
          message: "Element picking only works on web pages",
        }).catch(() => undefined)
      }
      return
    }

    const hostAccess = await ensureHostPermission({
      tabId: activeTab?.id,
      url,
      reason: "elementHider",
      request: true,
      ensureContentScript: true,
    })

    if (!hostAccess.granted) {
      await showToast({
        type: "monocle-toast-show",
        level: "warning",
        message:
          hostAccess.error ??
          "Grant site access before hiding elements on this page",
      })
      return
    }

    await upsertSurface(ELEMENT_HIDER_FEATURE_ID, {
      id: PICKER_SURFACE_ID,
      kind: "picker",
      // Scope the picker to the page it was launched on.
      urlMatch: { allowUrls: [url] },
      ...(activeTab?.id ? { targetTabId: activeTab.id } : {}),
      content: {
        icon: "EyeOff",
        title: "Pick an element to hide",
        text: "Click an element to hide it on this site · Esc to cancel",
      },
    })
  },
}

const manageCommand: ActionCommandNode = {
  id: "element-hider-manage",
  type: "action",
  name: "Manage hidden elements",
  description: "Open Element Hider settings",
  icon: { type: "lucide", name: "Eye" },
  color: "purple",
  keywords: ["hidden", "elements", "manage", "unhide", "settings"],
  execute: async () => {
    await openOptionsPage(`/features/${ELEMENT_HIDER_FEATURE_ID}`)
  },
}

export const elementHiderCommands = (): CommandNode[] => [
  pickElementCommand,
  manageCommand,
]
