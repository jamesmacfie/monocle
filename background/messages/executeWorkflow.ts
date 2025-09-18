import { sendMessageToActiveTab } from "../utils/runtime"

export const executeWorkflow = async (message: any) => {
  try {
    // Forward the workflow to the content script for execution
    const result = await sendMessageToActiveTab({
      type: "execute-workflow-content",
      workflow: message.workflow,
      context: message.context,
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
