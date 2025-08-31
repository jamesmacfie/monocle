import type { Browser, Command, CommandSuggestion } from "../../types/"
import { commandsToSuggestions, getCommands } from "../commands"
import { resolveAsyncProperty } from "../utils/commands"

// Helper function to recursively flatten commands with enableDeepSearch: true
export async function flattenDeepSearchCommands(
  commands: Command[],
  context: Browser.Context,
  parentPath: string[] = [],
  inheritedDeepSearch: boolean = false,
): Promise<CommandSuggestion[]> {
  const flattenedCommands: CommandSuggestion[] = []

  for (const command of commands) {
    // Check if this command should be deep searched
    const shouldDeepSearch =
      "commands" in command &&
      (command.enableDeepSearch === true ||
        (inheritedDeepSearch && command.enableDeepSearch !== false))

    if (shouldDeepSearch) {
      try {
        const children = await command.commands(context)
        const commandName = await resolveAsyncProperty(command.name, context)
        const parentNameString = Array.isArray(commandName)
          ? commandName[0]
          : commandName!

        // Create new path by adding this command's name to the path
        const newPath = [...parentPath, parentNameString]

        // Process leaf commands (RunCommand or UICommand)
        for (const child of children) {
          if ("run" in child || "ui" in child) {
            // Enhance the child command with breadcrumb name and keywords
            const childName = await resolveAsyncProperty(child.name, context)
            const childKeywords =
              (await resolveAsyncProperty(child.keywords, context)) || []
            const childDescription = await resolveAsyncProperty(
              child.description,
              context,
            )

            const enhancedChild: Command = {
              ...child,
              name:
                newPath.length > 0
                  ? [childName as string, ...newPath.reverse()]
                  : (childName as string),
              keywords: [
                ...childKeywords,
                ...newPath.map((p) => p.toLowerCase()), // Add parent folder names
                ...(childDescription && typeof childDescription === "string"
                  ? [childDescription.toLowerCase()]
                  : []), // Add description/URL
              ],
            }

            // Convert to CommandSuggestion
            const [suggestion] = await commandsToSuggestions(
              [enhancedChild],
              context,
            )
            flattenedCommands.push(suggestion)
          }
        }

        // Recursively process child folders
        const childFlattenedCommands = await flattenDeepSearchCommands(
          children.filter((child) => "commands" in child),
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
