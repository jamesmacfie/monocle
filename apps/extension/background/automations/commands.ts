// Architecture: background layer. Command generation for automations: maps
// stored documents (background/automations/storage.ts) into palette command
// nodes, mirroring the snippets pattern (background/commands/tools/
// snippets.ts). The "Automations" group is loaded through the normal
// category registration seam (background/commands/source.ts) so automations get
// URL filtering, search, favorites, keybindings, and settings-catalog rows
// through existing machinery — generated nodes carry only the automation id and
// re-read the document at execute time via the engine. User-facing copy
// says "automation" (the store-facing naming decision in
// docs/automations.md); internal ids keep the automation- prefix.
import type {
  Automation,
  Browser,
  CommandNode,
  FormField,
  ManualTrigger,
} from "../../shared/types"
import { automationCommandId } from "../../shared/types/automations"
import { walkAutomationSteps } from "../../shared/utils/automation-introspection"
import { openOptionsPage } from "../../shared/utils/extension-api"
import { createNoOpCommand } from "../utils/commands"
import { runAutomation } from "./engine"
import { getAutomations } from "./storage"

const AUTOMATIONS_OPTIONS_HASH = "/automations"

/** True when any step (nested included) writes into an editable element —
 * those automations' shortcuts must fire while an input is focused, so custom
 * bindings require a non-shift modifier (the snippets precedent). */
const automationTypesIntoPage = (automation: Automation): boolean => {
  let writesText = false
  walkAutomationSteps(automation.steps, (step) => {
    if (
      step.op === "fill" ||
      step.op === "type" ||
      step.op === "insertSnippet"
    ) {
      writesText = true
    }
  })
  return writesText
}

const findManualTrigger = (automation: Automation): ManualTrigger | undefined =>
  automation.triggers.find(
    (trigger): trigger is ManualTrigger => trigger.type === "manual",
  )

const parameterToFormField = (
  parameter: NonNullable<ManualTrigger["parameters"]>[number],
): FormField => {
  if (parameter.type === "select") {
    return {
      id: parameter.id,
      label: parameter.label,
      required: parameter.required,
      type: "select",
      options: parameter.options ?? [],
      defaultValue: parameter.defaultValue,
      placeholder: parameter.placeholder,
    }
  }

  return {
    id: parameter.id,
    label: parameter.label,
    required: parameter.required,
    type: parameter.type,
    placeholder: parameter.placeholder,
    defaultValue: parameter.defaultValue,
  }
}

const runAutomationFromPalette = async (
  automation: Automation,
  context: Browser.Context | undefined,
  paramValues?: Record<string, string>,
): Promise<void> => {
  await runAutomation(automation.id, {
    context: context ?? { url: "", title: "", modifierKey: null },
    invocation: { kind: "manual", paramValues },
  })
}

/** Shared presentation fields for an automation's palette row. */
const automationNodeBase = (automation: Automation) => ({
  id: automationCommandId(automation.id),
  name: automation.name,
  description: automation.description ?? "Run this automation",
  icon: { type: "lucide" as const, name: automation.icon ?? "Workflow" },
  color: automation.color ?? "purple",
  keywords: ["automation", "script", "macro"],
  urlRules: automation.urlRules,
})

/**
 * Maps one automation to its palette node. Manual-trigger automations become
 * runnable rows (or a parameter form when the trigger declares
 * parameters); enabled event-only automations surface as display rows so users
 * can see what is armed; disabled automations get no row.
 */
const automationToCommandNode = (
  automation: Automation,
): CommandNode | null => {
  if (!automation.enabled) {
    return null
  }

  const manualTrigger = findManualTrigger(automation)
  if (!manualTrigger) {
    return {
      type: "display",
      ...automationNodeBase(automation),
      description: "Runs automatically — manage it in Options",
    }
  }

  const keybindingRequirements = automationTypesIntoPage(automation)
    ? { requireNonShiftModifier: true as const }
    : undefined

  if (manualTrigger.parameters && manualTrigger.parameters.length > 0) {
    const parameters = manualTrigger.parameters
    return {
      type: "group",
      ...automationNodeBase(automation),
      // Form fields must not leak into root search (create-snippet shape).
      enableDeepSearch: false,
      keybindingBehavior: "openPaletteAtCommand",
      children: async () => [
        ...parameters.map(
          (parameter): CommandNode => ({
            type: "input",
            id: `${automationCommandId(automation.id)}-param-${parameter.id}`,
            name: parameter.label,
            field: parameterToFormField(parameter),
          }),
        ),
        {
          type: "submit",
          id: `${automationCommandId(automation.id)}-run`,
          name: `Run ${automation.name}`,
          actionLabel: "Run Automation",
          keybindingRequirements,
          execute: async (context, values) => {
            await runAutomationFromPalette(automation, context, values)
          },
        },
      ],
    }
  }

  return {
    type: "action",
    ...automationNodeBase(automation),
    actionLabel: "Run Automation",
    modifierActionLabel: { cmd: "Edit in Options" },
    keybindingRequirements,
    execute: async (context) => {
      if (context?.modifierKey === "cmd") {
        await openOptionsPage(`${AUTOMATIONS_OPTIONS_HASH}/${automation.id}`)
        return
      }
      // The engine re-reads the automation by id — this closure deliberately
      // captures nothing but the id-bearing document reference.
      await runAutomationFromPalette(automation, context)
    },
  }
}

/**
 * The "Automations" group: every stored automation as a child row. Automation ids
 * are stable UUIDs, so child rows are durable enough for the settings
 * catalog (keyboard page, favorites, hide) — the snippets justification.
 */
export const automationsGroup: CommandNode = {
  type: "group",
  id: "automations",
  name: "Automations",
  description: "Run your user-defined automations",
  icon: { type: "lucide", name: "Workflow" },
  color: "purple",
  keywords: ["automation", "script", "macro", "workflow"],
  enableDeepSearch: true,
  settingsCatalog: { includeChildren: true },
  children: async () => {
    const automations = await getAutomations()
    const nodes = automations
      .map(automationToCommandNode)
      .filter((node): node is CommandNode => node !== null)

    if (nodes.length === 0) {
      return [
        createNoOpCommand(
          "no-automations",
          "No automations yet",
          "Use Create Automation to build one in Options",
        ),
      ]
    }

    return nodes
  },
}

/** Opens the options-page builder on a fresh document. */
export const createAutomationCommand: CommandNode = {
  type: "action",
  id: "create-automation",
  name: "Create Automation",
  description: "Build a multi-step automation in Options",
  icon: { type: "lucide", name: "FilePlus" },
  color: "purple",
  keywords: ["automation", "script", "macro", "create", "new"],
  actionLabel: "Open Builder",
  execute: async () => {
    await openOptionsPage(`${AUTOMATIONS_OPTIONS_HASH}/new`)
  },
}

/** Opens the options-page list view. */
export const manageAutomationsCommand: CommandNode = {
  type: "action",
  id: "manage-automations",
  name: "Manage Automations",
  description: "Edit, import, export, and arm automations in Options",
  icon: { type: "lucide", name: "Settings" },
  color: "purple",
  keywords: ["automation", "script", "manage", "edit", "import", "export"],
  actionLabel: "Open Options",
  execute: async () => {
    await openOptionsPage(AUTOMATIONS_OPTIONS_HASH)
  },
}

export const automationCommands: CommandNode[] = [
  automationsGroup,
  createAutomationCommand,
  manageAutomationsCommand,
]
