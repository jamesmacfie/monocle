// Architecture: background tests. Covers the scheduled-trigger sync in
// background/userScripts/alarms.ts: which enabled+armed triggers produce a
// chrome.alarms entry, and that a full clear-and-recreate keeps alarms exactly
// in sync with the stored documents. fakeBrowser has no `alarms`
// implementation, so we attach a tiny in-memory fake that mirrors the
// getAll/clear/create surface alarms.ts uses. See docs/user-scripts.md.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { userScriptCommandId } from "../../shared/types/userScripts"
import type { UserScriptDraft } from "../../shared/types/userScriptValidation"
import { updateCommandSettings } from "../commands/settings"
import {
  findScheduledRunTab,
  parseAlarmName,
  syncUserScriptAlarms,
} from "./alarms"
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
  ;(fakeBrowser as unknown as { tabs: unknown }).tabs = {
    query: vi.fn(async () => []),
  }
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

describe("parseAlarmName", () => {
  it("preserves automation ids that contain colons", () => {
    expect(parseAlarmName("userscript:interval:feature:demo:key")).toEqual({
      type: "interval",
      scriptId: "feature:demo:key",
    })
  })
})

describe("findScheduledRunTab", () => {
  const setTabs = (tabs: Array<{ id: number; url?: string }>) => {
    ;(fakeBrowser.tabs.query as ReturnType<typeof vi.fn>).mockImplementation(
      async (queryInfo: { active?: boolean }) => {
        if (queryInfo.active) {
          return tabs.slice(0, 1)
        }
        return tabs
      },
    )
  }

  it("skips unscoped scheduled runs on non-http active tabs", async () => {
    const script = await addUserScript(
      draft({ triggers: [{ type: "interval", everyMinutes: 5 }] }),
    )
    setTabs([{ id: 1, url: "chrome://extensions" }])

    await expect(findScheduledRunTab(script)).resolves.toBeNull()
  })

  it("honors script deny rules for unscoped scheduled runs", async () => {
    const script = await addUserScript(
      draft({
        urlRules: { denyUrls: ["*://blocked.example/*"] },
        triggers: [{ type: "interval", everyMinutes: 5 }],
      }),
    )
    setTabs([{ id: 1, url: "https://blocked.example/page" }])

    await expect(findScheduledRunTab(script)).resolves.toBeNull()
  })

  it("honors hidden command settings for scheduled runs", async () => {
    const script = await addUserScript(
      draft({ triggers: [{ type: "interval", everyMinutes: 5 }] }),
    )
    await updateCommandSettings(userScriptCommandId(script.id), {
      hidden: true,
    })
    setTabs([{ id: 1, url: "https://example.com/" }])

    await expect(findScheduledRunTab(script)).resolves.toBeNull()
  })

  it("uses allow+deny precedence when searching scoped scheduled tabs", async () => {
    const script = await addUserScript(
      draft({
        urlRules: {
          allowUrls: ["*://*.example.com/*"],
          denyUrls: ["*://blocked.example.com/*"],
        },
        triggers: [{ type: "interval", everyMinutes: 5 }],
      }),
    )
    setTabs([
      { id: 1, url: "https://blocked.example.com/" },
      { id: 2, url: "https://ok.example.com/" },
    ])

    await expect(findScheduledRunTab(script)).resolves.toEqual({
      id: 2,
      url: "https://ok.example.com/",
    })
  })
})
