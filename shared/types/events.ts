// Browser extension events

// Icon type for events (matches Alert component expectations)
type LegacyIcon = {
  name?: string
  url?: string
}

export type AlertEvent = {
  type: "monocle-alert"
  level: "info" | "warning" | "success" | "error"
  message: string
  icon?: LegacyIcon
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

export type ToastEvent = {
  type: "monocle-toast"
  level: "info" | "warning" | "success" | "error"
  message: string
}

export type SiteSdkSyncRequestEvent = {
  type: "monocle-sdk-sync-request"
}

export type SiteSdkInvokeEvent = {
  type: "monocle-sdk-invoke"
  request: import("./siteSdk").SiteSdkInvokeRequest
}

export type Event =
  | AlertEvent
  | CopyToClipboardEvent
  | NewTabEvent
  | ToastEvent
  | SiteSdkSyncRequestEvent
  | SiteSdkInvokeEvent
export type BrowserEvent = Event
