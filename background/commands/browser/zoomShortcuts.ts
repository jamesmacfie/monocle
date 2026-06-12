import type { ActionCommandNode, CommandIcon } from "../../../shared/types"
import { callBrowserAPI, getActiveTab } from "../../utils/browser"

type ZoomCommandConfig = {
  id: string
  name: string
  description: string
  icon: CommandIcon
  keywords: string[]
  execute: () => Promise<void>
}

const MIN_ZOOM_FACTOR = 0.25
const MAX_ZOOM_FACTOR = 5
const ZOOM_STEP = 0.1

const createZoomCommand = ({
  id,
  name,
  description,
  icon,
  keywords,
  execute,
}: ZoomCommandConfig): ActionCommandNode => ({
  type: "action",
  id,
  name,
  description,
  icon,
  color: "blue",
  keywords,
  execute,
})

const stepActiveTabZoom = async (direction: 1 | -1): Promise<void> => {
  const activeTab = await getActiveTab()
  if (!activeTab?.id) {
    return
  }

  const currentZoom: number = await callBrowserAPI(
    "tabs",
    "getZoom",
    activeTab.id,
  )
  const steppedZoom = currentZoom + direction * ZOOM_STEP
  // Round to avoid floating-point drift accumulating across repeated steps
  const nextZoom = Math.min(
    MAX_ZOOM_FACTOR,
    Math.max(MIN_ZOOM_FACTOR, Math.round(steppedZoom * 100) / 100),
  )
  await callBrowserAPI("tabs", "setZoom", activeTab.id, nextZoom)
}

export const zoomIn = createZoomCommand({
  id: "zoom-in",
  name: "Zoom in",
  description: "Increase the zoom level of the current tab",
  icon: { type: "lucide", name: "ZoomIn" },
  keywords: ["zoom", "in", "magnify", "bigger", "page"],
  execute: async () => stepActiveTabZoom(1),
})

export const zoomOut = createZoomCommand({
  id: "zoom-out",
  name: "Zoom out",
  description: "Decrease the zoom level of the current tab",
  icon: { type: "lucide", name: "ZoomOut" },
  keywords: ["zoom", "out", "shrink", "smaller", "page"],
  execute: async () => stepActiveTabZoom(-1),
})

export const zoomReset = createZoomCommand({
  id: "zoom-reset",
  name: "Reset zoom",
  description: "Reset the current tab zoom to the default level",
  icon: { type: "lucide", name: "RotateCcw" },
  keywords: ["zoom", "reset", "default", "100", "page"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    // A zoom factor of 0 sets the tab to its per-origin default zoom
    await callBrowserAPI("tabs", "setZoom", activeTab.id, 0)
  },
})

export const zoomShortcutCommands = [zoomIn, zoomOut, zoomReset]
