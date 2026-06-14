// Architecture: background tests. Covers the scheduled-trigger sync in
// background/userScripts/alarms.ts: which enabled+armed triggers produce a
// chrome.alarms entry, and that a full clear-and-recreate keeps alarms exactly
// in sync with the stored documents. fakeBrowser has no `alarms`
// implementation, so we attach a tiny in-memory fake that mirrors the
// getAll/clear/create surface alarms.ts uses. See docs/user-scripts.md.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { UserScriptDraft } from "../../shared/types/userScriptValidation"
import { syncUserScriptAlarms } from "./alarms"
import { addUserScript } from "./storage"

const createFakeAlarms = () => {
  const store = new Map<string, { name: string }>()
  return {
    create: (name: string, _info: unknown) => {
      store.set(name, { name })
    },
    getAll: async () => Array.from(store.values()),
    clear: async (name: string) => {
      store.delete(name)
    },
    onAlarm: { addListener: () => {} },
  }
}

let alarms: ReturnType<typeof createFakeAlarms>

beforeEach(() => {
  fakeBrowser.reset()
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
  // getBrowserAPI() resolves to the fakeBrowser `browser` global; alarms.ts
  // reads its `alarms` namespace, which fakeBrowser does not provide.
  alarms = createFakeAlarms()
  ;(fakeBrowser as unknown as { alarms: unknown }).alarms = alarms
})

const draft = (overrides: Partial<UserScriptDraft>): UserScriptDraft => ({
  schemaVersion: 1,
  name: "Script",
  enabled: true,
  triggers: [{ type: "manual" }],
  steps: [{ op: "click", target: { strategy: "text", value: "x" } }],
  ...overrides,
})

const alarmNames = async (): Promise<string[]> =>
  (await alarms.getAll()).map((alarm) => alarm.name).sort()

describe("syncUserScriptAlarms", () => {
  it("creates interval and schedule alarms for enabled, armed scripts", async () => {
    const interval = await addUserScript(
      draft({ triggers: [{ type: "interval", everyMinutes: 30 }] }),
    )
    const schedule = await addUserScript(
      draft({ triggers: [{ type: "schedule", at: "09:00" }] }),
    )

    await syncUserScriptAlarms()

    expect(await alarmNames()).toEqual(
      [
        `userscript:interval:${interval.id}`,
        `userscript:schedule:${schedule.id}`,
      ].sort(),
    )
  })

  it("creates no alarm for onStartup or manual triggers (no chrome.alarms entry)", async () => {
    await addUserScript(draft({ triggers: [{ type: "onStartup" }] }))
    await addUserScript(draft({ triggers: [{ type: "manual" }] }))

    await syncUserScriptAlarms()

    expect(await alarmNames()).toEqual([])
  })

  it("skips disabled scripts", async () => {
    await addUserScript(
      draft({
        enabled: false,
        triggers: [{ type: "interval", everyMinutes: 5 }],
      }),
    )

    await syncUserScriptAlarms()

    expect(await alarmNames()).toEqual([])
  })

  it("skips disarmed scheduled triggers", async () => {
    await addUserScript(
      draft({
        triggers: [{ type: "interval", everyMinutes: 5, disarmed: true }],
      }),
    )

    await syncUserScriptAlarms()

    expect(await alarmNames()).toEqual([])
  })

  it("clears stale userscript alarms before recreating, staying in sync with storage", async () => {
    // A leftover alarm for a script that no longer wants it must not survive.
    alarms.create("userscript:interval:gone", {})
    const live = await addUserScript(
      draft({ triggers: [{ type: "interval", everyMinutes: 10 }] }),
    )

    await syncUserScriptAlarms()

    expect(await alarmNames()).toEqual([`userscript:interval:${live.id}`])
  })
})
