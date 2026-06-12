// Architecture: background layer. The user-script trigger engine for
// page-event triggers (urlMatch, elementAppears). The flow is pull-based so
// no extra permissions are needed: the content trigger service
// (content/userScriptTriggers.ts) reports its own URL via
// `get-user-script-triggers` and receives the armed trigger specs whose
// script urlRules allow that URL; when a trigger fires, content sends
// `user-script-trigger-fired` and the background RE-VALIDATES everything —
// script existence, enablement, armed state, URL eligibility against the
// sender's actual URL — before the engine runs (which adds its own
// cooldown/concurrency limits). Content never executes anything it wasn't
// sent, and a page cannot fire a script its rules deny. Scheduled triggers
// live in background/userScripts/alarms.ts.
import type {
  UserScript,
  UserScriptPageTriggerSpec,
  UserScriptTrigger,
} from "../../shared/types"
import { userScriptCommandId } from "../../shared/types/userScripts"
import { getCommandSettings } from "../commands/settings"
import { isCommandVisibleForUrl } from "../utils/urlFilter"
import { runUserScript } from "./engine"
import { getUserScripts } from "./storage"

const isPageTrigger = (
  trigger: UserScriptTrigger,
): trigger is Extract<
  UserScriptTrigger,
  { type: "urlMatch" } | { type: "elementAppears" }
> => trigger.type === "urlMatch" || trigger.type === "elementAppears"

const isHttpUrl = (url: string): boolean =>
  url.startsWith("http://") || url.startsWith("https://")

/**
 * Whether a script's non-manual triggers may act on a URL: the script's own
 * urlRules plus the user's per-command overrides (deny rules and hidden
 * state suppress triggers too — hiding a script should silence it
 * everywhere), evaluated with the standard precedence
 * (docs/url-filtering.md). Extension pages and non-http schemes never
 * qualify.
 */
const isScriptEligibleForUrl = async (
  script: UserScript,
  url: string,
): Promise<boolean> => {
  if (!isHttpUrl(url)) {
    return false
  }

  const userSettings = await getCommandSettings(userScriptCommandId(script.id))
  return isCommandVisibleForUrl(
    { urlRules: script.urlRules },
    url,
    userSettings,
  )
}

/**
 * The armed page-trigger specs for one URL — what the content service
 * receives. Disabled scripts and disarmed triggers (imports awaiting
 * review) arm nothing.
 */
export const getPageTriggersForUrl = async (
  url: string,
): Promise<UserScriptPageTriggerSpec[]> => {
  if (!isHttpUrl(url)) {
    return []
  }

  const scripts = await getUserScripts()
  const specs: UserScriptPageTriggerSpec[] = []

  for (const script of scripts) {
    if (!script.enabled) {
      continue
    }

    const pageTriggers = script.triggers.filter(
      (trigger) => isPageTrigger(trigger) && trigger.disarmed !== true,
    )
    if (pageTriggers.length === 0) {
      continue
    }

    if (!(await isScriptEligibleForUrl(script, url))) {
      continue
    }

    for (const trigger of pageTriggers) {
      if (isPageTrigger(trigger)) {
        specs.push({ scriptId: script.id, trigger })
      }
    }
  }

  return specs
}

export type TriggerFiredInput = {
  scriptId: string
  trigger: {
    type: "urlMatch" | "elementAppears"
    url: string
    matchedText?: string
  }
  senderTabId: number | undefined
  senderUrl: string | undefined
}

export type TriggerFiredOutcome = {
  accepted: boolean
  reason?: string
}

/**
 * Handles a content-reported trigger fire. Everything the page claims is
 * re-checked here: trust lives in the background, not in the reporting
 * document context.
 */
export const handleTriggerFired = async (
  input: TriggerFiredInput,
): Promise<TriggerFiredOutcome> => {
  if (input.senderTabId === undefined) {
    return { accepted: false, reason: "Trigger fire without a sender tab" }
  }

  // The URL the run is validated against is the sender's actual URL when
  // available — a page cannot claim a different URL to widen eligibility.
  const effectiveUrl = input.senderUrl ?? input.trigger.url

  const scripts = await getUserScripts()
  const script = scripts.find((candidate) => candidate.id === input.scriptId)
  if (!script || !script.enabled) {
    return { accepted: false, reason: "Unknown or disabled script" }
  }

  const armed = script.triggers.some(
    (trigger) =>
      trigger.type === input.trigger.type && trigger.disarmed !== true,
  )
  if (!armed) {
    return { accepted: false, reason: "Trigger is not armed for this script" }
  }

  if (!(await isScriptEligibleForUrl(script, effectiveUrl))) {
    return { accepted: false, reason: "URL is not eligible for this script" }
  }

  const result = await runUserScript(script.id, {
    context: {
      url: effectiveUrl,
      title: "",
      modifierKey: null,
    },
    invocation: {
      kind: "trigger",
      tabId: input.senderTabId,
      trigger: {
        type: input.trigger.type,
        url: effectiveUrl,
        matchedText: input.trigger.matchedText,
      },
    },
  })

  return result.success
    ? { accepted: true }
    : { accepted: false, reason: result.error }
}
