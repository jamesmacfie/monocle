// Architecture: background tests. Covers the user-script storage module
// (background/userScripts/storage.ts): CRUD over `monocle-userscripts`,
// write-time schema validation, the stored-script cap, and the
// unknown-schemaVersion read guard.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { UserScriptDraft } from "../../shared/types/userScriptValidation"
import {
  addUserScript,
  deleteUserScript,
  getUserScript,
  getUserScripts,
  updateUserScript,
} from "./storage"

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
})

const draft = (overrides: Partial<UserScriptDraft> = {}): UserScriptDraft => ({
  schemaVersion: 1,
  name: "Dev login",
  enabled: true,
  urlRules: { allowUrls: ["dev.example.com"] },
  triggers: [{ type: "manual" }],
  steps: [
    {
      op: "click",
      target: { strategy: "text", value: "Sign in" },
    },
  ],
  ...overrides,
})

describe("user script storage", () => {
  it("starts empty", async () => {
    await expect(getUserScripts()).resolves.toEqual([])
  })

  it("adds, reads, updates, and deletes a script", async () => {
    const created = await addUserScript(draft())

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBe(created.updatedAt)
    await expect(getUserScript(created.id)).resolves.toMatchObject({
      name: "Dev login",
    })

    const updated = await updateUserScript(
      created.id,
      draft({ name: "Dev login v2" }),
    )
    expect(updated?.name).toBe("Dev login v2")
    expect(updated?.id).toBe(created.id)
    expect(updated?.createdAt).toBe(created.createdAt)

    await expect(deleteUserScript(created.id)).resolves.toBe(true)
    await expect(getUserScripts()).resolves.toEqual([])
  })

  it("returns undefined/false for unknown ids", async () => {
    await expect(updateUserScript("missing", draft())).resolves.toBeUndefined()
    await expect(deleteUserScript("missing")).resolves.toBe(false)
  })

  it("rejects invalid documents loudly at write time", async () => {
    await expect(addUserScript(draft({ triggers: [] }))).rejects.toThrow(
      /at least one trigger/i,
    )

    await expect(
      // Loop without an iteration body fails the schema.
      addUserScript(
        draft({
          steps: [
            {
              op: "while",
              condition: { kind: "urlIncludes", value: "x" },
              steps: [],
            },
          ],
        }),
      ),
    ).rejects.toThrow()
  })

  it("rejects control-flow structural violations (navigation in loops)", async () => {
    await expect(
      addUserScript(
        draft({
          steps: [
            {
              op: "branch",
              if: { kind: "urlIncludes", value: "x" },
              then: [{ op: "navigate", url: "https://example.com" }],
            },
          ],
        }),
      ),
    ).rejects.toThrow(/not allowed inside branches or loops/i)
  })

  it("drops documents with an unsupported schemaVersion on read", async () => {
    const created = await addUserScript(draft())
    const stored = (await fakeBrowser.storage.local.get(
      "monocle-userscripts",
    )) as Record<string, unknown[]>

    const tampered = [
      ...(stored["monocle-userscripts"] as Array<Record<string, unknown>>),
      {
        ...(stored["monocle-userscripts"] as any)[0],
        id: "future",
        schemaVersion: 99,
      },
    ]
    await fakeBrowser.storage.local.set({ "monocle-userscripts": tampered })

    const scripts = await getUserScripts()
    expect(scripts.map((script) => script.id)).toEqual([created.id])
  })
})
