// Architecture: background command layer (tests). The font inspector pushes a
// `picker` surface that requests the font-* computed styles, then (via the
// command-owner surface-action handler it registers) copies a CSS declaration
// block to the page and clears the picker. Surfaces, browser messaging, and the
// handler registry are mocked so the command logic is isolated.
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Surface } from "../../../shared/types"
import type { CommandSurfaceActionHandler } from "../surfaceActionHandlers"

const { upsertSurface, removeSurface, getActiveTab, sendTabMessage, captured } =
  vi.hoisted(() => ({
    upsertSurface: vi.fn(async (_ownerId: string, _surface: Surface) => {}),
    removeSurface: vi.fn(async (_ownerId: string, _surfaceId: string) => {}),
    getActiveTab: vi.fn(async () => ({ id: 7 }) as { id: number } | undefined),
    sendTabMessage: vi.fn(async (_tabId: number, _message: unknown) => {}),
    captured: { handler: undefined as CommandSurfaceActionHandler | undefined },
  }))

vi.mock("../../surfaces", () => ({ upsertSurface, removeSurface }))
vi.mock("../../utils/browser", () => ({ getActiveTab, sendTabMessage }))
vi.mock("../surfaceActionHandlers", () => ({
  registerCommandSurfaceActionHandler: (
    _id: string,
    handler: CommandSurfaceActionHandler,
  ) => {
    captured.handler = handler
  },
}))

import { inspectElementFonts } from "./inspectElementFonts"

const registeredHandler = () => captured.handler

beforeEach(() => {
  upsertSurface.mockClear()
  removeSurface.mockClear()
  sendTabMessage.mockClear()
  getActiveTab.mockResolvedValue({ id: 7 })
})

describe("inspectElementFonts command", () => {
  it("pushes a picker surface requesting the font properties on a web page", async () => {
    await inspectElementFonts.execute?.({
      url: "https://example.com/x",
      title: "Example",
      modifierKey: null,
    })

    expect(upsertSurface).toHaveBeenCalledTimes(1)
    const [ownerId, surface] = upsertSurface.mock.calls[0]
    expect(ownerId).toBe("command:inspect-element-fonts")
    expect(surface).toMatchObject({
      kind: "picker",
      targetTabId: 7,
      urlMatch: { allowUrls: ["https://example.com/x"] },
    })
    expect(surface.content.css).toEqual(
      expect.arrayContaining(["font-family", "font-size", "font-weight"]),
    )
  })

  it("warns and pushes nothing on a non-web page", async () => {
    await inspectElementFonts.execute?.({
      url: "chrome://newtab",
      title: "New Tab",
      modifierKey: null,
    })

    expect(upsertSurface).not.toHaveBeenCalled()
    expect(sendTabMessage).toHaveBeenCalledWith(7, {
      type: "monocle-toast",
      level: "warning",
      message: "Font inspection only works on web pages",
    })
  })
})

describe("inspectElementFonts surface-action handler", () => {
  it("copies a clean one-line summary and toasts it, then clears the picker", async () => {
    expect(registeredHandler()).toBeDefined()
    await registeredHandler()?.("element-picked", {
      tab: { id: 12, url: "https://example.com" },
      selection: {
        selector: "h1",
        tagName: "H1",
        css: {
          // Full fallback stack -> resolved to the primary face.
          "font-family": '"Stuff Text", "Arial", sans-serif',
          "font-size": "28px",
          "font-weight": "500",
          // Default values that must be dropped as noise.
          "font-style": "normal",
          "line-height": "32px",
          // rgb -> hex.
          color: "rgb(109, 0, 198)",
        },
      },
    })

    expect(removeSurface).toHaveBeenCalledWith(
      "command:inspect-element-fonts",
      "picker",
    )
    // family · size/line-height · weight · hex color
    const expected = "Stuff Text · 28px/32px · 500 · #6D00C6"
    expect(sendTabMessage).toHaveBeenCalledWith(12, {
      type: "monocle-copyToClipboard",
      message: expected,
    })
    expect(sendTabMessage).toHaveBeenCalledWith(12, {
      type: "monocle-toast",
      level: "success",
      message: expected,
    })
  })

  it("notes italic and drops line-height when it is normal", async () => {
    await registeredHandler()?.("element-picked", {
      tab: { id: 3, url: "https://example.com" },
      selection: {
        selector: "em",
        tagName: "EM",
        css: {
          "font-family": "Georgia, serif",
          "font-size": "16px",
          "font-weight": "400",
          "font-style": "italic",
          "line-height": "normal",
        },
      },
    })

    expect(sendTabMessage).toHaveBeenCalledWith(3, {
      type: "monocle-copyToClipboard",
      message: "Georgia · 16px · 400 italic",
    })
  })

  it("warns when the picked element reported no font styles", async () => {
    await registeredHandler()?.("element-picked", {
      tab: { id: 12, url: "https://example.com" },
      selection: { selector: "h1", tagName: "H1" },
    })

    expect(removeSurface).toHaveBeenCalled()
    expect(sendTabMessage).toHaveBeenCalledWith(12, {
      type: "monocle-toast",
      level: "warning",
      message: "Couldn't read font styles for that element",
    })
  })
})
