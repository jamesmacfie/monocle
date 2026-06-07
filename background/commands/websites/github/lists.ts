import type { CommandNode, GroupCommandNode } from "../../../../shared/types"
import { createGithubLinkCommand, createGithubSubGroup } from "./common"
import { type GithubPageDetails, repoUrl } from "./parse"

// Section C — filtered lists. The @me / global URLs need no username, so these
// resolve without reading the page or hitting the API.
const search = (query: string): string => encodeURIComponent(query)

export const createMyGithubGroup = (
  details: GithubPageDetails,
): GroupCommandNode => {
  const { owner, repo } = details
  const base = repoUrl(details)

  const children: CommandNode[] = [
    createGithubLinkCommand({
      id: "github-my-prs",
      name: "My open pull requests",
      description: "Pull requests you opened across GitHub",
      url: "https://github.com/pulls",
      keywords: ["my", "pull requests", "prs", "mine"],
    }),
    createGithubLinkCommand({
      id: "github-my-review-requests",
      name: "PRs awaiting my review",
      description: "Pull requests where your review is requested",
      url: `https://github.com/pulls?q=${search("is:open is:pr review-requested:@me")}`,
      keywords: ["my", "review", "requested", "prs"],
    }),
    createGithubLinkCommand({
      id: "github-my-assigned-prs",
      name: "PRs assigned to me",
      description: "Open pull requests assigned to you",
      url: `https://github.com/pulls?q=${search("is:open is:pr assignee:@me")}`,
      keywords: ["my", "assigned", "prs"],
    }),
    createGithubLinkCommand({
      id: "github-my-issues",
      name: "My open issues",
      description: "Issues you opened across GitHub",
      url: "https://github.com/issues",
      keywords: ["my", "issues", "mine"],
    }),
    createGithubLinkCommand({
      id: "github-my-assigned-issues",
      name: "Issues assigned to me",
      description: "Open issues assigned to you",
      url: `https://github.com/issues?q=${search("is:open is:issue assignee:@me")}`,
      keywords: ["my", "assigned", "issues"],
    }),
    createGithubLinkCommand({
      id: "github-my-notifications",
      name: "My notifications",
      description: "Your GitHub notifications inbox",
      url: "https://github.com/notifications",
      icon: { type: "lucide", name: "Bell" },
      keywords: ["notifications", "inbox", "unread"],
    }),
    createGithubLinkCommand({
      id: "github-my-prs-in-repo",
      name: "My PRs in this repo",
      description: `Open pull requests you opened in ${owner}/${repo}`,
      url: `${base}/pulls?q=${search("is:open is:pr author:@me")}`,
      keywords: ["my", "prs", "repo", owner, repo],
    }),
  ]

  return createGithubSubGroup({
    id: "github-my",
    name: "My GitHub",
    description: "Your pull requests, issues, and notifications",
    icon: { type: "lucide", name: "User" },
    keywords: ["my", "mine", "me"],
    children,
  })
}
