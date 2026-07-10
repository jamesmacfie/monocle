// Architecture: background feature layer (Element Hider). Projects the feature
// config into read-only automations — one per saved rule. Each is an
// `elementAppears` trigger scoped by the rule's URL pattern, then a single
// `hideElement` step. Keeping rules isolated matters because workflows abort on
// first failure; one stale selector must not block unrelated hides on the site.
// These flow through the shared engine/trigger system (merged by
// automations/registry.ts); they are never stored. Each must validate against
// AutomationSchema, so the shape here is deliberately minimal. See
// docs/features.md and docs/element-hider.md.
import type { Automation } from "../../../shared/types"
import { featureAutomationId } from "../../../shared/types/automations"
import {
  ELEMENT_HIDER_FEATURE_ID,
  type ElementHiderConfig,
  type ElementHiderRule,
} from "./types"

// Short, stable key from rule data (the document id is capped at 100 chars).
// djb2 → base36.
const ruleKey = (rule: ElementHiderRule): string => {
  const source = `${rule.id}:${rule.urlPattern}:${rule.selector}`
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`

const ruleLabel = (rule: ElementHiderRule): string =>
  truncate(rule.label?.trim() || rule.selector, 80)

export const projectElementHiderAutomations = (
  config: ElementHiderConfig,
): Automation[] => {
  return config.rules
    .filter((rule) => rule.urlPattern && rule.selector)
    .map((rule) => ({
      id: featureAutomationId(ELEMENT_HIDER_FEATURE_ID, ruleKey(rule)),
      schemaVersion: 1,
      name: `Hide ${ruleLabel(rule)}`,
      description: truncate(
        `Hides ${rule.selector} on ${rule.urlPattern}`,
        500,
      ),
      icon: "EyeOff",
      enabled: true,
      urlRules: { allowUrls: [rule.urlPattern] },
      triggers: [
        {
          type: "elementAppears" as const,
          selector: { strategy: "css" as const, value: rule.selector },
          oncePerPage: true,
        },
      ],
      steps: [
        {
          op: "hideElement" as const,
          target: { strategy: "css" as const, value: rule.selector },
          all: true,
        },
      ],
      // Silent: hiding on every page load should never flash a result toast.
      options: { showResultToast: false },
      owner: { kind: "feature" as const, featureId: ELEMENT_HIDER_FEATURE_ID },
      createdAt: 0,
      updatedAt: 0,
    }))
}
