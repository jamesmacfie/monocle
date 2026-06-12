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

// Insert text at the caret of the page's last-focused editable element.
// The content listener responds with { inserted: boolean } so the caller
// can fall back (e.g. to a clipboard copy) when nothing was focused.
export type InsertTextEvent = {
  type: "monocle-insertText"
  text: string
}

export type NewTabEvent = {
  type: "monocle-newTab"
  url: string
}

export type ScrollEvent = {
  type: "monocle-scroll"
} & (
  | {
      direction: "top" | "bottom"
    }
  | {
      axis: "x" | "y"
      amount: number
      unit: "line" | "viewport" | "pixel"
    }
  | {
      axis: "x" | "y"
      edge: "start" | "end"
    }
)

export type ScreenshotEvent = {
  type: "monocle-screenshot"
  // "clipboard" writes the image to the clipboard; "download" saves it to the
  // browser's downloads folder. Both run page-side because clipboard image
  // writes and anchor downloads need a DOM/document context.
  mode: "clipboard" | "download"
  dataUrl: string
  filename?: string
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
  | InsertTextEvent
  | NewTabEvent
  | ScrollEvent
  | ScreenshotEvent
  | ToastEvent
  | SiteSdkSyncRequestEvent
  | SiteSdkInvokeEvent
export type BrowserEvent = Event
