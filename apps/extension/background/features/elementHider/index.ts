// Architecture: background feature layer (Element Hider). The FeatureModule
// ties together: the palette commands (which push the generic `picker`
// surface), the projected page-load automations (./automations.ts), and the
// settings page that lists and removes saved rules through the generic
// record-list field. The picker reports a clicked element back via
// surface-action; `handleAction("element-picked")` saves a per-domain rule,
// hides it immediately, and clears the picker. Registered in
// background/features/index.ts. See docs/element-hider.md.
import type { RecordListItem } from "../../../shared/types"
import type { Step } from "../../../shared/types/workflow"
import { showToast } from "../../messages/showToast"
import { removeSurface } from "../../surfaces"
import {
  ensureHostPermission,
  hostPermissionPatternForUrl,
} from "../../utils/hostPermissions"
import { executeWorkflowOnTargetTab } from "../../workflows/execution"
import { getFeatureConfig, setFeatureConfig } from "../config"
import type { FeatureActionContext, FeatureModule } from "../types"
import { projectElementHiderAutomations } from "./automations"
import { elementHiderCommands, PICKER_SURFACE_ID } from "./commands"
import {
  ELEMENT_HIDER_FEATURE_ID,
  type ElementHiderConfig,
  type ElementHiderRule,
  elementHiderConfigDefaults,
  elementHiderConfigSchema,
} from "./types"

const asString = (value: unknown): string =>
  typeof value === "string" ? value : ""

const getConfig = (): Promise<ElementHiderConfig> =>
  getFeatureConfig(ELEMENT_HIDER_FEATURE_ID, elementHiderConfigDefaults)

// Project rules into record-list rows: one row per rule. The CSS selector is
// the primary label (the element's technical identity); the captured text and
// the URL pattern it applies to go in the sublabel.
const projectRules = (config: ElementHiderConfig): RecordListItem[] =>
  config.rules.map((rule) => ({
    id: rule.id,
    label: rule.selector,
    sublabel: rule.label
      ? `${rule.label} · ${rule.urlPattern}`
      : rule.urlPattern,
  }))

// Hide a selector immediately on the picked tab via a one-shot hideElement
// workflow, so the user sees the effect without reloading.
const hideNow = async (tabId: number, selector: string): Promise<void> => {
  const steps: Step[] = [
    {
      op: "hideElement",
      target: { strategy: "css", value: selector },
      all: true,
    },
  ]
  const response = await executeWorkflowOnTargetTab({
    workflow: { version: "1.0", name: "Element Hider", steps },
    context: { url: "", title: "", modifierKey: null },
    tabId,
  })
  if (!response.result.success) {
    throw new Error(
      response.result.error ?? "Element Hider could not hide the element",
    )
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "Element Hider could not hide the element"

const handleElementPicked = async (
  ctx: FeatureActionContext,
): Promise<void> => {
  const selector = ctx.selection?.selector
  const tab = ctx.tab
  if (!selector || !tab?.url) {
    return
  }
  const pattern = hostPermissionPatternForUrl(tab.url)
  if (!pattern.ok) {
    return
  }

  const hostAccess = await ensureHostPermission({
    tabId: tab.id,
    url: tab.url,
    reason: "elementHider",
    request: false,
    ensureContentScript: true,
  })
  if (!hostAccess.granted) {
    await showToast({
      type: "monocle-toast-show",
      level: "warning",
      message:
        hostAccess.error ??
        "Grant site access before hiding elements on this page",
    })
    await removeSurface(ELEMENT_HIDER_FEATURE_ID, PICKER_SURFACE_ID)
    return
  }

  const config = await getConfig()
  const rule: ElementHiderRule = {
    id: crypto.randomUUID(),
    urlPattern: pattern.originPattern,
    selector,
    label: ctx.selection?.innerText
      ? ctx.selection.innerText.slice(0, 60)
      : selector,
  }
  await setFeatureConfig(ELEMENT_HIDER_FEATURE_ID, {
    rules: [...config.rules, rule],
  })

  try {
    await hideNow(tab.id, selector)
  } catch (error) {
    await showToast({
      type: "monocle-toast-show",
      level: "warning",
      message: errorMessage(error),
    })
  } finally {
    await removeSurface(ELEMENT_HIDER_FEATURE_ID, PICKER_SURFACE_ID)
  }
}

export const elementHiderFeature: FeatureModule<ElementHiderConfig> = {
  id: ELEMENT_HIDER_FEATURE_ID,
  name: "Element Hider",
  description: "Hide page elements on matching URLs",
  icon: { type: "lucide", name: "EyeOff" },
  commands: () => elementHiderCommands(),
  automations: (config) => projectElementHiderAutomations(config),
  // Clear any stale picker surface left by a worker restart (feature owners are
  // durable, unlike per-session command owners).
  init: async () => {
    await removeSurface(ELEMENT_HIDER_FEATURE_ID, PICKER_SURFACE_ID)
  },
  settings: {
    configSchema: elementHiderConfigSchema,
    defaults: elementHiderConfigDefaults,
    lists: (config) => ({ rules: projectRules(config) }),
    schema: {
      sections: [
        {
          title: "Hidden elements",
          description:
            "Elements hidden on matching pages. Use “Hide element on this page” from the palette to add one by clicking it.",
          fields: [
            {
              id: "rules",
              label: "Hidden elements",
              type: "record-list",
              emptyText: "Nothing hidden yet. Use “Hide element on this page”.",
              itemActions: [
                { id: "delete-rule", label: "Delete", style: "danger" },
              ],
            },
          ],
        },
      ],
    },
    handleAction: async (actionId, ctx) => {
      if (actionId === "element-picked") {
        await handleElementPicked(ctx)
        return
      }
      if (actionId === "delete-rule") {
        const id = asString(ctx.payload?.itemId)
        if (!id) {
          return
        }
        const config = await getConfig()
        await setFeatureConfig(ELEMENT_HIDER_FEATURE_ID, {
          rules: config.rules.filter((rule) => rule.id !== id),
        })
      }
    },
  },
}
