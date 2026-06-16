// Architecture: background message layer (tests). surface-action routing:
// `dismiss` removes the surface; any other action is dispatched to the owner
// feature's handleAction with the picker selection and sender tab. The features
// registry and surfaces store are mocked so the routing logic is isolated.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { removeSurface, getFeatureById, getCommandSurfaceActionHandler } =
  vi.hoisted(() => ({
    removeSurface: vi.fn(async () => {}),
    getFeatureById: vi.fn(),
    getCommandSurfaceActionHandler: vi.fn(),
  }))

vi.mock("../surfaces", () => ({ removeSurface }))
vi.mock("../features", () => ({ getFeatureById }))
vi.mock("../commands/surfaceActionHandlers", () => ({
  getCommandSurfaceActionHandler,
}))

import { surfaceAction } from "./surfaceAction"

beforeEach(() => {
  removeSurface.mockClear()
  getFeatureById.mockReset()
  getCommandSurfaceActionHandler.mockReset()
})

describe("surfaceAction", () => {
  it("dismiss removes the surface", async () => {
    const result = await surfaceAction({
      type: "monocle-surface-action",
      ownerId: "element-hider",
      surfaceId: "picker",
      actionId: "dismiss",
    })
    expect(result).toEqual({ success: true })
    expect(removeSurface).toHaveBeenCalledWith("element-hider", "picker")
  })

  it("routes a non-dismiss action to the owner feature's handleAction", async () => {
    const handleAction = vi.fn(async () => {})
    getFeatureById.mockReturnValue({ settings: { handleAction } })

    const result = await surfaceAction(
      {
        type: "monocle-surface-action",
        ownerId: "element-hider",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: { selector: ".ad", tagName: "DIV" },
      },
      { tab: { id: 9, url: "https://a.com/x" } },
    )

    expect(result).toEqual({ success: true })
    expect(getFeatureById).toHaveBeenCalledWith("element-hider")
    expect(handleAction).toHaveBeenCalledWith("element-picked", {
      selection: { selector: ".ad", tagName: "DIV" },
      tab: { id: 9, url: "https://a.com/x" },
    })
  })

  it("routes a command-owned action to the registered command handler", async () => {
    const handler = vi.fn(async () => {})
    getCommandSurfaceActionHandler.mockReturnValue(handler)

    const result = await surfaceAction(
      {
        type: "monocle-surface-action",
        ownerId: "command:inspect-element-fonts",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: {
          selector: "h1",
          tagName: "H1",
          css: { color: "rgb(0,0,0)" },
        },
      },
      { tab: { id: 4, url: "https://a.com" } },
    )

    expect(result).toEqual({ success: true })
    expect(getCommandSurfaceActionHandler).toHaveBeenCalledWith(
      "inspect-element-fonts",
    )
    expect(handler).toHaveBeenCalledWith("element-picked", {
      selection: {
        selector: "h1",
        tagName: "H1",
        css: { color: "rgb(0,0,0)" },
      },
      tab: { id: 4, url: "https://a.com" },
    })
    // Command owners never fall through to feature routing.
    expect(getFeatureById).not.toHaveBeenCalled()
  })

  it("is a no-op for a command owner with no registered handler", async () => {
    getCommandSurfaceActionHandler.mockReturnValue(undefined)
    const result = await surfaceAction({
      type: "monocle-surface-action",
      ownerId: "command:something",
      surfaceId: "s",
      actionId: "do-thing",
    })
    expect(result).toEqual({ success: false })
    expect(getFeatureById).not.toHaveBeenCalled()
    expect(removeSurface).not.toHaveBeenCalled()
  })

  it("is a no-op for an unknown feature owner", async () => {
    getFeatureById.mockReturnValue(undefined)
    const result = await surfaceAction({
      type: "monocle-surface-action",
      ownerId: "missing-feature",
      surfaceId: "s",
      actionId: "do-thing",
    })
    expect(result).toEqual({ success: false })
    expect(getFeatureById).toHaveBeenCalledWith("missing-feature")
  })
})
