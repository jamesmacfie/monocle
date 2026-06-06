import type {
  ActionCommandNode,
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  GroupCommandNode,
  SubmitCommandNode,
  Suggestion,
} from "../../shared/types"
import { commandsToSuggestions, getCommands } from "../commands"
import { mergePermissions } from "../commands/query"
import { getAllCommandSettings } from "../commands/settings"
import { resolveAsyncProperty } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"

// Source-based ranking multipliers for deep-search suggestions.
// Root (non-deep-search) commands are implicitly 1.0 in the UI.
export const DEEP_SEARCH_RANK_WEIGHTS: Record<string, number> = {
  "open-tabs": 0.95,
  bookmarks: 0.85,
  "recently-closed": 0.8,
  history: 0.7,
}
const DEFAULT_DEEP_SEARCH_WEIGHT = 1

type FlattenedEntry = {
  suggestion: Suggestion
  dedupeKey?: string
  weight: number
}

// Internal recursive collector — accumulates FlattenedEntry values.
// rootWeight is resolved from the root group id on the first call and
// threaded down so all descendants inherit it.
async function collectDeepSearchEntries(
  commands: Array<CommandNode>,
  context: Browser.Context,
  parentPath: string[] = [],
  inheritedDeepSearch: boolean = false,
  inheritedPermissions: BrowserPermission[] = [],
  preloadedCommandSettings?: Record<string, CommandSettings>,
  rootWeight?: number,
): Promise<FlattenedEntry[]> {
  const entries: FlattenedEntry[] = []
  const commandSettings =
    preloadedCommandSettings ?? (await getAllCommandSettings())

  for (const command of commands) {
    if (command.type !== "group") continue

    const permissions = mergePermissions(
      inheritedPermissions,
      command.permissions,
    )

    const enableFlag = command.enableDeepSearch
    const shouldDeepSearch =
      enableFlag === true || (inheritedDeepSearch && enableFlag !== false)

    if (!shouldDeepSearch) continue

    // Resolve root weight once from the root group id
    const effectiveWeight =
      rootWeight ??
      DEEP_SEARCH_RANK_WEIGHTS[command.id] ??
      DEFAULT_DEEP_SEARCH_WEIGHT

    try {
      if (permissions.length > 0) {
        const { hasAllPermissions } = await checkPermissions(permissions)
        if (!hasAllPermissions) continue
      }

      const children = await command.children(context)

      const filteredChildren = await filterCommandsByUrl(
        children,
        context.url || "",
        commandSettings,
      )

      const commandName = await resolveAsyncProperty(command.name, context)
      const parentNameString = Array.isArray(commandName)
        ? commandName[0]
        : commandName!

      const newPath = [...parentPath, parentNameString]

      for (const child of filteredChildren) {
        if (child.type === "action" || child.type === "submit") {
          const childName = await resolveAsyncProperty(child.name, context)
          const childKeywords =
            (await resolveAsyncProperty(child.keywords, context)) || []
          const childDescription = await resolveAsyncProperty(
            child.description,
            context,
          )

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
            keybinding: childKeybinding,
          }

          const [suggestion] = await commandsToSuggestions(
            [enhancedChild],
            context,
            undefined,
            permissions,
          )

          entries.push({
            suggestion: { ...suggestion, rankWeight: effectiveWeight },
            dedupeKey: child.dedupeKey,
            weight: effectiveWeight,
          })
        }
      }

      // Recurse into child groups, passing the resolved weight down
      const childGroups = filteredChildren.filter(
        (child): child is GroupCommandNode => child.type === "group",
      )
      const childEntries = await collectDeepSearchEntries(
        childGroups,
        context,
        newPath,
        true,
        permissions,
        commandSettings,
        effectiveWeight,
      )
      entries.push(...childEntries)
    } catch (error) {
      console.error(
        `[DeepSearch] Error flattening children for command ${command.id}:`,
        error,
      )
    }
  }

  return entries
}

// Dedupe a flat list of FlattenedEntry values.
// Pass A: collapse identical suggestion ids (fixes history items that appear
//         in multiple time-period groups with the same chrome.history id).
// Pass B: collapse by normalized URL dedupeKey across sources, keeping only
//         entries with the highest weight for that URL. Entries with no
//         dedupeKey (e.g. restore-window) pass through untouched. Two entries
//         from the same source (same weight) with the same URL are both kept.
function dedupeEntries(entries: FlattenedEntry[]): FlattenedEntry[] {
  // Pass A — by suggestion id
  const byId = new Map<string, FlattenedEntry>()
  for (const e of entries) {
    if (!byId.has(e.suggestion.id)) byId.set(e.suggestion.id, e)
  }
  const idDeduped = [...byId.values()]

  // Pass B — by dedupeKey, order-preserving
  const maxWeightByKey = new Map<string, number>()
  for (const e of idDeduped) {
    if (e.dedupeKey != null) {
      const prev = maxWeightByKey.get(e.dedupeKey) ?? -Infinity
      if (e.weight > prev) maxWeightByKey.set(e.dedupeKey, e.weight)
    }
  }

  return idDeduped.filter(
    (e) => e.dedupeKey == null || e.weight === maxWeightByKey.get(e.dedupeKey),
  )
}

// Public API — same signature and return type as before so both callers
// (getCommands.ts and getDeepSearchCommands below) are unaffected.
export async function flattenDeepSearchCommands(
  commands: Array<CommandNode>,
  context: Browser.Context,
  parentPath: string[] = [],
  inheritedDeepSearch: boolean = false,
  inheritedPermissions: BrowserPermission[] = [],
  preloadedCommandSettings?: Record<string, CommandSettings>,
): Promise<Suggestion[]> {
  const entries = await collectDeepSearchEntries(
    commands,
    context,
    parentPath,
    inheritedDeepSearch,
    inheritedPermissions,
    preloadedCommandSettings,
  )
  return dedupeEntries(entries).map((e) => e.suggestion)
}

export async function getDeepSearchCommands(): Promise<{
  deepSearchItems: Suggestion[]
}> {
  const context: Browser.Context = {
    url: "",
    title: "",
    modifierKey: null,
  }

  const { deepSearchCommands } = await getCommands()

  const deepSearchItems = await flattenDeepSearchCommands(
    deepSearchCommands,
    context,
  )

  return { deepSearchItems }
}
