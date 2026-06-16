import type {
  ActionCommandNode,
  CommandIcon,
  GroupCommandNode,
} from "../../../../shared/types"
import { createGithubLinkCommand, createGithubSubGroup } from "./common"
import { type GithubPageDetails, repoUrl } from "./parse"

type RepoTab = {
  id: string
  label: string
  description: string
  path: string
  icon?: CommandIcon
}

// Section A — repo tabs reachable from any valid repo page.
const REPO_TABS: RepoTab[] = [
  { id: "code", label: "Code", description: "Repository code tab", path: "" },
  {
    id: "issues",
    label: "Issues",
    description: "Repository issues list",
    path: "/issues",
  },
  {
    id: "pulls",
    label: "Pull Requests",
    description: "Repository pull requests list",
    path: "/pulls",
  },
  {
    id: "actions",
    label: "Actions",
    description: "Workflow runs for this repository",
    path: "/actions",
  },
  {
    id: "releases",
    label: "Releases",
    description: "Repository releases",
    path: "/releases",
  },
  {
    id: "branches",
    label: "Branches",
    description: "Repository branches",
    path: "/branches",
  },
  {
    id: "commits",
    label: "Commits",
    description: "Recent commits on the default branch",
    path: "/commits",
  },
  {
    id: "wiki",
    label: "Wiki",
    description: "Repository wiki",
    path: "/wiki",
  },
  {
    id: "discussions",
    label: "Discussions",
    description: "Repository discussions",
    path: "/discussions",
  },
  {
    id: "insights",
    label: "Insights",
    description: "Repository pulse and insights",
    path: "/pulse",
  },
  {
    id: "security",
    label: "Security",
    description: "Repository security overview",
    path: "/security",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Repository settings",
    path: "/settings",
  },
  {
    id: "find-file",
    label: "Find a file",
    description: "Open the repository file finder",
    path: "/find/HEAD",
  },
]

export const createGoToGroup = (
  details: GithubPageDetails,
): GroupCommandNode => {
  const base = repoUrl(details)

  const children = REPO_TABS.map((tab) =>
    createGithubLinkCommand({
      id: `github-goto-${tab.id}`,
      name: tab.label,
      description: tab.description,
      url: `${base}${tab.path}`,
      keywords: [tab.label.toLowerCase(), details.owner, details.repo],
    }),
  )

  return createGithubSubGroup({
    id: "github-goto",
    name: "Go to",
    description: "Jump to a repository tab",
    icon: { type: "lucide", name: "MoveRight" },
    keywords: ["navigate", "tab", details.owner, details.repo],
    children,
  })
}

type NavigationOption = {
  id: string
  label: string
  description: string
  targetUrl: string
}

const createNavigationCommand = (
  repoDetails: GithubPageDetails,
  option: NavigationOption,
): ActionCommandNode => {
  const typePrefix =
    repoDetails.type === "pull"
      ? "pr"
      : repoDetails.type === "issue"
        ? "issue"
        : "repo"

  return createGithubLinkCommand({
    id: `github-nav-${typePrefix}-${option.id}`,
    name: option.label,
    description: option.description,
    url: option.targetUrl,
    keywords: [option.label.toLowerCase(), repoDetails.owner, repoDetails.repo],
  })
}

export const createPullRequestNavigationCommands = (
  details: GithubPageDetails,
): ActionCommandNode[] => {
  if (!details.number) {
    return []
  }

  const base = `${repoUrl(details)}/pull/${details.number}`

  const options: NavigationOption[] = [
    {
      id: "conversation",
      label: "Conversation",
      description: "View the pull request conversation thread",
      targetUrl: base,
    },
    {
      id: "commits",
      label: "Commits",
      description: "View commits included in this pull request",
      targetUrl: `${base}/commits`,
    },
    {
      id: "checks",
      label: "Checks",
      description: "View status checks for this pull request",
      targetUrl: `${base}/checks`,
    },
    {
      id: "files",
      label: "Files Changed",
      description: "Review file changes in this pull request",
      targetUrl: `${base}/files`,
    },
    {
      id: "code",
      label: "Code",
      description: "Jump back to the repository code tab",
      targetUrl: repoUrl(details),
    },
  ]

  return options.map((option) => createNavigationCommand(details, option))
}

export const createIssueNavigationCommands = (
  details: GithubPageDetails,
): ActionCommandNode[] => {
  if (!details.number) {
    return []
  }

  const base = `${repoUrl(details)}/issues/${details.number}`

  const options: NavigationOption[] = [
    {
      id: "conversation",
      label: "Conversation",
      description: "View the issue conversation thread",
      targetUrl: base,
    },
    {
      id: "code",
      label: "Code",
      description: "Jump back to the repository code tab",
      targetUrl: repoUrl(details),
    },
  ]

  return options.map((option) => createNavigationCommand(details, option))
}
