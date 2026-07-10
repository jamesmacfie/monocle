// Browser extension events. Runtime schemas live in
// contentMessageValidation.ts; these aliases keep the established public type
// names while deriving them from the validated background -> tab contract.
import type { ContentMessage } from "./contentMessageValidation"

export type CopyToClipboardEvent = Extract<
  ContentMessage,
  { type: "monocle-clipboard-write" }
>

// Insert text at the caret of the page's last-focused editable element.
// The content listener responds with { inserted: boolean } so the caller
// can fall back (e.g. to a clipboard copy) when nothing was focused.
export type InsertTextEvent = Extract<
  ContentMessage,
  { type: "monocle-text-insert" }
>

export type NewTabEvent = Extract<ContentMessage, { type: "monocle-tab-open" }>

export type ScrollEvent = Extract<ContentMessage, { type: "monocle-scroll" }>

// "clipboard" writes the image to the clipboard; "download" saves it to the
// browser's downloads folder. Both run page-side because clipboard image
// writes and anchor downloads need a DOM/document context.
export type ScreenshotEvent = Extract<
  ContentMessage,
  { type: "monocle-screenshot" }
>

export type ToastEvent = Extract<ContentMessage, { type: "monocle-toast" }>

export type SiteSdkSyncRequestEvent = Extract<
  ContentMessage,
  { type: "monocle-site-sdk-sync-request" }
>

export type SiteSdkInvokeEvent = Extract<
  ContentMessage,
  { type: "monocle-site-sdk-invoke" }
>

// Broadcast to every tab when the background-owned surfaces store changes
// (any owner: a feature like Focus Mode, or an automation). Carries
// no payload; the SurfaceHost re-queries get-surfaces. See docs/surfaces.md.
export type SurfacesChangedEvent = Extract<
  ContentMessage,
  { type: "monocle-surfaces-changed" }
>

export type Event = Extract<ContentMessage, { type: `monocle-${string}` }>
export type BrowserEvent = Event
