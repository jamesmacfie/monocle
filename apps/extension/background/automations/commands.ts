// Architecture: background layer. Command generation for automations: maps
// stored documents (background/automations/storage.ts) into palette command
// nodes, mirroring the snippets pattern (background/commands/tools/
// snippets.ts). The "Automations" group is loaded through the normal
// category registration seam (background/commands/source.ts) so scripts get
// URL filtering, search, favorites, keybindings, and settings-catalog rows
// through existing machinery — generated nodes carry only the script id and
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
import { openOptionsPage } from "../../shared/utils/extension-api"
import { createNoOpCommand } from "../utils/commands"
import { runAutomation } from "./engine"
import { getAutomations } from "./storage"

const USER_SCRIPTS_OPTIONS_HASH = "/automations"

/** True when any step (nested included) writes into an editable element —
 * those scripts' shortcuts must fire while an input is focused, so custom
 * bindings require a non-shift modifier (the snippets precedent). */
const scriptTypesIntoPage = (script: Automation): boolean => {
  const writesText = (steps: Automation["steps"]): boolean =>
    steps.some((step) => {
      if (
        step.op === "fill" ||
        step.op === "type" ||
        step.op === "insertSnippet"
      ) {
        return true
      }
      if (step.op === "branch") {
        return (
          writesText(step.then) || (step.else ? writesText(step.else) : false)
        )
      }
      if (step.op === "forEach" || step.op === "while") {
        return writesText(step.steps)
      }
      return false
    })

  return writesText(script.steps)
}

const findManualTrigger = (script: Automation): ManualTrigger | undefined =>
  script.triggers.find(
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

const runScriptFromPalette = async (
  script: Automation,
  context: Browser.Context | undefined,
  paramValues?: Record<string, string>,
): Promise<void> => {
  await runAutomation(script.id, {
    context: context ?? { url: "", title: "", modifierKey: null },
    invocation: { kind: "manual", paramValues },
  })
}

/** Shared presentation fields for a script's palette row. */
const scriptNodeBase = (script: Automation) => ({
  id: automationCommandId(script.id),
  name: script.name,
  description: script.description ?? "Run this automation",
  icon: { type: "lucide" as const, name: script.icon ?? "Workflow" },
  color: script.color ?? "purple",
  keywords: ["automation", "script", "macro"],
  urlRules: script.urlRules,
})

/**
 * Maps one script to its palette node. Manual-trigger scripts become
 * runnable rows (or a parameter form when the trigger declares
 * parameters); enabled event-only scripts surface as display rows so users
 * can see what is armed; disabled scripts get no row.
 */
const scriptToCommandNode = (script: Automation): CommandNode | null => {
  if (!script.enabled) {
    return null
  }

  const manualTrigger = findManualTrigger(script)
  if (!manualTrigger) {
    return {
      type: "display",
      ...scriptNodeBase(script),
      description: "Runs automatically — manage it in Options",
    }
  }

  const keybindingRequirements = scriptTypesIntoPage(script)
    ? { requireNonShiftModifier: true as const }
    : undefined

  if (manualTrigger.parameters && manualTrigger.parameters.length > 0) {
    const parameters = manualTrigger.parameters
    return {
      type: "group",
      ...scriptNodeBase(script),
      // Form fields must not leak into root search (create-snippet shape).
      enableDeepSearch: false,
      keybindingBehavior: "openPaletteAtCommand",
      children: async () => [
        ...parameters.map(
          (parameter): CommandNode => ({
            type: "input",
            id: `${automationCommandId(script.id)}-param-${parameter.id}`,
            name: parameter.label,
            field: parameterToFormField(parameter),
          }),
        ),
        {
          type: "submit",
          id: `${automationCommandId(script.id)}-run`,
          name: `Run ${script.name}`,
          actionLabel: "Run Automation",
          keybindingRequirements,
          execute: async (context, values) => {
            await runScriptFromPalette(script, context, values)
          },
        },
      ],
    }
  }

  return {
    type: "action",
    ...scriptNodeBase(script),
    actionLabel: "Run Automation",
    modifierActionLabel: { cmd: "Edit in Options" },
    keybindingRequirements,
    execute: async (context) => {
      if (context?.modifierKey === "cmd") {
        await openOptionsPage(`${USER_SCRIPTS_OPTIONS_HASH}/${script.id}`)
        return
      }
      // The engine re-reads the script by id — this closure deliberately
      // captures nothing but the id-bearing document reference.
      await runScriptFromPalette(script, context)
    },
  }
}

/**
 * The "Automations" group: every stored script as a child row. Script ids
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
  keywords: ["automation", "script", "macro", "workflow", "automation"],
  enableDeepSearch: true,
  settingsCatalog: { includeChildren: true },
  children: async () => {
    const scripts = await getAutomations()
    const nodes = scripts
      .map(scriptToCommandNode)
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
    await openOptionsPage(`${USER_SCRIPTS_OPTIONS_HASH}/new`)
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
    await openOptionsPage(USER_SCRIPTS_OPTIONS_HASH)
  },
}

export const automationCommands: CommandNode[] = [
  automationsGroup,
  createAutomationCommand,
  manageAutomationsCommand,
]
