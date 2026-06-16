import type { ActionCommandNode } from "../../../shared/types"
import {
  captureVisibleTab,
  getActiveTab,
  sendTabMessage,
} from "../../utils/browser"

// Build a filesystem-friendly screenshot name from the page host and the
// current time, e.g. `screenshot-example.com-2026-06-08T13-24-05.png`.
function buildFilename(url?: string): string {
  let host = "screenshot"
  if (url) {
    try {
      host = new URL(url).hostname || host
    } catch {
      // Leave the default for non-URL pages (e.g. the new-tab page).
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `screenshot-${host}-${stamp}.png`
}

export const captureScreenshot: ActionCommandNode = {
  type: "action",
  id: "capture-screenshot",
  name: "Capture screenshot",
  description: "Capture the visible area of the page",
  icon: { type: "lucide", name: "Camera" },
  color: "blue",
  keywords: ["screenshot", "capture", "screen", "image", "snapshot"],
  actionLabel: "Copy to clipboard",
  modifierActionLabel: {
    cmd: "Download",
  },
  execute: async (context) => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    // Hide the palette overlay before capturing so it isn't in the screenshot.
    // The content side acknowledges only after the overlay has been painted
    // out; best-effort because surfaces without the palette state handler
    // (e.g. the new tab page) simply won't respond.
    await sendTabMessage(activeTab.id, {
      type: "monocle-ui-hide",
    } as any).catch(() => {})

    let dataUrl: string
    try {
      dataUrl = await captureVisibleTab(activeTab.windowId)
    } catch (error) {
      console.error("Failed to capture screenshot:", error)
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "error",
        message: "Failed to capture screenshot",
      })
      return
    }

    const isDownload = context?.modifierKey === "cmd"

    await sendTabMessage(activeTab.id, {
      type: "monocle-screenshot",
      mode: isDownload ? "download" : "clipboard",
      dataUrl,
      filename: isDownload ? buildFilename(context?.url) : undefined,
    })

    await sendTabMessage(activeTab.id, {
      type: "monocle-toast",
      level: "success",
      message: isDownload
        ? "Screenshot saved to downloads"
        : "Screenshot copied to clipboard",
    })
  },
}
