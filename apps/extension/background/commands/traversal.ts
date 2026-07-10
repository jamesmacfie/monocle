import type {
  Browser,
  BrowserPermission,
  CommandNode,
  CommandSettings,
  GroupCommandNode,
  UrlRules,
} from "../../shared/types"
import { resolveCommandName } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { filterCommandsByUrl } from "../utils/urlFilter"

export type UrlRuleChainLink = {
  id: string
  urlRules?: UrlRules
}

// Union of ancestor-inherited permissions and a node's own, deduped. A child
// always requires at least what its groups require, so permission gating uses
// the merged set as it descends.
export const mergePermissions = (
  inherited: BrowserPermission[],
  own?: BrowserPermission[],
): BrowserPermission[] => Array.from(new Set([...inherited, ...(own ?? [])]))

/** Deep-search opt-in with inheritance. An explicit false stops inheritance. */
export const shouldDeepSearchGroup = (
  group: GroupCommandNode,
  inheritedDeepSearch: boolean,
): boolean =>
  group.enableDeepSearch === true ||
  (inheritedDeepSearch && group.enableDeepSearch !== false)

/** Browser permission truth for a merged command branch. */
export const hasAllPermissions = async (
  permissions: BrowserPermission[],
): Promise<boolean> => (await checkPermissions(permissions)).hasAllPermissions

export type WalkNode = {
  command: CommandNode
  permissions: BrowserPermission[]
  parentNames: string[]
  parentIds: string[]
  deepSearchEnabled: boolean
}

type WalkGroupNode = Omit<WalkNode, "command"> & {
  command: GroupCommandNode
}

export type WalkOptions = {
  context: Browser.Context
  commandSettings: Record<string, CommandSettings>
  /** Called for every visited node. Return "stop" to end the whole walk. */
  visit: (node: WalkNode) => void | "stop" | Promise<void> | Promise<"stop">
  /** Optional gate for descending into a permitted group. */
  shouldDescend?: (group: WalkGroupNode) => boolean
}

/**
 * Walks an already URL-filtered command level and owns descendant resolution:
 * inherited permissions, URL filtering, breadcrumbs, and group failure
 * isolation. Callers remain responsible for filtering the root level.
 */
export const walkCommandTree = async (
  commands: CommandNode[],
  options: WalkOptions,
): Promise<void> => {
  const walkLevel = async (
    levelCommands: CommandNode[],
    inheritedPermissions: BrowserPermission[],
    parentNames: string[],
    parentIds: string[],
    inheritedDeepSearch: boolean,
  ): Promise<boolean> => {
    for (const command of levelCommands) {
      const permissions = mergePermissions(
        inheritedPermissions,
        command.permissions,
      )
      const deepSearchEnabled =
        command.type === "group"
          ? shouldDeepSearchGroup(command, inheritedDeepSearch)
          : inheritedDeepSearch
      const node: WalkNode = {
        command,
        permissions,
        parentNames,
        parentIds,
        deepSearchEnabled,
      }

      if ((await options.visit(node)) === "stop") {
        return true
      }

      if (command.type !== "group") {
        continue
      }

      const groupNode: WalkGroupNode = { ...node, command }
      if (options.shouldDescend && !options.shouldDescend(groupNode)) {
        continue
      }
      if (!(await hasAllPermissions(permissions))) {
        continue
      }

      try {
        const children = await command.children(options.context)
        const filteredChildren = await filterCommandsByUrl(
          children,
          options.context.url || "",
          options.commandSettings,
        )
        const parentName = await resolveCommandName(
          command.name,
          options.context,
        )
        const stopped = await walkLevel(
          filteredChildren,
          permissions,
          [parentName, ...parentNames],
          [command.id, ...parentIds],
          deepSearchEnabled,
        )
        if (stopped) {
          return true
        }
      } catch (error) {
        console.error(
          `Error getting children for command ${command.id}:`,
          error,
        )
      }
    }

    return false
  }

  await walkLevel(commands, [], [], [], false)
}

export const toUrlRuleChainLink = (
  command: Pick<CommandNode, "id" | "urlRules">,
): UrlRuleChainLink => ({
  id: command.id,
  urlRules: command.urlRules,
})

export const appendUrlRuleChain = (
  chain: UrlRuleChainLink[],
  command: Pick<CommandNode, "id" | "urlRules">,
): UrlRuleChainLink[] => [...chain, toUrlRuleChainLink(command)]

export const reverseBreadcrumb = (path: string[]): string[] =>
  [...path].reverse()
