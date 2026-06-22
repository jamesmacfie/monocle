import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Suggestion } from "../../../shared/types"
import { getFeatureConfig, setFeatureConfig } from "../config"
import { authenticate } from "./auth"
import { constantTimeEqual, generatePairingCode, generateToken } from "./crypto"
import {
  toExternalSuggestion,
  toExternalSuggestions,
} from "./externalSuggestion"
import {
  acceptPairing,
  beginPairing,
  getPendingPairings,
  pollStatus,
  rejectPairing,
} from "./pairing"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
} from "./types"

// The bridge suggestion builder reaches into the command system + active tab;
// the pump tests only care about auth gating + envelope handling, so stub it.
vi.mock("./suggestions", () => ({
  getForActiveTab: vi.fn(async () => ({
    url: "https://example.com/",
    title: "Example",
    suggestions: [{ id: "x", type: "action", title: "X" }],
  })),
  searchActiveTab: vi.fn(async () => null),
  getChildrenForActiveTab: vi.fn(async () => ({
    url: "https://example.com/",
    title: "Example",
    path: ["bookmarks"],
    suggestions: [{ id: "bm-1", type: "action", title: "A bookmark" }],
  })),
}))

// The execute orchestration reaches the command system + active tab; the pump
// tests only care about auth + the execution gate, so stub it.
vi.mock("./execute", () => ({
  executeForActiveTab: vi.fn(async () => ({
    ran: true,
    value: "copied-value",
  })),
}))

// Imported after the mocks so the pump picks up the stubbed modules.
import { handleBridgeRequest } from "./pump"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: { id: "monocle-test", getManifest: () => ({ version: "9.9.9" }) },
    // Surfaces broadcast a change after every write via chrome.tabs.query.
    tabs: { query: (_q: unknown, cb: (tabs: unknown[]) => void) => cb([]) },
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
})

const enableBridge = (
  overrides: Partial<NativeMessagingConfig> = {},
): Promise<void> =>
  setFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, {
    ...nativeMessagingConfigDefaults,
    enabled: true,
    ...overrides,
  })

// Direction B: begin → accept (browser verifies the code) → poll (app collects
// the minted token). Helper that runs the full handshake and returns the token.
const mint = async (
  client: { name: string; instanceId: string },
  now: number,
): Promise<string> => {
  const begin = await beginPairing(client, now)
  const accepted = await acceptPairing(begin.pairingId, begin.code, now)
  if (!accepted.ok) {
    throw new Error(`accept failed: ${accepted.code}`)
  }
  const polled = await pollStatus(begin.pairingId, now)
  if (polled.status !== "approved") {
    throw new Error(`poll not approved: ${polled.status}`)
  }
  return polled.token
}

describe("toExternalSuggestion mapper", () => {
  const base = { id: "a", name: "Close Tab", type: "action" } as Suggestion

  it("joins a breadcrumb name array into a single title", () => {
    const result = toExternalSuggestion({
      ...base,
      name: ["Browser", "Close Tab"],
    } as Suggestion)
    expect(result?.title).toBe("Browser › Close Tab")
  })

  it("normalizes lucide and url icons with explicit type, drops svg", () => {
    expect(
      toExternalSuggestion({
        ...base,
        icon: { type: "lucide", name: "X" },
      } as Suggestion),
    ).toMatchObject({ icon: "X", iconType: "lucide" })
    expect(
      toExternalSuggestion({
        ...base,
        icon: { type: "url", url: "https://i/x.png" },
      } as Suggestion),
    ).toMatchObject({ icon: "https://i/x.png", iconType: "url" })
    expect(
      toExternalSuggestion({
        ...base,
        icon: { type: "svg", svg: "<svg/>" },
      } as Suggestion)?.icon,
    ).toBeUndefined()
  })

  it("carries permissions through and drops input rows", () => {
    expect(
      toExternalSuggestion({
        ...base,
        permissions: ["tabs"],
      } as Suggestion)?.requiresPermission,
    ).toEqual(["tabs"])
    expect(
      toExternalSuggestions([
        base,
        { id: "i", name: "field", type: "input" } as Suggestion,
      ]),
    ).toHaveLength(1)
  })
})

