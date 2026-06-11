import type { SettingsCatalogCommand } from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { hasCustomKeybinding } from "./catalog"

export type KeybindingTemplateId = "default" | "vim"

export type KeybindingTemplateBinding = {
  commandId: string
  commandName: string
  keybinding: string
  status: "enabled" | "pending"
  dependencyProposal?: string
  note?: string
}

export type KeybindingTemplate = {
  id: KeybindingTemplateId
  name: string
  description: string
  bindings: KeybindingTemplateBinding[]
}

export type TemplatePreviewRow = {
  id: string
  commandId: string
  commandName: string
  keybinding?: string
  command?: SettingsCatalogCommand
  status: "enabled" | "pending" | "unavailable"
  dependencyProposal?: string
  note?: string
  hasCustomKeybinding: boolean
}

export type TemplateSaveOperation = {
  commandId: string
  keybinding: string | null
}

const vimBindings: KeybindingTemplateBinding[] = [
  {
    commandId: "add-bookmark",
    commandName: "Add Bookmark",
    keybinding: "a",
    status: "enabled",
  },
  {
    commandId: "open-new-tab",
    commandName: "Open new tab",
    keybinding: "t",
    status: "enabled",
  },
  {
    commandId: "reload-current-tab",
    commandName: "Reload current tab",
    keybinding: "r",
    status: "enabled",
  },
  {
    commandId: "hard-reload-current-tab",
    commandName: "Hard reload current tab",
    keybinding: "<shift-r>",
    status: "enabled",
  },
  {
    commandId: "stop-loading-current-tab",
    commandName: "Stop loading current tab",
    keybinding: "x",
    status: "enabled",
  },
  {
    commandId: "reopen-last-closed-tab",
    commandName: "Reopen last closed tab",
    keybinding: "u",
    status: "enabled",
  },
  {
    commandId: "duplicate-current-tab",
    commandName: "Duplicate current tab",
    keybinding: "y, t",
    status: "enabled",
  },
  {
    commandId: "focus-next-tab",
    commandName: "Go to next tab",
    keybinding: "g, t",
    status: "enabled",
  },
  {
    commandId: "focus-previous-tab",
    commandName: "Go to previous tab",
    keybinding: "g, <shift-t>",
    status: "enabled",
  },
  {
    commandId: "focus-first-tab",
    commandName: "Go to first tab",
    keybinding: "g, 0",
    status: "enabled",
  },
  {
    commandId: "focus-last-tab",
    commandName: "Go to last tab",
    keybinding: "g, <shift-4>",
    status: "enabled",
  },
  {
    commandId: "focus-last-active-tab",
    commandName: "Go to last active tab",
    keybinding: "<ctrl-6>",
    status: "enabled",
  },
  {
    commandId: "focus-audible-tab",
    commandName: "Go to audible tab",
    keybinding: "g, a",
    status: "enabled",
  },
  {
    commandId: "move-tab-left",
    commandName: "Move tab left",
    keybinding: "<shift-,>",
    status: "enabled",
  },
  {
    commandId: "move-tab-right",
    commandName: "Move tab right",
    keybinding: "<shift-.>",
    status: "enabled",
  },
  {
    commandId: "toggle-pin-current-tab",
    commandName: "Pin or unpin current tab",
    keybinding: "<alt-p>",
    status: "enabled",
  },
  {
    commandId: "toggle-mute-current-tab",
    commandName: "Mute or unmute current tab",
    keybinding: "<alt-m>",
    status: "enabled",
  },
  {
    commandId: "toggle-reader-mode",
    commandName: "Toggle Reader Mode",
    keybinding: "g, r",
    status: "enabled",
    note: "Firefox only",
  },
  {
    commandId: "go-back",
    commandName: "Go Back",
    keybinding: "<shift-h>",
    status: "enabled",
  },
  {
    commandId: "go-forward",
    commandName: "Go Forward",
    keybinding: "<shift-l>",
    status: "enabled",
  },
  {
    commandId: "scroll-line-down",
    commandName: "Scroll down",
    keybinding: "j",
    status: "enabled",
  },
  {
    commandId: "scroll-line-up",
    commandName: "Scroll up",
    keybinding: "k",
    status: "enabled",
  },
  {
    commandId: "scroll-left",
    commandName: "Scroll left",
    keybinding: "h",
    status: "enabled",
  },
  {
    commandId: "scroll-right",
    commandName: "Scroll right",
    keybinding: "l",
    status: "enabled",
  },
  {
    commandId: "scroll-half-page-down",
    commandName: "Scroll half page down",
    keybinding: "<ctrl-d>",
    status: "enabled",
  },
  {
    commandId: "scroll-half-page-up",
    commandName: "Scroll half page up",
    keybinding: "<ctrl-u>",
    status: "enabled",
  },
  {
    commandId: "scroll-full-page-down",
    commandName: "Scroll page down",
    keybinding: "<ctrl-f>",
    status: "enabled",
  },
  {
    commandId: "scroll-full-page-up",
    commandName: "Scroll page up",
    keybinding: "<ctrl-b>",
    status: "enabled",
  },
  {
    commandId: "scroll-to-top",
    commandName: "Scroll to top",
    keybinding: "g, g",
    status: "enabled",
  },
  {
    commandId: "scroll-to-bottom",
    commandName: "Scroll to bottom",
    keybinding: "<shift-g>",
    status: "enabled",
  },
  {
    commandId: "scroll-far-left",
    commandName: "Scroll to far left",
    keybinding: "z, <shift-h>",
    status: "enabled",
  },
  {
    commandId: "scroll-far-right",
    commandName: "Scroll to far right",
    keybinding: "z, <shift-l>",
    status: "enabled",
  },
  {
    commandId: "go-to-parent-url",
    commandName: "Go to parent URL",
    keybinding: "g, u",
    status: "enabled",
  },
  {
    commandId: "go-to-root-url",
    commandName: "Go to root URL",
    keybinding: "g, <shift-u>",
    status: "enabled",
  },
  {
    commandId: "increment-url-number",
    commandName: "Increment URL number",
    keybinding: "<ctrl-a>",
    status: "enabled",
  },
  {
    commandId: "decrement-url-number",
    commandName: "Decrement URL number",
    keybinding: "<ctrl-x>",
    status: "enabled",
  },
  {
    commandId: "view-source-current-tab",
    commandName: "View page source",
    keybinding: "g, s",
    status: "enabled",
  },
  {
    commandId: "copy-current-url",
    commandName: "Copy URL",
    keybinding: "y, y",
    status: "enabled",
  },
  {
    commandId: "copy-clean-current-url",
    commandName: "Copy URL without parameters",
    keybinding: "y, u",
    status: "enabled",
  },
  {
    commandId: "copy-current-domain",
    commandName: "Copy domain",
    keybinding: "y, d",
    status: "enabled",
  },
  {
    commandId: "copy-canonical-url",
    commandName: "Copy canonical URL",
    keybinding: "y, c",
    status: "enabled",
  },
  {
    commandId: "copy-current-title",
    commandName: "Copy page title",
    keybinding: "y, <shift-t>",
    status: "enabled",
  },
  {
    commandId: "copy-title-and-url-as-markdown",
    commandName: "Copy title + URL as Markdown",
    keybinding: "y, m",
    status: "enabled",
  },
]

