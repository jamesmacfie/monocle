// Architecture: background command system. The public surface of the
// command module — a thin barrel, deliberately. The responsibilities the
// old index.ts accumulated now live in focused modules:
//   - source.ts          command loading + category registration
//   - query.ts           context-aware collection building and resolution
//   - execution.ts       execution dispatch + generated row actions
//   - suggestions.ts     CommandNode -> UI-safe Suggestion conversion
//   - searchIndex.ts     palette search index
//   - settings.ts        per-command settings persistence
//   - favorites.ts / usage.ts / settingsCatalog.ts
// Message handlers import from here; keep this file free of logic so no new
// responsibility can quietly accumulate at the root again (the risk noted
// in CLAUDE.md).
import type { Browser, CommandNode } from "../../shared/types"
import { getCommandCollections } from "./query"
import type { CommandLoadOptions } from "./source"
import { allCommands, loadAllCommands } from "./source"

export { executeCommand } from "./execution"
export { commandsToSuggestions } from "./suggestions"
export { allCommands, loadAllCommands }

/**
 * The root palette collections for a context: favorites plus ranked
 * suggestions, with browser/context compatibility and URL filtering applied
 * (see background/commands/query.ts).
 */
export const getCommands = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<{
  favorites: CommandNode[]
  suggestions: CommandNode[]
}> => {
  return await getCommandCollections(context, options)
}
