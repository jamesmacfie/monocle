import type {
  ActionCommandNode,
  Browser,
  BrowserPermission,
  CommandNode,
  GroupCommandNode,
  SubmitCommandNode,
  Suggestion,
} from "../../shared/types"
import { commandsToSuggestions, getCommands } from "../commands"
import { getAllCommandSettings } from "../commands/settings"
import { resolveAsyncProperty } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"

const mergePermissions = (
  inherited: BrowserPermission[],
  own?: BrowserPermission[],
): BrowserPermission[] => {
  return Array.from(new Set([...inherited, ...(own ?? [])]))
}

// Helper function to recursively flatten commands with enableDeepSearch: true
export async function flattenDeepSearchCommands(
  commands: Array<CommandNode>,
  context: Browser.Context,
  parentPath: string[] = [],
  inheritedDeepSearch: boolean = false,
  inheritedPermissions: BrowserPermission[] = [],
): Promise<Suggestion[]> {
  const flattenedCommands: Suggestion[] = []

  for (const command of commands) {
    // Check if this is a group command with deep search enabled
    if (command.type !== "group") continue

    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    const enableFlag = command.enableDeepSearch
    const shouldDeepSearch =
      enableFlag === true || (inheritedDeepSearch && enableFlag !== false)

    if (shouldDeepSearch) {
      try {
        // Check if command requires permissions before calling children()
        if (permissions.length > 0) {
          const { hasAllPermissions } = await checkPermissions(permissions)

          if (!hasAllPermissions) {
            // Skip this command if permissions are missing - don't call children()
            continue
          }
        }

        const children = await command.children(context)
        const commandSettings = await getAllCommandSettings()

        // Filter children based on URL rules
        const filteredChildren = await filterCommandsByUrl(
          children,
          context.url || "",
          commandSettings,
        )

        const commandName = await resolveAsyncProperty(command.name, context)
        const parentNameString = Array.isArray(commandName)
          ? commandName[0]
          : commandName!

        // Create new path by adding this command's name to the path
        const newPath = [...parentPath, parentNameString]

        // Process action and submit nodes
        for (const child of filteredChildren) {
          if (child.type === "action" || child.type === "submit") {
            // Enhance the action command with breadcrumb name and keywords
            const childName = await resolveAsyncProperty(child.name, context)
            const childKeywords =
              (await resolveAsyncProperty(child.keywords, context)) || []
            const childDescription = await resolveAsyncProperty(
              child.description,
              context,
            )

            // Preserve keybinding from settings or original command
            const childKeybinding =
              commandSettings[child.id]?.keybinding || child.keybinding

            const enhancedChild: ActionCommandNode | SubmitCommandNode = {
              ...child,
              name:
                newPath.length > 0
                  ? [childName as string, ...[...newPath].reverse()]
                  : (childName as string),
              keywords: [
                ...childKeywords,
                ...newPath.map((p) => p.toLowerCase()),
                ...(childDescription && typeof childDescription === "string"
                  ? [childDescription.toLowerCase()]
                  : []),
              ],
              keybinding: childKeybinding, // Explicitly preserve keybinding
            }

            const [suggestion] = await commandsToSuggestions(
              [enhancedChild],
              context,
              undefined,
              permissions,
            )
            flattenedCommands.push(suggestion)
          }
        }

        // Recursively process child groups
        const childGroups = filteredChildren.filter(
          (child): child is GroupCommandNode => child.type === "group",
        )
        const childFlattenedCommands = await flattenDeepSearchCommands(
          childGroups,
          context,
          newPath,
          true,
          permissions,
        )
        flattenedCommands.push(...childFlattenedCommands)
      } catch (error) {
        console.error(
          `[DeepSearch] Error flattening children for command ${command.id}:`,
          error,
        )
      }
    }
  }

  return flattenedCommands
}

export async function getDeepSearchCommands(): Promise<{
  deepSearchItems: Suggestion[]
}> {
  // Create a basic execution context
  const context: Browser.Context = {
    url: "",
    title: "",
    modifierKey: null,
  }

  const { deepSearchCommands } = await getCommands()

  // Flatten all deep search enabled commands
  const deepSearchItems = await flattenDeepSearchCommands(
    deepSearchCommands,
    context,
  )

  return { deepSearchItems }
}
