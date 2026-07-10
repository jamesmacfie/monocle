// Architecture: background message layer (tests). surface-action routing:
// `dismiss` removes the surface; any other action is dispatched to the owner
// feature's handleAction with the picker selection and sender tab. The features
// registry and surfaces store are mocked so the routing logic is isolated.
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  removeSurface,
  getSurfacesForUrl,
  getFeatureById,
  getCommandSurfaceActionHandler,
  runAutomationSurfaceAction,
} = vi.hoisted(() => ({
  removeSurface: vi.fn(async () => {}),
  getSurfacesForUrl: vi.fn(),
  getFeatureById: vi.fn(),
  getCommandSurfaceActionHandler: vi.fn(),
  runAutomationSurfaceAction: vi.fn(),
}))

vi.mock("../surfaces", () => ({ removeSurface, getSurfacesForUrl }))
vi.mock("../features", () => ({ getFeatureById }))
vi.mock("../automations/engine", () => ({ runAutomationSurfaceAction }))
vi.mock("../commands/surfaceActionHandlers", () => ({
  getCommandSurfaceActionHandler,
}))

import { surfaceAction } from "./surfaceAction"

beforeEach(() => {
  removeSurface.mockClear()
  getFeatureById.mockReset()
  getCommandSurfaceActionHandler.mockReset()
  getSurfacesForUrl.mockReset()
  runAutomationSurfaceAction.mockReset()
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

  it("verifies and runs an active automation-owned inline action", async () => {
    getSurfacesForUrl.mockResolvedValue([
      {
        id: "open-ide",
        ownerId: "automation:a1",
        kind: "inline",
        placement: { selector: "#header", position: "after" },
        actions: [{ id: "open", label: "Open" }],
        content: {},
      },
    ])
    runAutomationSurfaceAction.mockResolvedValue({
      success: true,
      completedSteps: 2,
    })

    const result = await surfaceAction(
      {
        type: "monocle-surface-action",
        ownerId: "automation:a1",
        surfaceId: "open-ide",
        actionId: "open",
      },
      { frameId: 0, tab: { id: 7, url: "https://github.com/a/b", title: "b" } },
    )

    expect(getSurfacesForUrl).toHaveBeenCalledWith("https://github.com/a/b", 7)
    expect(runAutomationSurfaceAction).toHaveBeenCalledWith("a1", {
      surfaceId: "open-ide",
      actionId: "open",
      tabId: 7,
      context: {
        url: "https://github.com/a/b",
        title: "b",
        modifierKey: null,
      },
    })
    expect(result).toMatchObject({ success: true })
  })

  it("rejects missing sender context, child frames, and forged stale actions", async () => {
    getSurfacesForUrl.mockResolvedValue([])
    const message = {
      type: "monocle-surface-action" as const,
      ownerId: "automation:a1",
      surfaceId: "open-ide",
      actionId: "forged",
    }
    expect(await surfaceAction(message)).toMatchObject({ success: false })
    expect(
      await surfaceAction(message, {
        frameId: 3,
        tab: { id: 7, url: "https://github.com/a/b" },
      }),
    ).toMatchObject({ success: false })
    expect(
      await surfaceAction(message, {
        frameId: 0,
        tab: { id: 7, url: "https://github.com/a/b" },
      }),
    ).toMatchObject({ success: false })
    expect(runAutomationSurfaceAction).not.toHaveBeenCalled()
  })
})
