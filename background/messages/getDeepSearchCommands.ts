import type { Browser, CommandNode, CommandSuggestion } from "../../types/"
import type { ActionCommandNode, GroupCommandNode } from "../../types/commands"
import { commandsToSuggestions, getCommands } from "../commands"
import { resolveAsyncProperty } from "../utils/commands"

// Helper function to recursively flatten commands with enableDeepSearch: true
export async function flattenDeepSearchCommands(
  commands: Array<CommandNode>,
  context: Browser.Context,
  parentPath: string[] = [],
  inheritedDeepSearch: boolean = false,
): Promise<CommandSuggestion[]> {
  const flattenedCommands: CommandSuggestion[] = []

  for (const command of commands) {
    // Check if this is a group command with deep search enabled
    if (command.type !== "group") continue

    const enableFlag = command.enableDeepSearch
    const shouldDeepSearch =
      enableFlag === true || (inheritedDeepSearch && enableFlag !== false)

    if (shouldDeepSearch) {
      try {
        const children = await command.children(context)
        const commandName = await resolveAsyncProperty(command.name, context)
        const parentNameString = Array.isArray(commandName)
          ? commandName[0]
          : commandName!

        // Create new path by adding this command's name to the path
        const newPath = [...parentPath, parentNameString]

        // Process action nodes
        for (const child of children) {
          if (child.type === "action") {
            // Enhance the action command with breadcrumb name and keywords
            const childName = await resolveAsyncProperty(child.name, context)
            const childKeywords =
              (await resolveAsyncProperty(child.keywords, context)) || []
            const childDescription = await resolveAsyncProperty(
              child.description,
              context,
            )

            const enhancedChild: ActionCommandNode = {
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
            }

            const [suggestion] = await commandsToSuggestions(
              [enhancedChild],
              context,
            )
            flattenedCommands.push(suggestion)
          }
        }

        // Recursively process child groups
        const childGroups = children.filter(
          (child): child is GroupCommandNode => child.type === "group",
        )
        const childFlattenedCommands = await flattenDeepSearchCommands(
          childGroups,
          context,
          newPath,
          true,
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
  deepSearchItems: CommandSuggestion[]
}> {
  // Create a basic execution context
  const context: Browser.Context = {
    url: "",
    title: "",
    modifierKey: null,
  }

  const { suggestions } = await getCommands()

  // Flatten all deep search enabled commands
  const deepSearchItems = await flattenDeepSearchCommands(suggestions, context)

  return { deepSearchItems }
}
