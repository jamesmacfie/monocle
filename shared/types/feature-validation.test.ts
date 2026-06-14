import { describe, expect, it } from "vitest"
import { validateMessage } from "./validation"

describe("feature message validation", () => {
  it("accepts get-features", () => {
    expect(validateMessage({ type: "get-features" }).success).toBe(true)
  })

  it("accepts update-feature-config with a config object", () => {
    expect(
      validateMessage({
        type: "update-feature-config",
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
        type: "update-feature-config",
        featureId: "",
        config: {},
      }).success,
    ).toBe(false)
  })

  it("accepts execute-feature-action", () => {
    expect(
      validateMessage({
        type: "execute-feature-action",
        featureId: "focus-mode",
        actionId: "start",
      }).success,
    ).toBe(true)
  })

  it("accepts execute-feature-action with a scalar payload", () => {
    expect(
      validateMessage({
        type: "execute-feature-action",
        featureId: "tab-groups",
        actionId: "toggle-pin",
        payload: { itemId: "g1", childId: "t2", pinned: true },
      }).success,
    ).toBe(true)
  })

  it("rejects execute-feature-action with a non-scalar payload value", () => {
    expect(
      validateMessage({
        type: "execute-feature-action",
        featureId: "tab-groups",
        actionId: "restore-group",
        payload: { itemId: { nested: "no" } },
      }).success,
    ).toBe(false)
  })

  it("accepts get-surfaces with a url", () => {
    expect(
      validateMessage({ type: "get-surfaces", url: "https://example.com" })
        .success,
    ).toBe(true)
  })

  it("rejects get-surfaces without a url", () => {
    expect(validateMessage({ type: "get-surfaces" }).success).toBe(false)
  })

  it("accepts a surface-action with owner, surface, and action ids", () => {
    expect(
      validateMessage({
        type: "surface-action",
        ownerId: "command:url-as-qr-code",
        surfaceId: "qr",
        actionId: "dismiss",
      }).success,
    ).toBe(true)
  })

  it("rejects a surface-action missing required ids", () => {
    expect(
      validateMessage({ type: "surface-action", actionId: "dismiss" }).success,
    ).toBe(false)
  })
})
