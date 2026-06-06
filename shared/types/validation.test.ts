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

describe("workflow schema validation", () => {
  it("accepts executable click and wait steps with explicit tab targeting", () => {
    expect(
      validateMessage({
        type: "execute-workflow",
        tabId: 42,
        context,
        workflow: {
          version: "1.0",
          name: "Click and wait",
          steps: [
            {
              op: "click",
              target: {
                strategy: "css",
                value: "button[type='submit']",
              },
              button: "left",
              clickCount: 2,
              modifiers: ["Meta"],
              targeting: {
                ensureVisible: true,
                scrollIntoView: false,
              },
            },
            {
              op: "wait",
              timeoutMs: 1000,
              for: {
                selector: {
                  strategy: "text",
                  value: "Saved",
                  exact: true,
                },
                state: "visible",
              },
            },
          ],
        },
      }).success,
    ).toBe(true)
  })

  it("rejects malformed click steps and unsupported modeled operations", () => {
    expect(
      validateMessage({
        type: "execute-workflow",
        context,
        workflow: {
          version: "1.0",
          steps: [
            {
              op: "click",
            },
          ],
        },
      }).success,
    ).toBe(false)

    expect(
      validateMessage({
        type: "execute-workflow",
        context,
        workflow: {
          version: "1.0",
          steps: [
            {
              op: "hover",
              target: {
                strategy: "css",
                value: "#target",
              },
            },
          ],
        },
      }).success,
    ).toBe(false)

    expect(
      validateMessage({
        type: "execute-workflow",
        tabId: 0,
        context,
        workflow: {
          version: "1.0",
          steps: [
            {
              op: "wait",
              for: { timeMs: 1 },
            },
          ],
        },
      }).success,
    ).toBe(false)
  })
})
