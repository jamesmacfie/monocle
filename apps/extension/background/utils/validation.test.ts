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
          type: "monocle-keybinding-execute",
          keybinding: "<cmd-,>",
          context,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "monocle-keybinding-execute",
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
          type: "monocle-keybinding-execute",
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
          type: "monocle-command-setting-update",
          id: "open-new-tab",
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
          type: "monocle-command-setting-update",
          id: "open-new-tab",
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
          type: "monocle-command-setting-update",
          id: "open-new-tab",
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
          type: "monocle-command-setting-update",
          id: "open-new-tab",
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
          type: "monocle-command-setting-update",
          id: "open-new-tab",
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
          type: "monocle-settings-catalog-get",
          platform: "chrome",
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "monocle-command-favorite-set",
          id: "open-new-tab",
          favorite: false,
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "monocle-command-favorite-set",
          id: "../open-new-tab",
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
          type: "monocle-permission-grant-page-open",
          permission: "bookmarks",
        },
        {},
      ).success,
    ).toBe(true)

    expect(
      validateIncomingMessage(
        {
          type: "monocle-permission-grant-page-open",
          permission: "unknown",
        },
        {},
      ).success,
    ).toBe(false)
  })

  it("lets a snippet body larger than the transport guard reach schema validation", () => {
    // MSG-01: the transport MAX_STRING_LENGTH must be >= the largest schema
    // string field (SnippetBodySchema = 100k), or valid snippets are rejected
    // before the schema that permits them ever runs.
    const okBody = "x".repeat(50_000)
    expect(
      validateIncomingMessage(
        { type: "monocle-snippet-add", name: "big", body: okBody, context },
        {},
      ).success,
    ).toBe(true)

    // A body over the schema limit (also over the aligned transport limit) is
    // still rejected — the guard protects the real 1 MB memory ceiling.
    const tooBigBody = "x".repeat(150_000)
    expect(
      validateIncomingMessage(
        { type: "monocle-snippet-add", name: "big", body: tooBigBody, context },
        {},
      ).success,
    ).toBe(false)
  })

  it("accepts Firefox add-on command ids (@ and {} chars) but rejects unsafe ids", () => {
    // The Extensions command group embeds browser add-on ids in command ids.
    // Firefox add-on ids are email-style or GUID-style, so @ and {} are valid.
    const childrenFor = (id: string) =>
      validateIncomingMessage(
        { type: "monocle-command-children-get", id, parentPath: [], context },
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

  it("rate-limits the 1001st message from one sender within a minute", () => {
    const sender = { id: "rate-limit-test" }

    for (let index = 0; index < 999; index += 1) {
      expect(
        validateIncomingMessage({ type: "monocle-permissions-get" }, sender)
          .success,
      ).toBe(true)
    }
    expect(
      validateIncomingMessage({ type: "monocle-permissions-get" }, sender)
        .success,
    ).toBe(true)
    expect(
      validateIncomingMessage({ type: "monocle-permissions-get" }, sender),
    ).toMatchObject({
      success: false,
      error: "Rate limit exceeded",
    })
  })

  it("rejects an individual string over the transport field limit", () => {
    expect(
      validateIncomingMessage(
        { type: "monocle-permissions-get", value: "x".repeat(100_001) },
        { id: "oversize-string-test" },
      ),
    ).toMatchObject({ success: false, error: "Message too large" })
  })
})
