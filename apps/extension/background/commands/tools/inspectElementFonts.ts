import type { ActionCommandNode } from "../../../shared/types"
import { removeSurface, upsertSurface } from "../../surfaces"
import { getActiveTab, sendTabMessage } from "../../utils/browser"
import { registerCommandSurfaceActionHandler } from "../surfaceActionHandlers"

// A "what font is this" command (the WhatFont pattern). It pushes a `picker`
// surface that asks content to capture the font-* computed styles of the clicked
// element (via the picker surface's `content.css` config), then — because an MV3
// service worker has no clipboard — copies a clean one-line summary by messaging
// the tab (the same `monocle-copyToClipboard` + `monocle-toast` path the copy
// commands use) and clears the picker. The picker -> surface-action callback
// reaches this command through the command-owner routing in
// background/messages/surfaceAction.ts. See docs/surfaces.md and
// docs/commands/tools.md.
const COMMAND_ID = "inspect-element-fonts"
const OWNER_ID = `command:${COMMAND_ID}`
const SURFACE_ID = "picker"

// The computed properties to capture. font-style is captured only so an italic
// can be noted; letter-spacing and other noise are deliberately left out.
const FONT_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "color",
]

// '"Stuff Text", "Arial", sans-serif' -> "Stuff Text". The computed value lists
// the whole fallback stack; the first entry is the intended/used face.
const primaryFamily = (fontFamily: string): string =>
  fontFamily
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "") ?? fontFamily

// "rgb(109, 0, 198)" -> "#6D00C6". Leaves non-rgb values (e.g. a keyword)
// untouched.
const toHexColor = (color: string): string => {
  const match = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (!match) {
    return color
  }
  const hex = (n: string) => Number(n).toString(16).padStart(2, "0")
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`.toUpperCase()
}

// Build the compact one-liner: "Stuff Text · 28px/32px · 500 · #6D00C6"
// (family · size[/line-height] · weight[ italic] · hex color). Each segment is
// dropped when its value is absent or a default, so there's no noise.
const buildSummary = (css: Record<string, string>): string => {
  const family = css["font-family"] ? primaryFamily(css["font-family"]) : null

  const size = css["font-size"]
  const lineHeight = css["line-height"]
  const sizePart = size
    ? lineHeight && lineHeight !== "normal"
      ? `${size}/${lineHeight}`
      : size
    : null

  const weight = css["font-weight"]
  const italic = css["font-style"] && css["font-style"] !== "normal"
  const weightPart = weight
    ? italic
      ? `${weight} ${css["font-style"]}`
      : weight
    : italic
      ? css["font-style"]
      : null

  const color = css.color ? toHexColor(css.color) : null

  return [family, sizePart, weightPart, color].filter(Boolean).join(" · ")
}

export const inspectElementFonts: ActionCommandNode = {
  id: COMMAND_ID,
  type: "action",
  name: "Inspect element fonts",
  description: "Pick an element and copy its computed font styles",
  icon: { type: "lucide", name: "TextSearch" },
  color: "purple",
  keywords: ["font", "fonts", "whatfont", "typography", "typeface", "css"],
  execute: async (context) => {
    const url = context?.url ?? ""

    // Pick-mode only makes sense on a real http(s) page where a content script
    // (and the SurfaceHost) is present — not the new tab, chrome://, or about:.
    if (!/^https?:\/\//i.test(url)) {
      const activeTab = await getActiveTab()
      if (activeTab?.id) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-toast",
          level: "warning",
          message: "Font inspection only works on web pages",
        })
      }
      return
    }

    const activeTab = await getActiveTab()
    await upsertSurface(OWNER_ID, {
      id: SURFACE_ID,
      kind: "picker",
      urlMatch: { allowUrls: [url] },
      ...(activeTab?.id ? { targetTabId: activeTab.id } : {}),
      content: {
        title: "Pick an element to inspect its fonts",
        text: "Click an element to copy its computed font styles · Esc to cancel",
        css: FONT_PROPS,
      },
    })
  },
}

// Receives the picked element (with its computed css) and finishes the flow.
registerCommandSurfaceActionHandler(COMMAND_ID, async (_actionId, ctx) => {
  // Always clear the picker so pick-mode ends after a click.
  await removeSurface(OWNER_ID, SURFACE_ID)

  const css = ctx.selection?.css
  const tabId = ctx.tab?.id
  if (!tabId) {
    return
  }
  const summary = css ? buildSummary(css) : ""
  if (!summary) {
    await sendTabMessage(tabId, {
      type: "monocle-toast",
      level: "warning",
      message: "Couldn't read font styles for that element",
    })
    return
  }

  // The clean one-liner is both copied and shown — short enough to be either.
  await sendTabMessage(tabId, {
    type: "monocle-clipboard-write",
    message: summary,
  })
  await sendTabMessage(tabId, {
    type: "monocle-toast",
    level: "success",
    message: summary,
  })
})
