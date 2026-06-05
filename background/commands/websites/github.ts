import type {
  ActionCommandNode,
  Browser,
  CommandNode,
  GroupCommandNode,
} from "../../../shared/types"
import type { Workflow } from "../../../shared/types/workflow"
import {
  focusOrGoToUrl,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import { sendMessageToActiveTab } from "../../utils/runtime"

const GITHUB_DOMAIN_ALLOW_LIST = ["*://github.com/*", "*://*.github.com/*"]

const RESERVED_TOP_LEVEL_SLUGS = new Set<string>([
  "about",
  "account",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "security",
  "settings",
  "site",
  "sponsors",
  "topics",
])

type GithubPageDetails = {
  owner: string
  repo: string
  type: "repo" | "pull" | "issue"
  number?: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const parseGithubPage = (url?: string): GithubPageDetails | null => {
  if (!url) {
    return null
  }

  try {
    const { pathname } = new URL(url)
    const segments = pathname.split("/").filter(Boolean)

    if (segments.length < 2) {
      return null
    }

    const [owner, repo, resource, identifier] = segments

    if (!owner || !repo) {
      return null
    }

    if (RESERVED_TOP_LEVEL_SLUGS.has(owner.toLowerCase())) {
      return null
    }

    // Pull requests (e.g., /owner/repo/pull/123/...)
    if (resource === "pull" && identifier && /^\d+$/.test(identifier)) {
      return {
        owner,
        repo,
        type: "pull",
        number: identifier,
      }
    }

    // Issues (e.g., /owner/repo/issues/123)
    if (resource === "issues" && identifier && /^\d+$/.test(identifier)) {
      return {
        owner,
        repo,
        type: "issue",
        number: identifier,
      }
    }

    return {
      owner,
      repo,
      type: "repo",
    }
  } catch (error) {
    console.error("[GitHub Commands] Failed to parse GitHub URL", {
      url,
      error,
    })
    return null
  }
}

const toggleStarWorkflow: Workflow = {
  version: "1.0",
  name: "Toggle GitHub Star",
  steps: [
    {
      op: "click",
      id: "github-toggle-star",
      description: "Click the repository star button",
      target: {
        strategy: "css",
        value: ".starring-container button",
        index: 0,
      },
      targeting: {
        scrollIntoView: true,
        ensureVisible: true,
      },
    },
  ],
}

const executeGithubWorkflow = async (
  workflow: Workflow,
  context?: Browser.Context,
  successMessage?: string,
) => {
  try {
    // Close the palette to prevent the overlay from intercepting clicks
    await sendMessageToActiveTab({ type: "toggle-ui" }).catch(() => undefined)
    await delay(200)

    const response = await sendMessageToActiveTab({
      type: "execute-workflow-content",
      workflow,
      context,
    })

    const result = response?.result ?? response

    if (!result?.success) {
      throw new Error(result?.error || "Workflow execution failed")
    }

    if (successMessage) {
      await sendSuccessToastToActiveTab(successMessage)
    }
  } catch (error) {
    console.error("[GitHub Commands] Workflow execution failed", error)
    await sendErrorToastToActiveTab(
      error instanceof Error ? error.message : "Failed to run workflow",
    )
  }
}

const createToggleStarCommand = ({
  owner,
  repo,
}: GithubPageDetails): ActionCommandNode => {
  const repoSlug = `${owner}/${repo}`

  return {
    type: "action",
    id: "github-toggle-star",
    name: "Toggle Star",
    description: "Star or unstar the current repository",
    icon: { type: "lucide", name: "Star" },
    color: "yellow",
    keywords: ["github", "star", owner, repo],
    actionLabel: "Toggle",
    execute: async (context) => {
      await executeGithubWorkflow(
        toggleStarWorkflow,
        context,
        `Toggled star for ${repoSlug}`,
      )
    },
  }
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

  return {
    type: "action",
    id: `github-nav-${typePrefix}-${option.id}`,
    name: option.label,
    description: option.description,
    icon: { type: "lucide", name: "MoveRight" },
    keywords: [
      "github",
      option.label.toLowerCase(),
      repoDetails.owner,
      repoDetails.repo,
    ],
    actionLabel: "Go",
    execute: async () => {
      try {
        await focusOrGoToUrl(option.targetUrl)
        await sendSuccessToastToActiveTab(
          `Navigating to ${option.label.toLowerCase()}`,
        )
      } catch (error) {
        console.error("[GitHub Commands] Navigation failed", {
          error,
          url: option.targetUrl,
        })
        await sendErrorToastToActiveTab("Failed to navigate to GitHub page")
      }
    },
  }
}

const createPullRequestNavigationCommands = (
  details: GithubPageDetails,
): ActionCommandNode[] => {
  if (!details.number) {
    return []
  }

  const base = `https://github.com/${details.owner}/${details.repo}/pull/${details.number}`

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
      targetUrl: `https://github.com/${details.owner}/${details.repo}`,
    },
  ]

  return options.map((option) => createNavigationCommand(details, option))
}

const createIssueNavigationCommands = (
  details: GithubPageDetails,
): ActionCommandNode[] => {
  if (!details.number) {
    return []
  }

  const base = `https://github.com/${details.owner}/${details.repo}/issues/${details.number}`

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
      targetUrl: `https://github.com/${details.owner}/${details.repo}`,
    },
  ]

  return options.map((option) => createNavigationCommand(details, option))
}

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

    const commands: CommandNode[] = [createToggleStarCommand(details)]

    if (details.type === "pull") {
      commands.push(...createPullRequestNavigationCommands(details))
    }

    if (details.type === "issue") {
      commands.push(...createIssueNavigationCommands(details))
    }

    return commands
  },
}
