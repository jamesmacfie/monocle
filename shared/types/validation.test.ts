import { describe, expect, it } from "vitest"
import { validateBrowserContext, validateMessage } from "./validation"

const context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

describe("browser context validation", () => {
  it("allows untitled browser pages while still requiring a URL", () => {
    expect(
      validateBrowserContext({
        url: "https://example.com/untitled",
        title: "",
        modifierKey: null,
      }).success,
    ).toBe(true)
    expect(
      validateBrowserContext({
        url: "",
        title: "",
        modifierKey: null,
      }).success,
    ).toBe(false)
  })

  it("accepts new-tab contexts with empty titles", () => {
    expect(
      validateMessage({
        type: "get-commands",
        context: {
          url: "chrome-extension://monocle-test/newtab.html",
          title: "",
          modifierKey: null,
          isNewTab: true,
        },
      }).success,
    ).toBe(true)
  })
})

describe("update command setting schema validation", () => {
  it("rejects unknown command setting keys", () => {
    expect(
      validateMessage({
        type: "update-command-setting",
        commandId: "open-new-tab",
        setting: "unknown",
        value: "anything",
        context,
      }).success,
    ).toBe(false)
  })

  it("validates keybinding and URL-rule value shapes", () => {
    expect(
      validateMessage({
        type: "update-command-setting",
        commandId: "open-new-tab",
        setting: "keybinding",
        value: "<cmd-t>",
        context,
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "update-command-setting",
        commandId: "open-new-tab",
        setting: "urlRules",
        value: {
          allowUrls: ["*://*.example.com/*"],
          denyUrls: ["*://blocked.example.com/*"],
        },
        context,
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "update-command-setting",
        commandId: "open-new-tab",
        setting: "urlRules",
        value: {
          allowUrls: "*://*.example.com/*",
        },
        context,
      }).success,
    ).toBe(false)

    expect(
      validateMessage({
        type: "update-command-setting",
        commandId: "open-new-tab",
        setting: "urlRules",
        value: {
          allowUrls: ["*://*.example.com/*"],
          unexpected: ["*://other.example.com/*"],
        },
        context,
      }).success,
    ).toBe(false)
  })
})

describe("permission grant page schema validation", () => {
  it("requires a permission value", () => {
    expect(
      validateMessage({
        type: "open-permission-grant-page",
        permission: "bookmarks",
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "open-permission-grant-page",
        permission: "",
      }).success,
    ).toBe(false)
  })
})
