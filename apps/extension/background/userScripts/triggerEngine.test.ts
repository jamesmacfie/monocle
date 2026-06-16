// Architecture: background tests. The page-trigger engine
// (background/userScripts/triggerEngine.ts): arming specs are scoped by
// urlRules and disarmed state, and content-reported fires are re-validated
// (sender tab, sender URL authority, armed state) before anything runs.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"

const runUserScriptMock = vi.fn()

vi.mock("./engine", () => ({
  runUserScript: (scriptId: string, input: unknown) =>
    runUserScriptMock(scriptId, input),
}))

import { addUserScript } from "./storage"
import { getPageTriggersForUrl, handleTriggerFired } from "./triggerEngine"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  installBrowserStubs()
  runUserScriptMock.mockReset().mockResolvedValue({
    success: true,
    completedSteps: 1,
  })
})

const addPageTriggerScript = (
  overrides: Partial<Parameters<typeof addUserScript>[0]> = {},
) =>
  addUserScript({
    schemaVersion: 1,
    name: "Dismiss banner",
    enabled: true,
    urlRules: { allowUrls: ["dev.example.com"] },
    triggers: [
      {
        type: "elementAppears",
        selector: { strategy: "css", value: ".banner" },
      },
    ],
    steps: [{ op: "click", target: { strategy: "css", value: ".banner" } }],
    ...overrides,
  })

describe("getPageTriggersForUrl", () => {
  it("returns armed specs only for urlRules-allowed http(s) URLs", async () => {
    const script = await addPageTriggerScript()

    const matching = await getPageTriggersForUrl("https://dev.example.com/app")
    expect(matching).toHaveLength(1)
    expect(matching[0]).toMatchObject({
      scriptId: script.id,
      trigger: { type: "elementAppears" },
    })

    await expect(
      getPageTriggersForUrl("https://other.example.com/"),
    ).resolves.toEqual([])
    await expect(
      getPageTriggersForUrl("chrome-extension://abc/options.html"),
    ).resolves.toEqual([])
  })

  it("arms nothing for disabled scripts or disarmed triggers", async () => {
    await addPageTriggerScript({ enabled: false })
    await addPageTriggerScript({
      name: "Disarmed import",
      triggers: [
        {
          type: "elementAppears",
          selector: { strategy: "css", value: ".banner" },
          disarmed: true,
        },
      ],
    })

    await expect(
      getPageTriggersForUrl("https://dev.example.com/"),
    ).resolves.toEqual([])
  })

  it("never arms manual-only scripts", async () => {
    await addPageTriggerScript({
      triggers: [{ type: "manual" }],
    })

    await expect(
      getPageTriggersForUrl("https://dev.example.com/"),
    ).resolves.toEqual([])
  })
})

describe("handleTriggerFired", () => {
  it("re-validates and runs against the sender tab and sender URL", async () => {
    const script = await addPageTriggerScript()

    const outcome = await handleTriggerFired({
      scriptId: script.id,
      trigger: {
        type: "elementAppears",
        url: "https://dev.example.com/app",
        matchedText: "Accept",
      },
      senderTabId: 42,
      senderUrl: "https://dev.example.com/app",
    })

    expect(outcome.accepted).toBe(true)
    expect(runUserScriptMock).toHaveBeenCalledWith(
      script.id,
      expect.objectContaining({
        invocation: expect.objectContaining({
          kind: "trigger",
          tabId: 42,
          trigger: expect.objectContaining({ matchedText: "Accept" }),
        }),
      }),
    )
  })

  it("rejects fires without a sender tab", async () => {
    const script = await addPageTriggerScript()

    const outcome = await handleTriggerFired({
      scriptId: script.id,
      trigger: { type: "elementAppears", url: "https://dev.example.com/" },
      senderTabId: undefined,
      senderUrl: "https://dev.example.com/",
    })

    expect(outcome.accepted).toBe(false)
    expect(runUserScriptMock).not.toHaveBeenCalled()
  })

  it("trusts the sender URL over the claimed URL", async () => {
    const script = await addPageTriggerScript()

    // The page claims an allowed URL, but the sender is actually elsewhere.
    const outcome = await handleTriggerFired({
      scriptId: script.id,
      trigger: { type: "elementAppears", url: "https://dev.example.com/" },
      senderTabId: 42,
      senderUrl: "https://evil.example.net/",
    })

    expect(outcome.accepted).toBe(false)
    expect(runUserScriptMock).not.toHaveBeenCalled()
  })

  it("rejects trigger types the document does not arm", async () => {
    const script = await addPageTriggerScript()

    const outcome = await handleTriggerFired({
      scriptId: script.id,
      trigger: { type: "urlMatch", url: "https://dev.example.com/" },
      senderTabId: 42,
      senderUrl: "https://dev.example.com/",
    })

    expect(outcome.accepted).toBe(false)
  })
})
