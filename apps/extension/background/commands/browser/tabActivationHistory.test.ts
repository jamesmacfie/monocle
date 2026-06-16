import { beforeEach, describe, expect, it, vi } from "vitest"

const getTabMock = vi.fn()

vi.mock("../../utils/browser", () => ({
  getTab: (tabId: number) => getTabMock(tabId),
}))

type SessionStore = Record<string, unknown>

let sessionStore: SessionStore
let sessionGet: ReturnType<typeof vi.fn>
let sessionSet: ReturnType<typeof vi.fn>

const installBrowserStub = (options: { withSession?: boolean } = {}) => {
  const { withSession = true } = options

  sessionGet = vi.fn(async (key: string) => ({ [key]: sessionStore[key] }))
  sessionSet = vi.fn(async (items: SessionStore) => {
    Object.assign(sessionStore, items)
  })

  const storage = withSession
    ? { session: { get: sessionGet, set: sessionSet } }
    : {}

  vi.stubGlobal("browser", undefined)
  vi.stubGlobal("chrome", {
    runtime: { id: "monocle-test" },
    storage,
  })
}

// Module state (the in-memory history array and hydration memo) must reset
// per test, so the module is imported fresh each time.
const loadModule = async () => await import("./tabActivationHistory")

describe("tabActivationHistory", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    sessionStore = {}
    getTabMock.mockReset()
    getTabMock.mockImplementation(async (tabId: number) => ({ id: tabId }))
    installBrowserStub()
  })

  it("returns the previously activated tab, skipping the current one", async () => {
    const history = await loadModule()

    history.recordActivatedTab(1)
    history.recordActivatedTab(2)
    history.recordActivatedTab(3)

    await expect(history.getPreviousActivatedTabId(3)).resolves.toBe(2)

    history.forgetActivatedTab(2)
    await expect(history.getPreviousActivatedTabId(3)).resolves.toBe(1)
  })

  it("moves re-activated tabs to the front (MRU with dedupe)", async () => {
    const history = await loadModule()

    history.recordActivatedTab(1)
    history.recordActivatedTab(2)
    history.recordActivatedTab(1)

    await expect(history.getPreviousActivatedTabId(1)).resolves.toBe(2)
  })

  it("caps the history at 50 entries, dropping the oldest", async () => {
    const history = await loadModule()

    for (let id = 1; id <= 60; id += 1) {
      history.recordActivatedTab(id)
    }

    const lastWrite = sessionSet.mock.calls.at(-1)?.[0] as SessionStore
    const stored = lastWrite["monocle-tab-activation-history"] as number[]
    expect(stored).toHaveLength(50)
    expect(stored[0]).toBe(11)
    expect(stored.at(-1)).toBe(60)
  })

  it("writes through to storage.session on every record", async () => {
    const history = await loadModule()

    history.recordActivatedTab(7)

    expect(sessionSet).toHaveBeenCalledWith({
      "monocle-tab-activation-history": [7],
    })
  })

  it("hydrates from storage.session after a worker restart", async () => {
    sessionStore["monocle-tab-activation-history"] = [4, 5]

    // Fresh module = fresh worker: empty in-memory state.
    const history = await loadModule()

    await expect(history.getPreviousActivatedTabId(5)).resolves.toBe(4)
  })

  it("ignores malformed stored values during hydration", async () => {
    sessionStore["monocle-tab-activation-history"] = [4, "bogus", null, 5]

    const history = await loadModule()

    await expect(history.getPreviousActivatedTabId(5)).resolves.toBe(4)
  })

  it("degrades to in-memory behavior when storage.session is missing", async () => {
    installBrowserStub({ withSession: false })
    const history = await loadModule()

    expect(() => {
      history.recordActivatedTab(1)
      history.recordActivatedTab(2)
    }).not.toThrow()

    await expect(history.getPreviousActivatedTabId(2)).resolves.toBe(1)
  })

  it("prunes closed tabs and falls back to the next entry", async () => {
    const history = await loadModule()

    history.recordActivatedTab(1)
    history.recordActivatedTab(2)
    history.recordActivatedTab(3)

    getTabMock.mockImplementation(async (tabId: number) => {
      if (tabId === 2) {
        throw new Error("No tab with id: 2")
      }
      return { id: tabId }
    })

    await expect(history.getPreviousActivatedTabId(3)).resolves.toBe(1)

    // The closed tab was forgotten and the removal persisted.
    const lastWrite = sessionSet.mock.calls.at(-1)?.[0] as SessionStore
    expect(lastWrite["monocle-tab-activation-history"]).toEqual([1, 3])
  })
})
