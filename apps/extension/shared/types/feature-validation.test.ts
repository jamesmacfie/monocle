import { describe, expect, it } from "vitest"
import { validateMessage } from "./validation"

describe("feature message validation", () => {
  it("accepts get-features", () => {
    expect(validateMessage({ type: "monocle-features-get" }).success).toBe(true)
  })

  it("accepts update-feature-config with a config object", () => {
    expect(
      validateMessage({
        type: "monocle-feature-config-update",
        featureId: "focus-mode",
        config: {
          blockedUrlPatterns: ["reddit.com"],
          defaultDurationMinutes: 25,
        },
      }).success,
    ).toBe(true)
  })

  it("rejects update-feature-config without a feature id", () => {
    expect(
      validateMessage({
        type: "monocle-feature-config-update",
        featureId: "",
        config: {},
      }).success,
    ).toBe(false)
  })

  it("accepts execute-feature-action", () => {
    expect(
      validateMessage({
        type: "monocle-feature-action-execute",
        featureId: "focus-mode",
        actionId: "start",
      }).success,
    ).toBe(true)
  })

  it("accepts execute-feature-action with a scalar payload", () => {
    expect(
      validateMessage({
        type: "monocle-feature-action-execute",
        featureId: "tab-groups",
        actionId: "toggle-pin",
        payload: { itemId: "g1", childId: "t2", pinned: true },
      }).success,
    ).toBe(true)
  })

  it("rejects execute-feature-action with a non-scalar payload value", () => {
    expect(
      validateMessage({
        type: "monocle-feature-action-execute",
        featureId: "tab-groups",
        actionId: "restore-group",
        payload: { itemId: { nested: "no" } },
      }).success,
    ).toBe(false)
  })

  it("accepts get-surfaces with a url", () => {
    expect(
      validateMessage({
        type: "monocle-surfaces-get",
        url: "https://example.com",
      }).success,
    ).toBe(true)
  })

  it("rejects get-surfaces without a url", () => {
    expect(validateMessage({ type: "monocle-surfaces-get" }).success).toBe(
      false,
    )
  })

  it("accepts a surface-action with owner, surface, and action ids", () => {
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "command:url-as-qr-code",
        surfaceId: "qr",
        actionId: "dismiss",
      }).success,
    ).toBe(true)
  })

  it("rejects a surface-action missing required ids", () => {
    expect(
      validateMessage({ type: "monocle-surface-action", actionId: "dismiss" })
        .success,
    ).toBe(false)
  })
})
