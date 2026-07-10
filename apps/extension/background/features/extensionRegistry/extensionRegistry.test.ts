import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  getAllExtensionEntries,
  initExtensionRegistry,
  loadExtensionSdkCommands,
} from "../../commands/extensionSdk"
import { setFeatureConfig } from "../config"
import { extensionRegistryCommands } from "./commands"
import { handleExternalMessage } from "./handler"
import {
  addPendingPeer,
  approvePeer,
  dismissPendingPeer,
  isPeerApproved,
  listApprovedPeers,
  listPendingPeers,
  revokePeer,
} from "./store"
import {
  EXTENSION_REGISTRY_FEATURE_ID,
  extensionRegistryConfigDefaults,
} from "./types"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: { id: "monocle-test", getManifest: () => ({ version: "9.9.9" }) },
    // Callback-style query returning no tabs, so background toast helpers that
    // look up the active tab simply no-op instead of throwing in tests.
    tabs: { query: (_opts: unknown, cb: (tabs: unknown[]) => void) => cb([]) },
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
  // Reset the in-memory registry cache from (now empty) storage.
  await initExtensionRegistry()
})

const enable = (): Promise<void> =>
  setFeatureConfig(EXTENSION_REGISTRY_FEATURE_ID, {
    ...extensionRegistryConfigDefaults,
    enabled: true,
  })

const announce = (id: string, name = "Peer") => ({
  v: 1,
  id,
  kind: "announce" as const,
  params: { manifest: { name } },
})

const register = (id: string) => ({
  v: 1,
  id,
  kind: "register" as const,
  params: {
    registrations: [
      {
        id: "reg",
        namespace: "ns",
        commands: [
          { id: "a", name: "A", type: "action", execute: { callbackId: "c" } },
        ],
      },
    ],
  },
})

describe("extensionRegistry store", () => {
  it("keeps concurrent pending peer announcements", async () => {
    await Promise.all([
      addPendingPeer({ extId: "ext-1", name: "One", announcedAt: 1 }),
      addPendingPeer({ extId: "ext-2", name: "Two", announcedAt: 2 }),
    ])

    expect((await listPendingPeers()).map((peer) => peer.extId)).toEqual(
      expect.arrayContaining(["ext-1", "ext-2"]),
    )
  })

  it("records and approves a pending peer, removing it from pending", async () => {
    await addPendingPeer({ extId: "ext-1", name: "One", announcedAt: 1 })
    expect((await listPendingPeers()).map((p) => p.extId)).toEqual(["ext-1"])

    expect(await approvePeer("ext-1")).toBe(true)
    expect(await isPeerApproved("ext-1")).toBe(true)
    expect(await listPendingPeers()).toHaveLength(0)
    expect((await listApprovedPeers()).map((p) => p.extId)).toEqual(["ext-1"])
  })

  it("does not re-add an already-approved peer to pending", async () => {
    await addPendingPeer({ extId: "ext-1", name: "One", announcedAt: 1 })
    await approvePeer("ext-1")
    await addPendingPeer({ extId: "ext-1", name: "One", announcedAt: 2 })
    expect(await listPendingPeers()).toHaveLength(0)
  })

  it("dismiss and revoke remove the peer", async () => {
    await addPendingPeer({ extId: "ext-2", name: "Two", announcedAt: 1 })
    await dismissPendingPeer("ext-2")
    expect(await listPendingPeers()).toHaveLength(0)

    await addPendingPeer({ extId: "ext-3", name: "Three", announcedAt: 1 })
    await approvePeer("ext-3")
    await revokePeer("ext-3")
    expect(await isPeerApproved("ext-3")).toBe(false)
  })
})

describe("extensionRegistry handler", () => {
  it("rejects everything when the feature is disabled", async () => {
    const res = await handleExternalMessage(announce("m1"), "ext-1")
    expect(res).toMatchObject({ ok: false, error: { code: "not_enabled" } })
  })

  it("rejects an unparseable envelope with bad_request", async () => {
    await enable()
    const res = await handleExternalMessage({ kind: "nope" }, "ext-1")
    expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } })
  })

  it("rejects a missing sender id as unauthorized", async () => {
    await enable()
    const res = await handleExternalMessage(announce("m1"), undefined)
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } })
  })

  it("announce records a pending peer and reports pending", async () => {
    await enable()
    const res = await handleExternalMessage(announce("m1", "Widget"), "ext-1")
    expect(res).toMatchObject({ ok: true, result: { status: "pending" } })
    expect((await listPendingPeers())[0]).toMatchObject({
      extId: "ext-1",
      name: "Widget",
    })
  })

  it("announce from an approved peer reports approved", async () => {
    await enable()
    await addPendingPeer({ extId: "ext-1", name: "W", announcedAt: 1 })
    await approvePeer("ext-1")
    const res = await handleExternalMessage(announce("m1"), "ext-1")
    expect(res).toMatchObject({ ok: true, result: { status: "approved" } })
  })

  it("rejects register from an unapproved peer", async () => {
    await enable()
    const res = await handleExternalMessage(register("r1"), "ext-1")
    expect(res).toMatchObject({ ok: false, error: { code: "unauthorized" } })
  })

  it("accepts register from an approved peer and renders its commands", async () => {
    await enable()
    await addPendingPeer({ extId: "ext-1", name: "Widget", announcedAt: 1 })
    await approvePeer("ext-1")

    const res = await handleExternalMessage(register("r1"), "ext-1")
    expect(res).toMatchObject({
      ok: true,
      result: { accepted: 1, revision: 1 },
    })

    expect(getAllExtensionEntries().map((e) => e.extId)).toEqual(["ext-1"])
    const commands = loadExtensionSdkCommands()
    expect(commands).toHaveLength(1)
    expect(commands[0].id).toBe("extension:ext-1:reg:__ext-group")
  })

  it("the disable palette command drops all peer trees (FEAT-01)", async () => {
    await enable()
    await addPendingPeer({ extId: "ext-1", name: "Widget", announcedAt: 1 })
    await approvePeer("ext-1")
    await handleExternalMessage(register("r1"), "ext-1")
    expect(loadExtensionSdkCommands()).toHaveLength(1)

    const disable = extensionRegistryCommands().find(
      (c) => c.id === "external-extensions-disable",
    )
    expect(disable?.type).toBe("action")
    await (disable as { execute: () => Promise<void> }).execute()

    expect(getAllExtensionEntries()).toHaveLength(0)
    expect(loadExtensionSdkCommands()).toHaveLength(0)
  })

  it("dispose clears a peer's registered commands", async () => {
    await enable()
    await addPendingPeer({ extId: "ext-1", name: "Widget", announcedAt: 1 })
    await approvePeer("ext-1")
    await handleExternalMessage(register("r1"), "ext-1")

    const res = await handleExternalMessage(
      { v: 1, id: "d1", kind: "dispose" },
      "ext-1",
    )
    expect(res).toMatchObject({ ok: true })
    expect(loadExtensionSdkCommands()).toHaveLength(0)
  })
})
