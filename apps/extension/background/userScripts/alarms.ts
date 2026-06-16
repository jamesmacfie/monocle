// Architecture: background layer. Scheduled user-script triggers (interval,
// schedule, onStartup) on chrome.alarms — MV3 service workers die, so
// setTimeout/setInterval do not survive; alarms are the only correct
// mechanism, re-registered on runtime.onInstalled/onStartup and whenever
// the script store changes. Target-tab semantics: a scheduled run executes
// against the first open tab the script's urlRules allow (active tab when
// the script has no allow rules); with no eligible tab the run is skipped
// with a log, never queued. Reading tab URLs for that matching requires the
// optional "tabs" permission — without it, scoped scripts skip and say why.
// Requires the "alarms" permission (declared in wxt.config.ts).
import type { UserScript, UserScriptTrigger } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { getAutomationEligibility } from "./eligibility"
import { runUserScript } from "./engine"
import { getAllAutomations } from "./registry"

const ALARM_PREFIX = "userscript:"

type ScheduledTriggerType = "interval" | "schedule"

const alarmName = (type: ScheduledTriggerType, scriptId: string): string =>
  `${ALARM_PREFIX}${type}:${scriptId}`

export const parseAlarmName = (
  name: string,
): { type: ScheduledTriggerType; scriptId: string } | null => {
  if (!name.startsWith(ALARM_PREFIX)) {
    return null
  }

  const rest = name.slice(ALARM_PREFIX.length)
  const separatorIndex = rest.indexOf(":")
  if (separatorIndex === -1) {
    return null
  }

  const type = rest.slice(0, separatorIndex)
  const scriptId = rest.slice(separatorIndex + 1)
  if ((type !== "interval" && type !== "schedule") || !scriptId) {
    return null
  }
  return { type, scriptId }
}

/** Milliseconds until the next local occurrence of "HH:MM". */
const nextOccurrenceOf = (at: string, now = new Date()): number => {
  const [hours, minutes] = at
    .split(":")
    .map((part) => Number.parseInt(part, 10))
  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime()
}

const armedTrigger = <T extends UserScriptTrigger["type"]>(
  script: UserScript,
  type: T,
): Extract<UserScriptTrigger, { type: T }> | undefined =>
  script.triggers.find(
    (trigger): trigger is Extract<UserScriptTrigger, { type: T }> =>
      trigger.type === type &&
      (trigger as { disarmed?: boolean }).disarmed !== true,
  )

/**
 * Rebuilds every user-script alarm from storage. Called on install, on
 * startup, and whenever `monocle-userscripts` changes — alarms persist
 * across service-worker restarts, so a full clear-and-recreate keeps them
 * exactly in sync with the documents.
 */
export const syncUserScriptAlarms = async (): Promise<void> => {
  const alarmsApi = getBrowserAPI().alarms
  if (!alarmsApi) {
    return
  }

  const existing = (await alarmsApi.getAll()) ?? []
  for (const alarm of existing) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await alarmsApi.clear(alarm.name)
    }
  }

  const scripts = await getAllAutomations()
  for (const script of scripts) {
    if (!script.enabled) {
      continue
    }

    const interval = armedTrigger(script, "interval")
    if (interval) {
      alarmsApi.create(alarmName("interval", script.id), {
        periodInMinutes: interval.everyMinutes,
        delayInMinutes: interval.everyMinutes,
      })
    }

    const schedule = armedTrigger(script, "schedule")
    if (schedule) {
      alarmsApi.create(alarmName("schedule", script.id), {
        when: nextOccurrenceOf(schedule.at),
        periodInMinutes: 24 * 60,
      })
    }
  }
}

/**
 * Finds the tab a scheduled run should execute against: the first open tab
 * the script's allow rules match, or the active tab when the script is
 * unscoped. Returns null (skip) when nothing qualifies.
 */
export const findScheduledRunTab = async (
  script: UserScript,
): Promise<{ id: number; url?: string } | null> => {
  const browserAPI = getBrowserAPI()
  const eligibility = await getAutomationEligibility(script)

  if (!eligibility.hasAllowRules) {
    const [activeTab] = await browserAPI.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (
      activeTab?.id &&
      activeTab.url &&
      eligibility.isEligibleForUrl(activeTab.url)
    ) {
      return { id: activeTab.id, url: activeTab.url }
    }
    return null
  }

  const tabs = await browserAPI.tabs.query({})

  const urlsVisible = tabs.some((tab) => typeof tab.url === "string")
  if (!urlsVisible) {
    console.warn(
      `[UserScripts] Scheduled run of "${script.name}" skipped: reading tab URLs needs the optional "tabs" permission`,
    )
    return null
  }

  const match = tabs.find(
    (tab) => tab.id && tab.url && eligibility.isEligibleForUrl(tab.url),
  )
  return match?.id ? { id: match.id, url: match.url } : null
}

const runScheduledScript = async (
  script: UserScript,
  triggerType: "interval" | "schedule" | "onStartup",
): Promise<void> => {
  const tab = await findScheduledRunTab(script)
  if (!tab) {
    console.info(
      `[UserScripts] Scheduled run of "${script.name}" skipped: no eligible tab`,
    )
    return
  }

  await runUserScript(script.id, {
    context: { url: tab.url ?? "", title: "", modifierKey: null },
    invocation: {
      kind: "trigger",
      tabId: tab.id,
      trigger: { type: triggerType, url: tab.url },
    },
  })
}

const handleAlarm = async (alarm: { name: string }): Promise<void> => {
  const parsed = parseAlarmName(alarm.name)
  if (!parsed) {
    return
  }

  const scripts = await getAllAutomations()
  const script = scripts.find((candidate) => candidate.id === parsed.scriptId)
  if (!script || !script.enabled || !armedTrigger(script, parsed.type)) {
    // The document changed since the alarm was created; drop and re-sync.
    await syncUserScriptAlarms()
    return
  }

  await runScheduledScript(script, parsed.type)
}

const runStartupScripts = async (): Promise<void> => {
  const scripts = await getAllAutomations()
  for (const script of scripts) {
    if (script.enabled && armedTrigger(script, "onStartup")) {
      await runScheduledScript(script, "onStartup")
    }
  }
}

/**
 * Wires alarm/startup listeners and keeps alarms in sync with storage.
 * Called once from background/index.ts.
 */
export const initializeUserScriptAlarms = (): void => {
  const browserAPI = getBrowserAPI()

  browserAPI.alarms?.onAlarm?.addListener((alarm) => {
    handleAlarm(alarm).catch((error) => {
      console.error("[UserScripts] Alarm handling failed:", error)
    })
  })

  browserAPI.runtime?.onInstalled?.addListener(() => {
    syncUserScriptAlarms().catch(console.error)
  })

  browserAPI.runtime?.onStartup?.addListener(() => {
    syncUserScriptAlarms().catch(console.error)
    runStartupScripts().catch(console.error)
  })

  browserAPI.storage?.onChanged?.addListener(
    (changes: Record<string, unknown>, areaName: string) => {
      // Feature config changes can add/remove projected automations (which may
      // carry scheduled triggers), so re-sync on either store.
      if (
        areaName === "local" &&
        ("monocle-userscripts" in changes ||
          "monocle-feature-config" in changes)
      ) {
        syncUserScriptAlarms().catch(console.error)
      }
    },
  )

  // Cover the case where the worker restarts without an onStartup event.
  syncUserScriptAlarms().catch(console.error)
}
