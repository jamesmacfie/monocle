// Architecture: background layer. The automation trigger engine for
// page-event triggers (urlMatch, elementAppears). The flow is pull-based so
// no extra permissions are needed: the content trigger service
// (content/automationTriggers.ts) reports its own URL via
// `get-automation-triggers` and receives the armed trigger specs whose
// automation urlRules allow that URL; when a trigger fires, content sends
// `automation-trigger-fired` and the background RE-VALIDATES everything —
// automation existence, enablement, armed state, URL eligibility against the
// sender's actual URL — before the engine runs (which adds its own
// cooldown/concurrency limits). Content never executes anything it wasn't
// sent, and a page cannot fire an automation its rules deny. Scheduled triggers
// live in background/automations/alarms.ts.
import type {
  AutomationPageTriggerSpec,
  AutomationTrigger,
} from "../../shared/types"
import { isAutomationEligibleForUrl, isHttpUrl } from "./eligibility"
import { runAutomation } from "./engine"
import { getAllAutomations } from "./registry"

const isPageTrigger = (
  trigger: AutomationTrigger,
): trigger is Extract<
  AutomationTrigger,
  { type: "urlMatch" } | { type: "elementAppears" }
> => trigger.type === "urlMatch" || trigger.type === "elementAppears"

/**
 * The armed page-trigger specs for one URL — what the content service
 * receives. Disabled automations and disarmed triggers (imports awaiting
 * review) arm nothing.
 */
export const getPageTriggersForUrl = async (
  url: string,
): Promise<AutomationPageTriggerSpec[]> => {
  if (!isHttpUrl(url)) {
    return []
  }

  const automations = await getAllAutomations()
  const specs: AutomationPageTriggerSpec[] = []

  for (const automation of automations) {
    if (!automation.enabled) {
      continue
    }

    const pageTriggers = automation.triggers.filter(
      (trigger) => isPageTrigger(trigger) && trigger.disarmed !== true,
    )
    if (pageTriggers.length === 0) {
      continue
    }

    if (!(await isAutomationEligibleForUrl(automation, url))) {
      continue
    }

    for (const trigger of pageTriggers) {
      if (isPageTrigger(trigger)) {
        specs.push({ automationId: automation.id, trigger })
      }
    }
  }

  return specs
}

export type TriggerFiredInput = {
  automationId: string
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

  const automations = await getAllAutomations()
  const automation = automations.find(
    (candidate) => candidate.id === input.automationId,
  )
  if (!automation || !automation.enabled) {
    return { accepted: false, reason: "Unknown or disabled automation" }
  }

  const armed = automation.triggers.some(
    (trigger) =>
      trigger.type === input.trigger.type && trigger.disarmed !== true,
  )
  if (!armed) {
    return {
      accepted: false,
      reason: "Trigger is not armed for this automation",
    }
  }

  if (!(await isAutomationEligibleForUrl(automation, effectiveUrl))) {
    return {
      accepted: false,
      reason: "URL is not eligible for this automation",
    }
  }

  const result = await runAutomation(automation.id, {
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
