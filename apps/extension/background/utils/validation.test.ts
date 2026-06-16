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

  it("accepts hidden updates and settings catalog messages", () => {
    expect(
      validateIncomingMessage(
        {
          type: "update-command-setting",
          commandId: "open-new-tab",
          setting: "hidden",
          value: true,
          context,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "get-settings-catalog",
          platform: "chrome",
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "set-command-favorite",
          commandId: "open-new-tab",
          favorite: false,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "set-command-favorite",
          commandId: "../open-new-tab",
          favorite: true,
        },
        {},
      ).success,
    ).toBe(false)
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

  it("accepts Firefox add-on command ids (@ and {} chars) but rejects unsafe ids", () => {
    // The Extensions command group embeds browser add-on ids in command ids.
    // Firefox add-on ids are email-style or GUID-style, so @ and {} are valid.
    const childrenFor = (id: string) =>
      validateIncomingMessage(
        { type: "get-children-commands", id, parentPath: [], context },
        {},
      ).success

    expect(childrenFor("extension-addon@mozilla.org")).toBe(true)
    expect(
      childrenFor("extension-{e4a8a97b-ba8d-4f3c-9b2e-1234567890ab}"),
    ).toBe(true)
    expect(childrenFor("extension-abcdefghabcdefghabcdefghabcdefgh")).toBe(true)
    // Genuinely unsafe characters are still rejected.
    expect(childrenFor("bad id with spaces")).toBe(false)
    expect(childrenFor("ext/../../etc")).toBe(false)
  })
})
