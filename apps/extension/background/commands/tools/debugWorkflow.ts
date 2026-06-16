import type { ActionCommandNode } from "../../../shared/types"
import type { Workflow } from "../../../shared/types/workflow"
import { showToast } from "../../messages/showToast"
import { sendTabMessage } from "../../utils/browser"
import {
  executeWorkflowOnTargetTab,
  resolveWorkflowTargetTabId,
} from "../../workflows/execution"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const debugWorkflow: ActionCommandNode = {
  type: "action",
  id: "debug-workflow",
  name: "Debug Workflow - Click Submit Button",
  description:
    "Test workflow execution by clicking a submit button on the page",
  icon: { type: "lucide", name: "Bug" },
  actionLabel: "Run Debug Test",
  execute: async (context) => {
    let tabId: number | undefined

    try {
      tabId = await resolveWorkflowTargetTabId({ context })
      await sendTabMessage(tabId, { type: "toggle-ui" } as any).catch(
        () => undefined,
      )
      await delay(200)

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

      const { result } = await executeWorkflowOnTargetTab({
        tabId,
        workflow: testWorkflow,
        context,
      })

      if (!result.success) {
        throw new Error(result.error || "Workflow execution failed")
      }

      await sendTabMessage(tabId, {
        type: "monocle-toast",
        level: "success",
        message: "Debug workflow clicked the first Submit target",
      } as any)
    } catch (error) {
      console.error("[DebugWorkflow] Error:", error)
      const message = `Debug workflow error: ${error instanceof Error ? error.message : "Unknown error"}`

      if (tabId) {
        await sendTabMessage(tabId, {
          type: "monocle-toast",
          level: "error",
          message,
        } as any).catch(() => undefined)
        return
      }

      await showToast({
        type: "show-toast",
        level: "error",
        message,
      })
    }
  },
}
