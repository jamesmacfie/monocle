// Architecture: background tests. Covers the automation storage module
// (background/automations/storage.ts): CRUD over `monocle-automations`,
// write-time schema validation, the stored-script cap, and the
// unknown-schemaVersion read guard.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { AutomationDraft } from "../../shared/types/automationValidation"
import {
  addAutomation,
  deleteAutomation,
  getAutomations,
  updateAutomation,
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

const draft = (overrides: Partial<AutomationDraft> = {}): AutomationDraft => ({
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

describe("automation storage", () => {
  it("starts empty", async () => {
    await expect(getAutomations()).resolves.toEqual([])
  })

  it("adds, reads, updates, and deletes a script", async () => {
    const created = await addAutomation(draft())

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBe(created.updatedAt)
    expect(
      (await getAutomations()).find(({ id }) => id === created.id),
    ).toMatchObject({ name: "Dev login" })

    const updated = await updateAutomation(
      created.id,
      draft({ name: "Dev login v2" }),
    )
    expect(updated?.name).toBe("Dev login v2")
    expect(updated?.id).toBe(created.id)
    expect(updated?.createdAt).toBe(created.createdAt)

    await expect(deleteAutomation(created.id)).resolves.toBe(true)
    await expect(getAutomations()).resolves.toEqual([])
  })

  it("returns undefined/false for unknown ids", async () => {
    await expect(updateAutomation("missing", draft())).resolves.toBeUndefined()
    await expect(deleteAutomation("missing")).resolves.toBe(false)
  })

  it("rejects invalid documents loudly at write time", async () => {
    await expect(addAutomation(draft({ triggers: [] }))).rejects.toThrow(
      /at least one trigger/i,
    )

    await expect(
      // Loop without an iteration body fails the schema.
      addAutomation(
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
      addAutomation(
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
    const created = await addAutomation(draft())
    const stored = (await fakeBrowser.storage.local.get(
      "monocle-automations",
    )) as Record<string, unknown[]>

    const tampered = [
      ...(stored["monocle-automations"] as Array<Record<string, unknown>>),
      {
        ...(stored["monocle-automations"] as any)[0],
        id: "future",
        schemaVersion: 99,
      },
    ]
    await fakeBrowser.storage.local.set({ "monocle-automations": tampered })

    const scripts = await getAutomations()
    expect(scripts.map((script) => script.id)).toEqual([created.id])
  })
})
