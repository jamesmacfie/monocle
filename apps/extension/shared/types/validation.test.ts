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
        type: "monocle-commands-get",
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
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "unknown",
        value: "anything",
        context,
      }).success,
    ).toBe(false)
  })

  it("validates keybinding and URL-rule value shapes", () => {
    expect(
      validateMessage({
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "keybinding",
        value: "<cmd-t>",
        context,
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-command-setting-update",
        id: "open-new-tab",
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
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "urlRules",
        value: {
          allowUrls: "*://*.example.com/*",
        },
        context,
      }).success,
    ).toBe(false)

    expect(
      validateMessage({
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "urlRules",
        value: {
          allowUrls: ["*://*.example.com/*"],
          unexpected: ["*://other.example.com/*"],
        },
        context,
      }).success,
    ).toBe(false)
  })

  it("validates hidden command setting updates", () => {
    expect(
      validateMessage({
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "hidden",
        value: true,
        context,
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-command-setting-update",
        id: "open-new-tab",
        setting: "hidden",
        value: "true",
        context,
      }).success,
    ).toBe(false)
  })
})

describe("settings catalog schema validation", () => {
  it("accepts catalog and favorite messages", () => {
    expect(
      validateMessage({
        type: "monocle-settings-catalog-get",
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-settings-catalog-get",
        platform: "firefox",
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-command-favorite-set",
        id: "open-new-tab",
        favorite: true,
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-command-favorite-set",
        id: "",
        favorite: true,
      }).success,
    ).toBe(false)
  })
})

describe("snippet message schema validation", () => {
  it("accepts snippet CRUD messages", () => {
    expect(
      validateMessage({
        type: "monocle-snippets-get",
        context,
      }).success,
    ).toBe(true)
    expect(
      validateMessage({
        type: "monocle-snippet-add",
        name: "Greeting",
        body: "Hello there,\n\nThanks!",
        context,
      }).success,
    ).toBe(true)
    expect(
      validateMessage({
        type: "monocle-snippet-update",
        id: "snippet-id",
        body: "Updated body",
      }).success,
    ).toBe(true)
    expect(
      validateMessage({
        type: "monocle-snippet-delete",
        id: "snippet-id",
      }).success,
    ).toBe(true)
  })

  it("rejects empty snippet names, bodies, and ids", () => {
    expect(
      validateMessage({
        type: "monocle-snippet-add",
        name: "",
        body: "body",
      }).success,
    ).toBe(false)
    expect(
      validateMessage({
        type: "monocle-snippet-add",
        name: "name",
        body: "",
      }).success,
    ).toBe(false)
    expect(
      validateMessage({
        type: "monocle-snippet-update",
        id: "",
      }).success,
    ).toBe(false)
    expect(
      validateMessage({
        type: "monocle-snippet-delete",
        id: "",
      }).success,
    ).toBe(false)
  })
})

describe("permission grant page schema validation", () => {
  it("requires a permission value", () => {
    expect(
      validateMessage({
        type: "monocle-permission-grant-page-open",
        permission: "bookmarks",
      }).success,
    ).toBe(true)

    expect(
      validateMessage({
        type: "monocle-permission-grant-page-open",
        permission: "",
      }).success,
    ).toBe(false)
  })
})

describe("workflow schema validation", () => {
  it("accepts executable click and wait steps with explicit tab targeting", () => {
    expect(
      validateMessage({
        type: "monocle-workflow-execute",
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
        type: "monocle-workflow-execute",
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
        type: "monocle-workflow-execute",
        context,
        workflow: {
          version: "1.0",
          steps: [
            {
              // Privileged operations are automation engine ops, never
              // content workflow steps.
              op: "navigate",
              url: "https://example.com/elsewhere",
            },
          ],
        },
      }).success,
    ).toBe(false)

    expect(
      validateMessage({
        type: "monocle-workflow-execute",
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

describe("surface-action message schema validation", () => {
  it("accepts a picker selection payload", () => {
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "element-hider",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: {
          selector: ".cookie-banner",
          tagName: "DIV",
          classes: ["a", "b"],
          innerText: "We use cookies",
        },
      }).success,
    ).toBe(true)
  })

  it("accepts a bare dismiss with no selection", () => {
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "focus-mode",
        surfaceId: "overlay",
        actionId: "dismiss",
      }).success,
    ).toBe(true)
  })

  it("rejects a selection missing the required selector", () => {
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "element-hider",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: { tagName: "DIV" },
      }).success,
    ).toBe(false)
  })

  it("accepts a selection carrying captured computed css", () => {
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "command:inspect-element-fonts",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: {
          selector: "h1",
          tagName: "H1",
          css: { "font-family": "Inter, sans-serif", "font-size": "32px" },
        },
      }).success,
    ).toBe(true)
  })

  it("rejects a selection whose css map exceeds the cap", () => {
    const css: Record<string, string> = {}
    for (let i = 0; i < 65; i++) {
      css[`prop-${i}`] = "v"
    }
    expect(
      validateMessage({
        type: "monocle-surface-action",
        ownerId: "command:inspect-element-fonts",
        surfaceId: "picker",
        actionId: "element-picked",
        selection: { selector: "h1", tagName: "H1", css },
      }).success,
    ).toBe(false)
  })
})
