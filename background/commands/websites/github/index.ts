import type { CommandNode, GroupCommandNode } from "../../../../shared/types"
import { createNoOpCommand } from "../../../utils/commands"
import { createCreateGroup } from "./create"
import { createMyGithubGroup } from "./lists"
import {
  createGoToGroup,
  createIssueNavigationCommands,
  createPullRequestNavigationCommands,
} from "./navigation"
import { parseGithubPage } from "./parse"
import { createSearchGroup } from "./search"
import { createToggleStarCommand } from "./workflows"

export type { GithubPageDetails } from "./parse"
export { parseGithubPage } from "./parse"

const GITHUB_DOMAIN_ALLOW_LIST = ["*://github.com/*", "*://*.github.com/*"]

export const githubCommands: GroupCommandNode = {
  type: "group",
  id: "github-actions",
  name: async (context) => {
    const details = parseGithubPage(context?.url)
    return details
      ? `GitHub: ${details.owner}/${details.repo}`
      : "GitHub Actions"
  },
  description: "Contextual GitHub commands for the current page",
  icon: { type: "lucide", name: "Github" },
  color: "gray",
  keywords: ["github", "repository", "pull request", "issue"],
  urlRules: {
    allowUrls: GITHUB_DOMAIN_ALLOW_LIST,
  },
  children: async (context) => {
    const details = parseGithubPage(context?.url)

    if (!details) {
      return [
        createNoOpCommand(
          "github-no-actions",
          "No GitHub actions available",
          "This GitHub page is not currently supported.",
          { type: "lucide", name: "Info" },
        ),
      ]
    }

    const commands: CommandNode[] = [
      createGoToGroup(details),
      createSearchGroup(details),
      createMyGithubGroup(details),
      createCreateGroup(details),
    ]

    // The repository star button lives in the repo overview header, which
    // renders on repo-level pages but not on pull-request or issue detail
    // pages. Only offer Toggle Star where the button actually exists.
    if (details.type === "repo") {
      commands.unshift(createToggleStarCommand(details))
    }

    if (details.type === "pull") {
      commands.push(...createPullRequestNavigationCommands(details))
    }

    if (details.type === "issue") {
      commands.push(...createIssueNavigationCommands(details))
    }

    return commands
  },
}
