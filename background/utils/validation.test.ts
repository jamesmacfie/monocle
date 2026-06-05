import { describe, expect, it } from "vitest"
import { validateIncomingMessage } from "./validation"

const context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

describe("message business validation", () => {
  it("accepts canonical keybindings with punctuation, arrows, and sequences", () => {
    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<cmd-,>",
          context,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<alt-left>, <cmd-shift-/>",
          context,
        },
        {},
      ).success,
    ).toBe(true)
  })

  it("rejects incomplete modifier-only keybindings", () => {
    expect(
      validateIncomingMessage(
        {
          type: "execute-keybinding",
          keybinding: "<cmd>",
          context,
        },
        {},
      ).success,
    ).toBe(false)
  })

  it("rejects malformed direct command setting updates", () => {
    expect(
      validateIncomingMessage(
        {
          type: "update-command-setting",
          commandId: "open-new-tab",
          setting: "keybinding",
          value: "⌘ ⇧ K",
          context,
        },
        {},
      ).success,
    ).toBe(false)

    expect(
      validateIncomingMessage(
        {
          type: "update-command-setting",
          commandId: "open-new-tab",
          setting: "urlRules",
          value: {
            allowUrls: ["ftp://example.com/*"],
          },
          context,
        },
        {},
      ).success,
    ).toBe(false)
  })

  it("accepts empty keybinding removal and valid URL-rule updates", () => {
    expect(
      validateIncomingMessage(
        {
          type: "update-command-setting",
          commandId: "open-new-tab",
          setting: "keybinding",
          value: "",
          context,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "update-command-setting",
          commandId: "open-new-tab",
          setting: "urlRules",
          value: {
            allowUrls: ["*://*.example.com/*"],
            denyUrls: ["*://blocked.example.com/*"],
          },
          context,
        },
        {},
      ).success,
    ).toBe(true)
  })

  it("validates permission grant page messages with the permission allowlist", () => {
    expect(
      validateIncomingMessage(
        {
          type: "open-permission-grant-page",
          permission: "bookmarks",
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "open-permission-grant-page",
          permission: "unknown",
        },
        {},
      ).success,
    ).toBe(false)
  })
})
