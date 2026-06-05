import type { ActionCommandNode } from "../../../shared/types"
import type { Workflow } from "../../../shared/types/workflow"
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { showToast } from "../../messages/showToast"
import { sendMessageToActiveTab } from "../../utils/runtime"

export const debugWorkflow: ActionCommandNode = {
  type: "action",
  id: "debug-workflow",
  name: "Debug Workflow - Click Submit Button",
  description:
    "Test workflow execution by clicking a submit button on the page",
  icon: { type: "lucide", name: "Bug" },
  actionLabel: "Run Debug Test",
  execute: async (context) => {
    // Close the command palette by sending a message to the content script
    const browserAPI = getBrowserAPI()

    try {
      // First close the UI
      if (context?.url) {
        const tabs = await browserAPI.tabs.query({ url: context.url })
        if (tabs.length > 0) {
          await browserAPI.tabs.sendMessage(tabs[0].id!, { type: "toggle-ui" })
        }
      }

      // Wait a moment for UI to close
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Create a simple test workflow that clicks a submit button
      const testWorkflow: Workflow = {
        version: "1.0",
        name: "Debug Test - Click Submit Button",
        steps: [
          {
            op: "click",
            id: "click-submit",
            description: "Click the first submit button found",
            target: {
              strategy: "text",
              value: "Submit",
              exact: false,
              index: 0,
            },
            targeting: {
              scrollIntoView: true,
              ensureVisible: true,
            },
          },
        ],
      }

      // Send workflow execution message to content
      await sendMessageToActiveTab({
        type: "execute-workflow-content",
        workflow: testWorkflow,
        context,
      })
    } catch (error) {
      console.error("[DebugWorkflow] Error:", error)

      await showToast({
        type: "show-toast",
        level: "error",
        message: `Debug workflow error: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    }
  },
}
