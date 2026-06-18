import type {
  CommandNode,
  GroupCommandNode,
  InputCommandNode,
  SubmitCommandNode,
} from "../../../shared/types"
import { showToast } from "../../messages/showToast"
import { validateUrlPattern } from "../../utils/urlFilter"
import { getCommandSettings, updateCommandUrlRules } from "../settings"
import { loadUserConfigurableCommands } from "../userConfigurableCommands"

export const manageDenyList: GroupCommandNode = {
  type: "group",
  id: "manage-deny-list",
  name: "Manage Command Deny List",
  description: "Configure which domains commands are blocked from appearing on",
  icon: { type: "lucide", name: "ShieldX" },
  // A palette-only configuration surface — not meaningful via the bridge.
  external: { allowed: false },
  keywords: [
    "deny",
    "blacklist",
    "block",
    "hide",
    "domain",
    "filter",
    "manage",
  ],
  children: async () => {
    const commands: CommandNode[] = []

    // Add each command as a group with inputs for its deny rules
    for (const command of loadUserConfigurableCommands()) {
      // Get current settings for this command
      const settings = await getCommandSettings(command.id)
      const currentDenyUrls = settings?.urlRules?.denyUrls || []

      const children: CommandNode[] = []

      const input: InputCommandNode = {
        type: "input",
        id: `${command.id}-deny-patterns`,
        name: "Deny URLs",
        field: {
          id: "deny-patterns",
          label: "Deny URLs (patterns like *://*.github.com/*)",
          type: "text-list",
          placeholder: "e.g. *://*.github.com/* or *://localhost:3000/*",
          defaultValue: currentDenyUrls,
        },
      }

      children.push(input)

      // Add submit button to save settings
      const submit: SubmitCommandNode = {
        type: "submit",
        id: `${command.id}-save-deny`,
        name: "Save Deny List",
        actionLabel: "Save",
        icon: { type: "lucide", name: "Save" },
        remainOpenOnSelect: true, // Keep open to trigger automatic refresh
        execute: async (_context, values) => {
          const raw = String(values?.["deny-patterns"] || "")
          const patterns = raw
            .split(",")
            .map((pattern) => pattern.trim())
            .filter((pattern) => pattern.length > 0)

          for (const pattern of patterns) {
            const validation = validateUrlPattern(pattern)
            if (validation !== true) {
              throw new Error(`Invalid pattern "${pattern}": ${validation}`)
            }
          }

          await updateCommandUrlRules(command.id, {
            denyUrls: patterns.length > 0 ? patterns : undefined,
          })

          await showToast({
            type: "monocle-toast-show",
            level: "success",
            message: "Deny list updated",
          })

          // UI will automatically refresh commands when remainOpenOnSelect is true
        },
      }

      children.push(submit)

      // Create group for this command
      const commandGroup: GroupCommandNode = {
        type: "group",
        id: `${command.id}-deny-group`,
        name: command.name,
        description: `Manage deny list for ${typeof command.name === "string" ? command.name : "this command"}`,
        icon: command.icon,
        children: async () => children,
      }

      commands.push(commandGroup)
    }

    return commands
  },
}
