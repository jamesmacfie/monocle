// Architecture: background layer. Workflow forwarding: resolves which tab a
// workflow runs on (explicit tabId > sender tab > context-URL match > active
// tab) and round-trips the `execute-workflow-content` tab message to the
// content executor (content/workflow/). Used by the execute-workflow message
// handler, the user-script engine (per content segment and condition probe),
// and direct background callers like the debug tool.
import type { Browser } from "../../shared/types"
import type { Workflow, WorkflowResult } from "../../shared/types/workflow"
import { getActiveTab, queryTabs, sendTabMessage } from "../utils/browser"
import { resolveSenderTabId } from "../utils/messages"

type TabLike = {
  id?: number
  url?: string
  active?: boolean
  currentWindow?: boolean
}

type WorkflowTargetDeps = {
  queryTabs?: (queryInfo: object) => Promise<TabLike[]>
  getActiveTab?: () => Promise<TabLike | null>
  sendTabMessage?: (tabId: number, message: unknown) => Promise<unknown>
}

export type WorkflowTargetInput = {
  tabId?: number
  sender?: any
  context?: Browser.Context
  deps?: WorkflowTargetDeps
}

export type WorkflowExecutionInput = WorkflowTargetInput & {
  workflow: Workflow
}

export type WorkflowExecutionResult = {
  tabId: number
  result: WorkflowResult
}

const isUsableTabId = (tabId: unknown): tabId is number => {
  return Number.isInteger(tabId) && Number(tabId) > 0
}

const getSenderTabId = (sender?: any): number | undefined => {
  const tabId = resolveSenderTabId(sender)
  return isUsableTabId(tabId) ? tabId : undefined
}

const urlsMatch = (left?: string, right?: string): boolean => {
  if (!left || !right) {
    return false
  }

  try {
    return new URL(left).href === new URL(right).href
  } catch (_error) {
    return left === right
  }
}

const findTabForContext = async (
  context: Browser.Context,
  queryTabsImpl: (queryInfo: object) => Promise<TabLike[]>,
): Promise<TabLike | null> => {
  if (!context.url || context.isNewTab) {
    return null
  }

  const tabs = await queryTabsImpl({})
  return (
    tabs.find(
      (tab) => isUsableTabId(tab.id) && urlsMatch(tab.url, context.url),
    ) ?? null
  )
}

const isWorkflowResult = (result: unknown): result is WorkflowResult => {
  return (
    typeof result === "object" &&
    result !== null &&
    typeof (result as WorkflowResult).success === "boolean"
  )
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

export const unwrapWorkflowResult = (response: unknown): WorkflowResult => {
  const result =
    isObjectRecord(response) && "result" in response
      ? response.result
      : response

  if (isWorkflowResult(result)) {
    return result
  }

  return {
    success: false,
    error: "Workflow execution returned an invalid result",
  }
}

export const resolveWorkflowTargetTabId = async ({
  tabId,
  sender,
  context,
  deps,
}: WorkflowTargetInput): Promise<number> => {
  if (tabId !== undefined) {
    if (!isUsableTabId(tabId)) {
      throw new Error("Invalid workflow target tab id")
    }
    return tabId
  }

  const senderTabId = getSenderTabId(sender)
  if (senderTabId !== undefined) {
    return senderTabId
  }

  const queryTabsImpl = deps?.queryTabs ?? queryTabs
  if (context?.url) {
    if (context.isNewTab) {
      throw new Error("Cannot execute page workflow from new-tab context")
    }

    const tab = await findTabForContext(context, queryTabsImpl)
    if (!tab?.id) {
      throw new Error(`No tab found for workflow context URL: ${context.url}`)
    }
    return tab.id
  }

  const getActiveTabImpl = deps?.getActiveTab ?? getActiveTab
  const activeTab = await getActiveTabImpl()
  if (activeTab?.id) {
    return activeTab.id
  }

  throw new Error("No workflow target tab found")
}

export const executeWorkflowOnTargetTab = async ({
  workflow,
  context,
  tabId,
  sender,
  deps,
}: WorkflowExecutionInput): Promise<WorkflowExecutionResult> => {
  const targetTabId = await resolveWorkflowTargetTabId({
    tabId,
    sender,
    context,
    deps,
  })
  const sendTabMessageImpl =
    deps?.sendTabMessage ??
    ((targetTabId: number, message: unknown) =>
      sendTabMessage(targetTabId, message as any))

  const response = await sendTabMessageImpl(targetTabId, {
    type: "execute-workflow-content",
    workflow,
    context,
  })

  return {
    tabId: targetTabId,
    result: unwrapWorkflowResult(response),
  }
}
