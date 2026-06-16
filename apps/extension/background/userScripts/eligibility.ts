// Shared automation URL eligibility. Non-manual automation entrypoints
// (page triggers and scheduled alarms) must agree on the same rules:
// http(s)-only, command hidden state, user URL overrides, and script URL rules.
import type { UserScript } from "../../shared/types"
import { userScriptCommandId } from "../../shared/types/userScripts"
import { getCommandSettings } from "../commands/settings"
import { isCommandVisibleForUrl } from "../utils/urlFilter"

export const isHttpUrl = (url: string): boolean =>
  url.startsWith("http://") || url.startsWith("https://")

export type AutomationEligibility = {
  hasAllowRules: boolean
  isEligibleForUrl: (url: string) => boolean
}

export const getAutomationEligibility = async (
  script: UserScript,
): Promise<AutomationEligibility> => {
  const userSettings = await getCommandSettings(userScriptCommandId(script.id))
  const hasAllowRules = Boolean(
    script.urlRules?.allowUrls?.length ||
      userSettings?.urlRules?.allowUrls?.length,
  )

  return {
    hasAllowRules,
    isEligibleForUrl: (url: string) => {
      if (!isHttpUrl(url)) {
        return false
      }

      return isCommandVisibleForUrl(
        { urlRules: script.urlRules },
        url,
        userSettings,
      )
    },
  }
}

export const isAutomationEligibleForUrl = async (
  script: UserScript,
  url: string,
): Promise<boolean> => {
  const eligibility = await getAutomationEligibility(script)
  return eligibility.isEligibleForUrl(url)
}
