import type {
  ActionCommandNode,
  CommandIcon,
  ScrollEvent,
} from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

type ScrollCommandConfig = {
  id: string
  name: string
  description: string
  icon: CommandIcon
  event: ScrollEvent
  keywords: string[]
}

const sendScrollEvent = async (event: ScrollEvent) => {
  const activeTab = await getActiveTab()
  if (!activeTab?.id) {
    return
  }

  await sendTabMessage(activeTab.id, event)
}

const createScrollCommand = ({
  id,
  name,
  description,
  icon,
  event,
  keywords,
}: ScrollCommandConfig): ActionCommandNode => ({
  type: "action",
  id,
  name,
  description,
  icon,
  color: "blue",
  keywords,
  execute: async () => sendScrollEvent(event),
})

export const scrollLineDown = createScrollCommand({
  id: "scroll-line-down",
  name: "Scroll down",
  description: "Scroll the current page down by a small amount",
  icon: { type: "lucide", name: "ArrowDownToLine" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: 1,
    unit: "line",
  },
  keywords: ["scroll", "down", "vim", "j"],
})

export const scrollLineUp = createScrollCommand({
  id: "scroll-line-up",
  name: "Scroll up",
  description: "Scroll the current page up by a small amount",
  icon: { type: "lucide", name: "ArrowUp" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: -1,
    unit: "line",
  },
  keywords: ["scroll", "up", "vim", "k"],
})

export const scrollLeft = createScrollCommand({
  id: "scroll-left",
  name: "Scroll left",
  description: "Scroll the current page left by a small amount",
  icon: { type: "lucide", name: "ArrowLeft" },
  event: {
    type: "monocle-scroll",
    axis: "x",
    amount: -1,
    unit: "line",
  },
  keywords: ["scroll", "left", "vim", "h"],
})

export const scrollRight = createScrollCommand({
  id: "scroll-right",
  name: "Scroll right",
  description: "Scroll the current page right by a small amount",
  icon: { type: "lucide", name: "ArrowRight" },
  event: {
    type: "monocle-scroll",
    axis: "x",
    amount: 1,
    unit: "line",
  },
  keywords: ["scroll", "right", "vim", "l"],
})

export const scrollHalfPageDown = createScrollCommand({
  id: "scroll-half-page-down",
  name: "Scroll half page down",
  description: "Scroll the current page down by half a viewport",
  icon: { type: "lucide", name: "ArrowDownToLine" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: 0.5,
    unit: "viewport",
  },
  keywords: ["scroll", "half", "page", "down", "vim"],
})

export const scrollHalfPageUp = createScrollCommand({
  id: "scroll-half-page-up",
  name: "Scroll half page up",
  description: "Scroll the current page up by half a viewport",
  icon: { type: "lucide", name: "ArrowUpToLine" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: -0.5,
    unit: "viewport",
  },
  keywords: ["scroll", "half", "page", "up", "vim"],
})

export const scrollFullPageDown = createScrollCommand({
  id: "scroll-full-page-down",
  name: "Scroll page down",
  description: "Scroll the current page down by one viewport",
  icon: { type: "lucide", name: "ArrowDownToLine" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: 1,
    unit: "viewport",
  },
  keywords: ["scroll", "page", "down", "vim"],
})

export const scrollFullPageUp = createScrollCommand({
  id: "scroll-full-page-up",
  name: "Scroll page up",
  description: "Scroll the current page up by one viewport",
  icon: { type: "lucide", name: "ArrowUpToLine" },
  event: {
    type: "monocle-scroll",
    axis: "y",
    amount: -1,
    unit: "viewport",
  },
  keywords: ["scroll", "page", "up", "vim"],
})

export const scrollFarLeft = createScrollCommand({
  id: "scroll-far-left",
  name: "Scroll to far left",
  description: "Scroll the current page to the left edge",
  icon: { type: "lucide", name: "ArrowLeft" },
  event: {
    type: "monocle-scroll",
    axis: "x",
    edge: "start",
  },
  keywords: ["scroll", "left", "edge", "vim"],
})

export const scrollFarRight = createScrollCommand({
  id: "scroll-far-right",
  name: "Scroll to far right",
  description: "Scroll the current page to the right edge",
  icon: { type: "lucide", name: "ArrowRight" },
  event: {
    type: "monocle-scroll",
    axis: "x",
    edge: "end",
  },
  keywords: ["scroll", "right", "edge", "vim"],
})

export const pageScrollShortcutCommands = [
  scrollLineDown,
  scrollLineUp,
  scrollLeft,
  scrollRight,
  scrollHalfPageDown,
  scrollHalfPageUp,
  scrollFullPageDown,
  scrollFullPageUp,
  scrollFarLeft,
  scrollFarRight,
]
