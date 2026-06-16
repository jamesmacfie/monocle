// Architecture: background message layer. Handler for the public
// `execute-workflow` message: delegates target-tab resolution and forwarding
// to background/workflows/execution.ts and never throws across the message
// boundary (errors become { result: { success: false, error } }).
import type { ExecuteWorkflowMessage } from "../../shared/types"
import { executeWorkflowOnTargetTab } from "../workflows/execution"

export const executeWorkflow = async (
  message: ExecuteWorkflowMessage,
  sender?: any,
) => {
  try {
    const { result } = await executeWorkflowOnTargetTab({
      workflow: message.workflow,
      context: message.context,
      tabId: message.tabId,
      sender,
    })

    return { result }
  } catch (error) {
    console.error("[Background] Failed to execute workflow:", error)
    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    }
  }
}
