// Browser extension events
import type { Icon } from "./commands"

export type AlertEvent = {
  type: "monocle-alert"
  level: "info" | "warning" | "success" | "error"
  message: string
  icon?: Icon
  copyText?: string
}

export type CopyToClipboardEvent = {
  type: "monocle-copyToClipboard"
  message: string
}

export type NewTabEvent = {
  type: "monocle-newTab"
  url: string
}

export type Event = AlertEvent | CopyToClipboardEvent | NewTabEvent
export type BrowserEvent = Event
