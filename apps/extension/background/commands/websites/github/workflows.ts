import type { ActionCommandNode, Browser } from "../../../../shared/types"
import type { Workflow } from "../../../../shared/types/workflow"
import {
  sendErrorToastToActiveTab,
  sendTabMessage,
} from "../../../utils/browser"
import {
  executeWorkflowOnTargetTab,
  resolveWorkflowTargetTabId,
} from "../../../workflows/execution"
import type { GithubPageDetails } from "./parse"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const sendWorkflowToast = async (
  tabId: number,
  level: "success" | "error",
  message: string,
): Promise<void> => {
  await sendTabMessage(tabId, {
    type: "monocle-toast",
    level,
    message,
  } as any).catch(() => undefined)
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
  failureMessage = "Failed to run GitHub page automation",
) => {
  let tabId: number | undefined

  try {
    tabId = await resolveWorkflowTargetTabId({ context })
    await sendTabMessage(tabId, { type: "toggle-ui" } as any).catch(
      () => undefined,
    )
    await delay(200)

    const { result } = await executeWorkflowOnTargetTab({
      tabId,
      workflow,
      context,
    })

    if (!result?.success) {
      throw new Error(result?.error || "Workflow execution failed")
    }

    if (successMessage) {
      await sendWorkflowToast(tabId, "success", successMessage)
    }
  } catch (error) {
    console.error("[GitHub Commands] Workflow execution failed", error)
    const detail = error instanceof Error ? error.message : "Unknown error"
    const message = `${failureMessage}: ${detail}`

    if (tabId) {
      await sendWorkflowToast(tabId, "error", message)
      return
    }

    await sendErrorToastToActiveTab(message)
  }
}

export const createToggleStarCommand = ({
  owner,
  repo,
}: GithubPageDetails): ActionCommandNode => {
  const repoSlug = `${owner}/${repo}`

  return {
    type: "action",
    id: "github-toggle-star",
    name: "Toggle Star",
    description:
      "Best-effort page automation for clicking the current repository star button",
    icon: { type: "lucide", name: "Star" },
    color: "yellow",
    keywords: ["github", "star", owner, repo],
    actionLabel: "Toggle",
    execute: async (context) => {
      await executeGithubWorkflow(
        toggleStarWorkflow,
        context,
        `Ran star toggle for ${repoSlug}`,
        "Could not click the GitHub star button on this page",
      )
    },
  }
}
