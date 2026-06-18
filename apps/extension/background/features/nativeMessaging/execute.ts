// Architecture: background feature layer (Native Messaging bridge, v2). Runs a
// command on the active tab on behalf of a paired external app, then optionally
// raises the browser and/or returns a value. An ADAPTER over the existing
// command machinery — it resolves + preflights, then funnels through the same
// executeResolvedCommand every other caller uses (with delivery "return" so
// data commands hand their value back instead of writing the browser
// clipboard). All the safety lives in the preflight: the runCommand policy
// (bridge mode), per-command `external`, permissions, platform, incognito, and
// generated-action rejection. See docs/native-messaging/execution.md.
import type { BridgeErrorCode } from "../../../shared/types"
import { checkRunCommandPolicy } from "../../automations/runCommandPolicy"
import { executeResolvedCommand } from "../../commands/execution"
import { parseGeneratedCommandAction } from "../../commands/generatedActions"
import { getPlatform, supportsPlatform } from "../../commands/platform"
import { resolveCommandById } from "../../commands/query"
import { updateWindow } from "../../utils/browser"
import { checkPermissions } from "../../utils/permissions"
import { resolveActiveTab } from "./suggestions"

export type ExecuteResult = {
  ran: true
  focused?: boolean
  value?: string
  contentType?: string
}

type ExecuteError = { error: BridgeErrorCode }

export const executeForActiveTab = async (params: {
  id: string
}): Promise<ExecuteResult | ExecuteError> => {
  const { id } = params

  // Generated-action ids (favorite/hide/keybinding/modifier rows) are a UI
  // concern, never a bridge target.
  if (parseGeneratedCommandAction(id)) {
    return { error: "forbidden" }
  }

  const active = await resolveActiveTab()
  if (!active) {
    return { error: "no_active_tab" }
  }
  const { tab, context } = active

  const resolved = await resolveCommandById(id, context)
  if (!resolved) {
    return { error: "not_found" }
  }
  const { command } = resolved

  // Must be executable. A `search` node without an execute is a navigational
  // container, not a target.
  const executable =
    command.type === "action" ||
    command.type === "submit" ||
    (command.type === "search" && typeof command.execute === "function")
  if (!executable) {
    return { error: "forbidden" }
  }

  // Submit commands need form values the wire does not carry in v2; deny unless
  // a command explicitly opts in.
  if (command.type === "submit" && command.external?.allowed !== true) {
    return { error: "forbidden" }
  }

  const confirmAction =
    (command.type === "action" || command.type === "submit") &&
    command.confirmAction === true

  const verdict = checkRunCommandPolicy({
    commandId: id,
    executionMode: "bridge",
    target: {
      exists: true,
      confirmAction,
      externalAllowed: command.external?.allowed,
    },
  })
  if (!verdict.allowed) {
    return { error: "forbidden" }
  }

  if (!supportsPlatform(command, getPlatform())) {
    return { error: "forbidden" }
  }

  // Permission check up front so a denial is a clean error, not a toast on a
  // tab the user is not looking at.
  if (resolved.permissions.length > 0) {
    const { hasAllPermissions } = await checkPermissions(resolved.permissions)
    if (!hasAllPermissions) {
      return { error: "forbidden" }
    }
  }

  let result: Awaited<ReturnType<typeof executeResolvedCommand>>
  try {
    result = await executeResolvedCommand(resolved, context, {}, undefined, {
      delivery: "return",
    })
  } catch (error) {
    console.error("[native-messaging] command execution failed:", error)
    return { error: "execution_failed" }
  }

  const response: ExecuteResult = { ran: true }

  if (command.external?.focusBrowser && typeof tab.windowId === "number") {
    try {
      await updateWindow(tab.windowId, { focused: true })
      response.focused = true
    } catch {
      // Best-effort: the command already ran; focus is a nicety.
    }
  }

  if (command.external?.result === "value" && result?.value) {
    response.value = result.value
    if (result.contentType) {
      response.contentType = result.contentType
    }
  }

  return response
}
