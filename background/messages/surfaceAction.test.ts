// Architecture: background message layer (tests). surface-action routing:
// `dismiss` removes the surface; any other action is dispatched to the owner
// feature's handleAction with the picker selection and sender tab. The features
// registry and surfaces store are mocked so the routing logic is isolated.
import { beforeEach, describe, expect, it, vi } from "vitest"

const { removeSurface, getFeatureById } = vi.hoisted(() => ({
  removeSurface: vi.fn(async () => {}),
  getFeatureById: vi.fn(),
}))

vi.mock("../surfaces", () => ({ removeSurface }))
vi.mock("../features", () => ({ getFeatureById }))

import { surfaceAction } from "./surfaceAction"

beforeEach(() => {
  removeSurface.mockClear()
  getFeatureById.mockReset()
})

describe("surfaceAction", () => {
  it("dismiss removes the surface", async () => {
    const result = await surfaceAction({
      type: "surface-action",
      ownerId: "element-hider",
      surfaceId: "picker",
      actionId: "dismiss",
    })
    expect(result).toEqual({ ok: true })
    expect(removeSurface).toHaveBeenCalledWith("element-hider", "picker")
  })

  it("routes a non-dismiss action to the owner feature's handleAction", async () => {
    const handleAction = vi.fn(async () => {})
    getFeatureById.mockReturnValue({ settings: { handleAction } })

    const result = await surfaceAction(
      {
        type: "surface-action",
        ownerId: "element-hider",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: { selector: ".ad", tagName: "DIV" },
      },
      { tab: { id: 9, url: "https://a.com/x" } },
    )

    expect(result).toEqual({ ok: true })
    expect(getFeatureById).toHaveBeenCalledWith("element-hider")
    expect(handleAction).toHaveBeenCalledWith("element-picked", {
      selection: { selector: ".ad", tagName: "DIV" },
      tab: { id: 9, url: "https://a.com/x" },
    })
  })

  it("is an explicit no-op for session-owned non-dismiss actions", async () => {
    getFeatureById.mockReturnValue(undefined)
    const result = await surfaceAction({
      type: "surface-action",
      ownerId: "command:something",
      surfaceId: "s",
      actionId: "do-thing",
    })
    expect(result).toEqual({ ok: false })
    expect(getFeatureById).not.toHaveBeenCalled()
    expect(removeSurface).not.toHaveBeenCalled()
  })

  it("is a no-op for an unknown feature owner", async () => {
    getFeatureById.mockReturnValue(undefined)
    const result = await surfaceAction({
      type: "surface-action",
      ownerId: "missing-feature",
      surfaceId: "s",
      actionId: "do-thing",
    })
    expect(result).toEqual({ ok: false })
    expect(getFeatureById).toHaveBeenCalledWith("missing-feature")
  })
})