export const keybindingTemplates: KeybindingTemplate[] = [
  {
    id: "default",
    name: "Default",
    description: "Use Monocle's built-in shortcuts.",
    bindings: [],
  },
  {
    id: "vim",
    name: "Vim",
    description: "Apply Vimium/Tridactyl-style browser shortcuts.",
    bindings: vimBindings.map((binding) => ({
      ...binding,
      keybinding: normalizeKeybinding(binding.keybinding),
    })),
  },
]

export const getKeybindingTemplate = (
  templateId: KeybindingTemplateId,
): KeybindingTemplate =>
  keybindingTemplates.find((template) => template.id === templateId) ??
  keybindingTemplates[0]

export function getTemplatePreviewRows(
  templateId: KeybindingTemplateId,
  commands: SettingsCatalogCommand[],
): TemplatePreviewRow[] {
  const commandsById = new Map(commands.map((command) => [command.id, command]))

  if (templateId === "default") {
    return commands
      .filter(
        (command) =>
          command.capabilities.canSetKeybinding &&
          (command.defaultKeybinding || hasCustomKeybinding(command)),
      )
      .map((command) => ({
        id: `default:${command.id}`,
        commandId: command.id,
        commandName: command.name,
        keybinding: command.defaultKeybinding,
        command,
        status: "enabled",
        hasCustomKeybinding: hasCustomKeybinding(command),
      }))
  }

  return getKeybindingTemplate(templateId).bindings.map((binding) => {
    const command = commandsById.get(binding.commandId)
    const commandSupportsKeybinding =
      command?.capabilities.canSetKeybinding === true

    return {
      id: `${templateId}:${binding.commandId}`,
      commandId: binding.commandId,
      commandName: command?.name ?? binding.commandName,
      keybinding: binding.keybinding,
      command,
      status:
        binding.status === "pending"
          ? "pending"
          : commandSupportsKeybinding
            ? "enabled"
            : "unavailable",
      dependencyProposal: binding.dependencyProposal,
      note:
        binding.status === "pending"
          ? binding.note
          : command
            ? binding.note
            : binding.note || "Not available in this browser/context",
      hasCustomKeybinding: command ? hasCustomKeybinding(command) : false,
    }
  })
}

export function getTemplateSaveOperations({
  templateId,
  commands,
  overrideCustomKeybindings,
}: {
  templateId: KeybindingTemplateId
  commands: SettingsCatalogCommand[]
  overrideCustomKeybindings: boolean
}): TemplateSaveOperation[] {
  if (templateId === "default") {
    if (!overrideCustomKeybindings) {
      return []
    }

    return commands
      .filter(
        (command) =>
          command.capabilities.canSetKeybinding && hasCustomKeybinding(command),
      )
      .map((command) => ({
        commandId: command.id,
        keybinding: null,
      }))
  }

  return getTemplatePreviewRows(templateId, commands)
    .filter((row) => row.status === "enabled" && row.command && row.keybinding)
    .filter((row) => overrideCustomKeybindings || !row.hasCustomKeybinding)
    .map((row) => ({
      commandId: row.commandId,
      keybinding: row.keybinding ?? null,
    }))
}
