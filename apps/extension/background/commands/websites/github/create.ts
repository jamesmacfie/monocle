import type { CommandNode, GroupCommandNode } from "../../../../shared/types"
import { createGithubLinkCommand, createGithubSubGroup } from "./common"
import { type GithubPageDetails, repoUrl } from "./parse"

// Section D — quick-create pages for the current repository.
export const createCreateGroup = (
  details: GithubPageDetails,
): GroupCommandNode => {
  const base = repoUrl(details)
  const { owner, repo } = details

  const children: CommandNode[] = [
    createGithubLinkCommand({
      id: "github-create-issue",
      name: "New issue",
      description: `Open a new issue in ${owner}/${repo}`,
      url: `${base}/issues/new/choose`,
      icon: { type: "lucide", name: "Plus" },
      actionLabel: "Create",
      keywords: ["new", "issue", "create", owner, repo],
    }),
    createGithubLinkCommand({
      id: "github-create-pr",
      name: "New pull request",
      description: `Open the compare page to create a pull request in ${owner}/${repo}`,
      url: `${base}/compare`,
      icon: { type: "lucide", name: "Plus" },
      actionLabel: "Create",
      keywords: ["new", "pull request", "pr", "compare", owner, repo],
    }),
    createGithubLinkCommand({
      id: "github-create-release",
      name: "New release",
      description: `Draft a new release in ${owner}/${repo}`,
      url: `${base}/releases/new`,
      icon: { type: "lucide", name: "Plus" },
      actionLabel: "Create",
      keywords: ["new", "release", "tag", owner, repo],
    }),
    createGithubLinkCommand({
      id: "github-create-discussion",
      name: "New discussion",
      description: `Start a new discussion in ${owner}/${repo}`,
      url: `${base}/discussions/new`,
      icon: { type: "lucide", name: "Plus" },
      actionLabel: "Create",
      keywords: ["new", "discussion", owner, repo],
    }),
  ]

  return createGithubSubGroup({
    id: "github-create",
    name: "Create",
    description: "Create an issue, pull request, release, or discussion",
    icon: { type: "lucide", name: "Plus" },
    keywords: ["create", "new"],
    children,
  })
}