describe("crypto primitives", () => {
  it("compares hex constant-time", () => {
    expect(constantTimeEqual("abcd", "abcd")).toBe(true)
    expect(constantTimeEqual("abcd", "abce")).toBe(false)
    expect(constantTimeEqual("ab", "abcd")).toBe(false)
  })

  it("generates a 6-digit code and a 64-hex token", () => {
    expect(generatePairingCode()).toMatch(/^\d{6}$/)
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("pairing + auth", () => {
  it("returns a code + pairingId and lists it as pending", async () => {
    await enableBridge()
    const now = 1_000_000
    const begin = await beginPairing(
      { name: "Raycast", instanceId: "inst-1" },
      now,
    )
    expect(begin.expiresInSeconds).toBe(60)
    expect(begin.code).toMatch(/^\d{6}$/)
    expect(begin.pairingId).toBeTruthy()

    const pending = await getPendingPairings(now)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      pairingId: begin.pairingId,
      status: "pending",
      client: { name: "Raycast", instanceId: "inst-1" },
    })
  })

  it("mints a token on accept, delivers it once via poll, then authenticates", async () => {
    await enableBridge()
    const now = 1_500_000
    const token = await mint({ name: "Raycast", instanceId: "inst-1" }, now)

    const auth = await authenticate(token, "suggestions:read", now)
    expect(auth.ok).toBe(true)

    const bad = await authenticate("not-the-token", "suggestions:read", now)
    expect(bad).toEqual({ ok: false, code: "unauthorized" })

    // The request is gone after the token is collected — a second poll fails.
    const pending = await getPendingPairings(now)
    expect(pending).toHaveLength(0)
  })

  it("poll returns the token exactly once", async () => {
    await enableBridge()
    const now = 1_700_000
    const begin = await beginPairing(
      { name: "App", instanceId: "inst-1b" },
      now,
    )
    await acceptPairing(begin.pairingId, begin.code, now)

    const first = await pollStatus(begin.pairingId, now)
    expect(first.status).toBe("approved")
    const second = await pollStatus(begin.pairingId, now)
    expect(second.status).toBe("rejected")
  })

  it("rejects a wrong code on accept and clears after the attempt cap", async () => {
    await enableBridge()
    const now = 2_000_000
    const begin = await beginPairing({ name: "App", instanceId: "inst-2" }, now)

    for (let i = 0; i < 5; i++) {
      const r = await acceptPairing(begin.pairingId, "000000", now)
      expect(r).toEqual({ ok: false, code: "pairing_rejected" })
    }
    // Cap reached → pending cleared, so even the right code now fails.
    const after = await acceptPairing(begin.pairingId, begin.code, now)
    expect(after).toEqual({ ok: false, code: "pairing_rejected" })
  })

  it("reject removes a pending request", async () => {
    await enableBridge()
    const now = 2_500_000
    const begin = await beginPairing(
      { name: "App", instanceId: "inst-2c" },
      now,
    )
    await rejectPairing(begin.pairingId)
    expect(await getPendingPairings(now)).toHaveLength(0)
    const polled = await pollStatus(begin.pairingId, now)
    expect(polled.status).toBe("rejected")
  })

  it("expires a pending pairing on accept", async () => {
    await enableBridge()
    const now = 3_000_000
    const begin = await beginPairing({ name: "App", instanceId: "inst-3" }, now)
    const r = await acceptPairing(begin.pairingId, begin.code, now + 61_000)
    expect(r).toEqual({ ok: false, code: "pairing_expired" })
  })

  it("revoking a client invalidates its token", async () => {
    await enableBridge()
    const now = 4_000_000
    const token = await mint({ name: "App", instanceId: "inst-4" }, now)

    const config = await getFeatureConfig(
      NATIVE_MESSAGING_FEATURE_ID,
      nativeMessagingConfigDefaults,
    )
    await setFeatureConfig(NATIVE_MESSAGING_FEATURE_ID, {
      ...config,
      pairedClients: [],
    })

    const auth = await authenticate(token, "suggestions:read", now)
    expect(auth).toEqual({ ok: false, code: "unauthorized" })
  })

  it("denies auth when the feature is disabled", async () => {
    const auth = await authenticate("anything", "suggestions:read", 0)
    expect(auth).toEqual({ ok: false, code: "not_enabled" })
  })
})

describe("request pump", () => {
  it("rejects an unparseable request and echoes the id", async () => {
    const res = await handleBridgeRequest({ v: 1, id: "req-1", method: "nope" })
    expect(res).toMatchObject({
      id: "req-1",
      ok: false,
      error: { code: "bad_request" },
    })
  })

  it("reports bridgeEnabled + scopes + executionEnabled in meta/info", async () => {
    await enableBridge()
    const res = await handleBridgeRequest({
      v: 1,
      id: "m",
      method: "meta/info",
    })
    expect(res).toMatchObject({
      ok: true,
      result: {
        bridgeEnabled: true,
        executionEnabled: false,
        scopes: ["suggestions:read", "commands:execute"],
      },
    })
  })

  it("rejects pair/request when disabled", async () => {
    const res = await handleBridgeRequest({
      v: 1,
      id: "p",
      method: "pair/request",
      params: { client: { name: "A", instanceId: "i" } },
    })
    expect(res).toMatchObject({ ok: false, error: { code: "not_enabled" } })
  })

  it("pair/request returns a code; pair/poll-status walks pending → approved", async () => {
    await enableBridge()
    const begin = await handleBridgeRequest({
      v: 1,
      id: "pr",
      method: "pair/request",
      params: { client: { name: "A", instanceId: "i" } },
    })
    expect(begin).toMatchObject({ ok: true })
    if (!begin.ok) {
      throw new Error("pair/request failed")
    }
    const { pairingId, code } = begin.result as {
      pairingId: string
      code: string
    }
    expect(code).toMatch(/^\d{6}$/)

    const pendingPoll = await handleBridgeRequest({
      v: 1,
      id: "pp",
      method: "pair/poll-status",
      params: { pairingId },
    })
    expect(pendingPoll).toMatchObject({
      ok: true,
      result: { status: "pending" },
    })

    // Human accepts on the Integrations page.
    await acceptPairing(pairingId, code, Date.now())

    const approvedPoll = await handleBridgeRequest({
      v: 1,
      id: "pa",
      method: "pair/poll-status",
      params: { pairingId },
    })
    expect(approvedPoll).toMatchObject({
      ok: true,
      result: { status: "approved" },
    })
  })

  it("requires a token for suggestions", async () => {
    await enableBridge()
    const res = await handleBridgeRequest({
      v: 1,
      id: "s",
      method: "suggestions/get-for-active-tab",
      params: {},
    })
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } })
  })

  it("returns suggestions for a valid token", async () => {
    const now = 5_000_000
    await enableBridge()
    const token = await mint({ name: "A", instanceId: "i" }, now)

    const res = await handleBridgeRequest(
      {
        v: 1,
        id: "s2",
        method: "suggestions/get-for-active-tab",
        params: {},
        auth: { token },
      },
      now,
    )
    expect(res).toMatchObject({
      ok: true,
      result: { url: "https://example.com/" },
    })
  })

  const mintToken = (now: number): Promise<string> =>
    mint({ name: "A", instanceId: "i" }, now)

  it("suggestions/get-children requires a token (read scope, no execution opt-in)", async () => {
    await enableBridge()
    const res = await handleBridgeRequest({
      v: 1,
      id: "c",
      method: "suggestions/get-children",
      params: { path: ["bookmarks"] },
    })
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } })
  })

  it("suggestions/get-children returns children for a valid read token", async () => {
    const now = 8_000_000
    await enableBridge()
    const token = await mintToken(now)
    const res = await handleBridgeRequest(
      {
        v: 1,
        id: "c2",
        method: "suggestions/get-children",
        params: { path: ["bookmarks"] },
        auth: { token },
      },
      now,
    )
    expect(res).toMatchObject({
      ok: true,
      result: {
        path: ["bookmarks"],
        suggestions: [{ id: "bm-1", type: "action", title: "A bookmark" }],
      },
    })
  })

  it("commands/execute requires a token", async () => {
    await enableBridge({ allowExecution: true })
    const res = await handleBridgeRequest({
      v: 1,
      id: "e",
      method: "commands/execute",
      params: { id: "copy-current-url" },
    })
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } })
  })

  it("commands/execute is refused when allowExecution is off, even with a valid token", async () => {
    const now = 6_000_000
    await enableBridge({ allowExecution: false })
    const token = await mintToken(now)
    const res = await handleBridgeRequest(
      {
        v: 1,
        id: "e2",
        method: "commands/execute",
        params: { id: "copy-current-url" },
        auth: { token },
      },
      now,
    )
    expect(res).toMatchObject({
      ok: false,
      error: { code: "execution_disabled" },
    })
  })

  it("commands/execute runs and returns the result when allowed", async () => {
    const now = 7_000_000
    await enableBridge({ allowExecution: true })
    const token = await mintToken(now)
    const res = await handleBridgeRequest(
      {
        v: 1,
        id: "e3",
        method: "commands/execute",
        params: { id: "copy-current-url" },
        auth: { token },
      },
      now,
    )
    expect(res).toMatchObject({
      ok: true,
      result: { ran: true, value: "copied-value" },
    })
  })
})
