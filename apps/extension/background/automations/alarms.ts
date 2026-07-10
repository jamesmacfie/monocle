// Architecture: background layer. Scheduled automation triggers (interval,
// schedule, onStartup) on chrome.alarms — MV3 service workers die, so
// setTimeout/setInterval do not survive; alarms are the only correct
// mechanism, re-registered on runtime.onInstalled/onStartup and whenever
// the automation store changes. Target-tab semantics: a scheduled run executes
// against the first open tab the automation's urlRules allow (active tab when
// the automation has no allow rules); with no eligible tab the run is skipped
// with a log, never queued. Reading tab URLs for that matching requires the
// optional "tabs" permission — without it, scoped automations skip and say why.
// Requires the "alarms" permission (declared in wxt.config.ts).
import type { Automation, AutomationTrigger } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { getAutomationEligibility } from "./eligibility"
import { runAutomation } from "./engine"
import { getAllAutomations } from "./registry"

const ALARM_PREFIX = "automation:"

type ScheduledTriggerType = "interval" | "schedule"

const alarmName = (type: ScheduledTriggerType, automationId: string): string =>
  `${ALARM_PREFIX}${type}:${automationId}`

export const parseAlarmName = (
  name: string,
): { type: ScheduledTriggerType; automationId: string } | null => {
  if (!name.startsWith(ALARM_PREFIX)) {
    return null
  }

  const rest = name.slice(ALARM_PREFIX.length)
  const separatorIndex = rest.indexOf(":")
  if (separatorIndex === -1) {
    return null
  }

  const type = rest.slice(0, separatorIndex)
  const automationId = rest.slice(separatorIndex + 1)
  if ((type !== "interval" && type !== "schedule") || !automationId) {
    return null
  }
  return { type, automationId }
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

const armedTrigger = <T extends AutomationTrigger["type"]>(
  automation: Automation,
  type: T,
): Extract<AutomationTrigger, { type: T }> | undefined =>
  automation.triggers.find(
    (trigger): trigger is Extract<AutomationTrigger, { type: T }> =>
      trigger.type === type &&
      (trigger as { disarmed?: boolean }).disarmed !== true,
  )

/**
 * Rebuilds every automation alarm from storage. Called on install, on
 * startup, and whenever `monocle-automations` changes — alarms persist
 * across service-worker restarts, so a full clear-and-recreate keeps them
 * exactly in sync with the documents.
 */
export const syncAutomationAlarms = async (): Promise<void> => {
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

  const automations = await getAllAutomations()
  for (const automation of automations) {
    if (!automation.enabled) {
      continue
    }

    const interval = armedTrigger(automation, "interval")
    if (interval) {
      alarmsApi.create(alarmName("interval", automation.id), {
        periodInMinutes: interval.everyMinutes,
        delayInMinutes: interval.everyMinutes,
      })
    }

    const schedule = armedTrigger(automation, "schedule")
    if (schedule) {
      alarmsApi.create(alarmName("schedule", automation.id), {
        when: nextOccurrenceOf(schedule.at),
        periodInMinutes: 24 * 60,
      })
    }
  }
}

/**
 * Finds the tab a scheduled run should execute against: the first open tab
 * the automation's allow rules match, or the active tab when the automation is
 * unscoped. Returns null (skip) when nothing qualifies.
 */
export const findScheduledRunTab = async (
  automation: Automation,
): Promise<{ id: number; url?: string } | null> => {
  const browserAPI = getBrowserAPI()
  const eligibility = await getAutomationEligibility(automation)

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
      `[Automations] Scheduled run of "${automation.name}" skipped: reading tab URLs needs the optional "tabs" permission`,
    )
    return null
  }

  const match = tabs.find(
    (tab) => tab.id && tab.url && eligibility.isEligibleForUrl(tab.url),
  )
  return match?.id ? { id: match.id, url: match.url } : null
}

const runScheduledAutomation = async (
  automation: Automation,
  triggerType: "interval" | "schedule" | "onStartup",
): Promise<void> => {
  const tab = await findScheduledRunTab(automation)
  if (!tab) {
    console.info(
      `[Automations] Scheduled run of "${automation.name}" skipped: no eligible tab`,
    )
    return
  }

  await runAutomation(automation.id, {
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

  const automations = await getAllAutomations()
  const automation = automations.find(
    (candidate) => candidate.id === parsed.automationId,
  )
  if (
    !automation ||
    !automation.enabled ||
    !armedTrigger(automation, parsed.type)
  ) {
    // The document changed since the alarm was created; drop and re-sync.
    await syncAutomationAlarms()
    return
  }

  await runScheduledAutomation(automation, parsed.type)
}

const runStartupAutomations = async (): Promise<void> => {
  const automations = await getAllAutomations()
  for (const automation of automations) {
    if (automation.enabled && armedTrigger(automation, "onStartup")) {
      await runScheduledAutomation(automation, "onStartup")
    }
  }
}

/**
 * Wires alarm/startup listeners and keeps alarms in sync with storage.
 * Called once from background/index.ts.
 */
export const initializeAutomationAlarms = (): void => {
  const browserAPI = getBrowserAPI()

  browserAPI.alarms?.onAlarm?.addListener((alarm) => {
    handleAlarm(alarm).catch((error) => {
      console.error("[Automations] Alarm handling failed:", error)
    })
  })

  browserAPI.runtime?.onInstalled?.addListener(() => {
    syncAutomationAlarms().catch(console.error)
  })

  browserAPI.runtime?.onStartup?.addListener(() => {
    syncAutomationAlarms().catch(console.error)
    runStartupAutomations().catch(console.error)
  })

  browserAPI.storage?.onChanged?.addListener(
    (changes: Record<string, unknown>, areaName: string) => {
      // Feature config changes can add/remove projected automations (which may
      // carry scheduled triggers), so re-sync on either store.
      if (
        areaName === "local" &&
        ("monocle-automations" in changes ||
          "monocle-feature-config" in changes)
      ) {
        syncAutomationAlarms().catch(console.error)
      }
    },
  )

  // Cover the case where the worker restarts without an onStartup event.
  syncAutomationAlarms().catch(console.error)
}
