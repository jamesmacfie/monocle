import type {
  CommandNode,
  GroupCommandNode,
  SearchCommandNode,
} from "../../../../shared/types"
import { createGithubLinkCommand, createGithubSubGroup } from "./common"
import type { GithubPageDetails } from "./parse"

type SearchTarget = {
  id: string
  name: string
  description: string
  /** Builds the GitHub URL for a non-empty, trimmed query. */
  buildUrl: (query: string) => string
}

const createSearchCommand = (target: SearchTarget): SearchCommandNode => ({
  type: "search",
  id: target.id,
  name: target.name,
  description: target.description,
  icon: { type: "lucide", name: "Search" },
  keywords: ["github", "search", target.name.toLowerCase()],
  getResults: async (_context, search): Promise<CommandNode[]> => {
    const query = search.trim()
    if (!query) {
      return []
    }

    return [
      createGithubLinkCommand({
        id: `${target.id}-result`,
        name: `Search for "${query}"`,
        description: target.description,
        url: target.buildUrl(query),
        icon: { type: "lucide", name: "Search" },
        keywords: [query],
        // Dynamic id changes with the query, so never bind a key to it.
        allowCustomKeybinding: false,
      }),
    ]
  },
})

export const createSearchGroup = (
  details: GithubPageDetails,
): GroupCommandNode => {
  const { owner, repo } = details
  const repoSlug = `${owner}/${repo}`

  const targets: SearchTarget[] = [
    {
      id: "github-search-repo-code",
      name: "Search code in this repo",
      description: `Search code in ${repoSlug}`,
      buildUrl: (query) =>
        `https://github.com/search?q=${encodeURIComponent(
          `${query} repo:${repoSlug}`,
        )}&type=code`,
    },
    {
      id: "github-search-repo-issues",
      name: "Search issues in this repo",
      description: `Search issues in ${repoSlug}`,
      buildUrl: (query) =>
        `https://github.com/${owner}/${repo}/issues?q=${encodeURIComponent(query)}`,
    },
    {
      id: "github-search-repo-pulls",
      name: "Search pull requests in this repo",
      description: `Search pull requests in ${repoSlug}`,
      buildUrl: (query) =>
        `https://github.com/${owner}/${repo}/pulls?q=${encodeURIComponent(query)}`,
    },
    {
      id: "github-search-all-code",
      name: "Search all of GitHub (code)",
      description: "Search code across all of GitHub",
      buildUrl: (query) =>
        `https://github.com/search?q=${encodeURIComponent(query)}&type=code`,
    },
  ]

  return createGithubSubGroup({
    id: "github-search",
    name: "Search",
    description: "Search GitHub with a prepopulated query",
    icon: { type: "lucide", name: "Search" },
    keywords: ["search", "find", owner, repo],
    children: targets.map(createSearchCommand),
  })
}
