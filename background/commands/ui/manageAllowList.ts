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

export const manageAllowList: GroupCommandNode = {
  type: "group",
  id: "manage-allow-list",
  name: "Manage Command Allow List",
  description: "Configure which domains commands are allowed to appear on",
  icon: { type: "lucide", name: "Shield" },
  keywords: ["allow", "whitelist", "domain", "filter", "manage"],
  children: async () => {
    const commands: CommandNode[] = []

    // Add each command as a group with inputs for its allow rules
    for (const command of loadUserConfigurableCommands()) {
      // Get current settings for this command
      const settings = await getCommandSettings(command.id)
      const currentAllowUrls = settings?.urlRules?.allowUrls || []

      const children: CommandNode[] = []

      const input: InputCommandNode = {
        type: "input",
        id: `${command.id}-allow-patterns`,
        name: "Allow URLs",
        field: {
          id: "allow-patterns",
          label: "Allow URLs (patterns like *://*.github.com/*)",
          type: "text-list",
          placeholder: "e.g. *://*.github.com/* or *://localhost:3000/*",
          defaultValue: currentAllowUrls,
        },
      }

      children.push(input)

      // Add submit button to save settings
      const submit: SubmitCommandNode = {
        type: "submit",
        id: `${command.id}-save-allow`,
        name: "Save Allow List",
        actionLabel: "Save",
        icon: { type: "lucide", name: "Save" },
        remainOpenOnSelect: true, // Keep open to trigger automatic refresh
        execute: async (_context, values) => {
          const raw = String(values?.["allow-patterns"] || "")
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
            allowUrls: patterns.length > 0 ? patterns : undefined,
          })

          await showToast({
            type: "show-toast",
            level: "success",
            message: "Allow list updated",
          })

          // UI will automatically refresh commands when remainOpenOnSelect is true
        },
      }

      children.push(submit)

      // Create group for this command
      const commandGroup: GroupCommandNode = {
        type: "group",
        id: `${command.id}-allow-group`,
        name: command.name,
        description: `Manage allow list for ${typeof command.name === "string" ? command.name : "this command"}`,
        icon: command.icon,
        children: async () => children,
      }

      commands.push(commandGroup)
    }

    return commands
  },
}
