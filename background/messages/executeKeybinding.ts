import type { Browser, ExecuteKeybindingMessage } from "../../shared/types"
import { executeCommand as executeCommandById } from "../commands"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import {
  getCommandIdFromSnapshot,
  getKeybindingRegistrySnapshot,
  normalizeKeybinding,
  snapshotHasKeybindingStartingWith,
} from "../keybindings/registry"

type SequenceState = {
  currentSequence: string[]
  sequenceTimer: ReturnType<typeof setTimeout> | null
  pendingSingle: { commandId: string; context: Browser.Context } | null
}

const sequenceStates = new Map<string, SequenceState>()
const CHORD_TIMEOUT_MS = 800

const createSequenceState = (): SequenceState => ({
  currentSequence: [],
  pendingSingle: null,
  sequenceTimer: null,
})

const getSequenceScopeKey = (
  message: ExecuteKeybindingMessage,
  sender?: any,
): string => {
  const tabId = sender?.tab?.id ?? sender?.validationContext?.senderTab
  const documentId = sender?.documentId
  const frameId = sender?.frameId

  if (tabId !== undefined && tabId !== null) {
    return `tab:${tabId}:document:${documentId ?? frameId ?? "top"}`
  }

  const context = message.context
  return `context:${context.isNewTab ? "newtab" : "page"}:${context.url || "unknown"}`
}

const getSequenceState = (scopeKey: string): SequenceState => {
  const existing = sequenceStates.get(scopeKey)
  if (existing) return existing

  const created = createSequenceState()
  sequenceStates.set(scopeKey, created)
  return created
}

const resetSequence = (scopeKey: string) => {
  const state = sequenceStates.get(scopeKey)
  if (!state) return

  if (state.sequenceTimer) {
    clearTimeout(state.sequenceTimer)
  }

  sequenceStates.delete(scopeKey)
}

const scheduleReset = (scopeKey: string, state: SequenceState): void => {
  state.sequenceTimer = setTimeout(() => {
    resetSequence(scopeKey)
  }, CHORD_TIMEOUT_MS)
}

const executeNow = async (
  scopeKey: string,
  id: string,
  context: Browser.Context,
  sender?: any,
) => {
  try {
    const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
    await executeCommandById(id, context, {}, undefined, undefined, {
      siteSdk,
    })
    resetSequence(scopeKey)
    return { success: true, executed: true }
  } catch (error) {
    console.error(`[ExecuteKeybinding] Failed to execute ${id}:`, error)
    resetSequence(scopeKey)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

const schedulePendingSingle = (
  scopeKey: string,
  state: SequenceState,
  commandId: string,
  context: Browser.Context,
  sender?: any,
): void => {
  state.pendingSingle = { commandId, context }
  state.sequenceTimer = setTimeout(async () => {
    const latestState = sequenceStates.get(scopeKey)
    const pendingSingle = latestState?.pendingSingle

    if (!pendingSingle) {
      resetSequence(scopeKey)
      return
    }

    try {
      await executeCommandById(
        pendingSingle.commandId,
        pendingSingle.context,
        {},
        undefined,
        undefined,
        {
          siteSdk: await prepareSiteSdkCommandLoadOptions(
            sender,
            pendingSingle.context,
          ),
        },
      )
    } catch (error) {
      console.error(
        `[ExecuteKeybinding] Delayed execute failed for ${pendingSingle.commandId}:`,
        error,
      )
    } finally {
      resetSequence(scopeKey)
    }
  }, CHORD_TIMEOUT_MS)
}

const evaluateSequence = async (
  scopeKey: string,
  state: SequenceState,
  context: Browser.Context,
  sender?: any,
) => {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
  const snapshot = await getKeybindingRegistrySnapshot(context, { siteSdk })
  const prefix = state.currentSequence.join(", ")
  const exactId = getCommandIdFromSnapshot(snapshot, prefix)
  const hasLonger = snapshotHasKeybindingStartingWith(snapshot, prefix)

  if (exactId && !hasLonger) {
    return await executeNow(scopeKey, exactId, context, sender)
  }

  if (exactId && hasLonger) {
    schedulePendingSingle(scopeKey, state, exactId, context, sender)
    return { success: true, executed: false, pending: true }
  }

  if (!exactId && hasLonger) {
    scheduleReset(scopeKey, state)
    return { success: true, executed: false, pending: true }
  }

  return null
}

const handleExecuteKeybinding = async (
  message: ExecuteKeybindingMessage,
  sender?: any,
) => {
  const stroke = normalizeKeybinding(message.keybinding)
  if (!stroke) {
    return {
      success: false,
      error: `Invalid keybinding: ${message.keybinding}`,
    }
  }

  const scopeKey = getSequenceScopeKey(message, sender)
  const state = getSequenceState(scopeKey)

  if (state.sequenceTimer) {
    clearTimeout(state.sequenceTimer)
    state.sequenceTimer = null
  }

  state.currentSequence.push(stroke)

  const sequenceResult = await evaluateSequence(
    scopeKey,
    state,
    message.context,
    sender,
  )

  if (sequenceResult) {
    return sequenceResult
  }

  state.currentSequence = [stroke]

  const singleResult = await evaluateSequence(
    scopeKey,
    state,
    message.context,
    sender,
  )

  if (singleResult) {
    return singleResult
  }

  resetSequence(scopeKey)
  return {
    success: false,
    error: `No command registered for keybinding: ${message.keybinding}`,
  }
}

export const executeKeybinding = async (
  message: ExecuteKeybindingMessage,
  sender?: any,
) => {
  try {
    return await handleExecuteKeybinding(message, sender)
  } catch (error) {
    console.error("[background] Failed to execute keybinding:", error)
    return { error: "Failed to execute keybinding" }
  }
}
