import { beforeEach, describe, expect, it, vi } from "vitest"

type ChromeStubState = {
  grantedOrigins: Set<string>
  denied: boolean
  contentReady: boolean
  executeScriptCalls: unknown[]
  activeTab: { id: number; url: string }
}

const installChromeStub = (): ChromeStubState => {
  const state: ChromeStubState = {
    grantedOrigins: new Set(),
    denied: false,
    contentReady: false,
    executeScriptCalls: [],
    activeTab: { id: 7, url: "https://app.example.com/dashboard" },
  }

  const runtime = {
    id: "monocle-test",
    lastError: undefined as { message: string } | undefined,
    getURL: () => "chrome-extension://monocle-test/",
  }

  vi.stubGlobal("browser", {})
  vi.stubGlobal("chrome", {
    runtime,
    permissions: {
      contains: (
        request: { origins?: string[] },
        callback: (granted: boolean) => void,
      ) => {
        runtime.lastError = undefined
        callback(
          (request.origins ?? []).every((origin) =>
            state.grantedOrigins.has(origin),
          ),
        )
      },
      request: (
        request: { origins?: string[] },
        callback: (granted: boolean) => void,
      ) => {
        runtime.lastError = undefined
        if (state.denied) {
          callback(false)
          return
        }
        for (const origin of request.origins ?? []) {
          state.grantedOrigins.add(origin)
        }
        callback(true)
      },
    },
    scripting: {
      executeScript: (details: unknown, callback: () => void) => {
        runtime.lastError = undefined
        state.executeScriptCalls.push(details)
        state.contentReady = true
        callback()
      },
    },
    tabs: {
      get: (
        _tabId: number,
        callback: (tab: { id: number; url: string }) => void,
      ) => {
        runtime.lastError = undefined
        callback(state.activeTab)
      },
      query: (
        _query: unknown,
        callback: (tabs: Array<{ id: number; url: string }>) => void,
      ) => {
        runtime.lastError = undefined
        callback([state.activeTab])
      },
      sendMessage: (
        _tabId: number,
        _message: unknown,
        callback: (response?: unknown) => void,
      ) => {
        if (state.contentReady) {
          runtime.lastError = undefined
          callback({ received: true })
          return
        }
        runtime.lastError = {
          message:
            "Could not establish connection. Receiving end does not exist.",
        }
        callback(undefined)
      },
    },
  })

  return state
}

const importHostPermissions = async () => {
  vi.resetModules()
  return await import("./hostPermissions")
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("host permission utilities", () => {
  it("normalizes http(s) page URLs to scheme+host origin patterns", async () => {
    installChromeStub()
    const { hostPermissionPatternForUrl } = await importHostPermissions()

    expect(
      hostPermissionPatternForUrl("https://app.example.com/path?x=1"),
    ).toEqual({ ok: true, originPattern: "https://app.example.com/*" })
    expect(hostPermissionPatternForUrl("http://localhost:3000/a")).toEqual({
      ok: true,
      originPattern: "http://localhost/*",
    })
    expect(hostPermissionPatternForUrl("chrome://extensions")).toEqual({
      ok: false,
      error: "Host access is only available for http(s) web pages",
    })
  })

  it("checks and requests only the concrete current origin", async () => {
    const state = installChromeStub()
    const { hasHostPermissionForUrl, requestHostPermissionForUrl } =
      await importHostPermissions()

    await expect(
      hasHostPermissionForUrl("https://app.example.com/dashboard"),
    ).resolves.toEqual({
      granted: false,
      originPattern: "https://app.example.com/*",
    })

    await expect(
      requestHostPermissionForUrl("https://app.example.com/dashboard"),
    ).resolves.toEqual({
      granted: true,
      originPattern: "https://app.example.com/*",
    })
    expect(state.grantedOrigins).toEqual(new Set(["https://app.example.com/*"]))
  })

  it("injects the content script after a host grant for an already-loaded tab", async () => {
    const state = installChromeStub()
    const { ensureHostPermission } = await importHostPermissions()

    await expect(
      ensureHostPermission({
        tabId: 7,
        url: "https://app.example.com/dashboard",
        reason: "automation",
        request: true,
        ensureContentScript: true,
      }),
    ).resolves.toEqual({
      granted: true,
      originPattern: "https://app.example.com/*",
    })
    expect(state.executeScriptCalls).toEqual([
      {
        target: { tabId: 7 },
        files: ["content-scripts/content.js"],
      },
    ])
  })

  it("does not inject when the content script already responds", async () => {
    const state = installChromeStub()
    state.contentReady = true
    const { ensureHostPermission } = await importHostPermissions()

    await expect(
      ensureHostPermission({
        tabId: 7,
        url: "https://app.example.com/dashboard",
        reason: "automation",
        request: true,
        ensureContentScript: true,
      }),
    ).resolves.toEqual({
      granted: true,
      originPattern: "https://app.example.com/*",
    })
    expect(state.executeScriptCalls).toEqual([])
  })

  it("does not inject when the user denies the host grant", async () => {
    const state = installChromeStub()
    state.denied = true
    const { ensureHostPermission } = await importHostPermissions()

    await expect(
      ensureHostPermission({
        tabId: 7,
        url: "https://app.example.com/dashboard",
        reason: "automation",
        request: true,
        ensureContentScript: true,
      }),
    ).resolves.toEqual({
      granted: false,
      originPattern: "https://app.example.com/*",
    })
    expect(state.executeScriptCalls).toEqual([])
  })
})
