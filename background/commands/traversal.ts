import type {
  BrowserPermission,
  CommandNode,
  UrlRules,
} from "../../shared/types"

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
