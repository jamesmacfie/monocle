// Architecture: background layer. Shared automation URL eligibility.
// Non-manual automation entrypoints
// (page triggers and scheduled alarms) must agree on the same rules:
// http(s)-only, command hidden state, user URL overrides, and automation URL rules.
import type { Automation } from "../../shared/types"
import { automationCommandId } from "../../shared/types/automations"
import { getCommandSettings } from "../commands/settings"
import { isCommandVisibleForUrl } from "../utils/urlFilter"

export const isHttpUrl = (url: string): boolean =>
  url.startsWith("http://") || url.startsWith("https://")

export type AutomationEligibility = {
  hasAllowRules: boolean
  isEligibleForUrl: (url: string) => boolean
}

export const getAutomationEligibility = async (
  automation: Automation,
): Promise<AutomationEligibility> => {
  const userSettings = await getCommandSettings(
    automationCommandId(automation.id),
  )
  const hasAllowRules = Boolean(
    automation.urlRules?.allowUrls?.length ||
      userSettings?.urlRules?.allowUrls?.length,
  )

  return {
    hasAllowRules,
    isEligibleForUrl: (url: string) => {
      if (!isHttpUrl(url)) {
        return false
      }

      return isCommandVisibleForUrl(
        { urlRules: automation.urlRules },
        url,
        userSettings,
      )
    },
  }
}

export const isAutomationEligibleForUrl = async (
  automation: Automation,
  url: string,
): Promise<boolean> => {
  const eligibility = await getAutomationEligibility(automation)
  return eligibility.isEligibleForUrl(url)
}
