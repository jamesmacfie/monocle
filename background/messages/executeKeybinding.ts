import type { Browser, ExecuteKeybindingMessage } from "../../shared/types"
import { CHORD_TIMEOUT_MS } from "../../shared/utils/keybinding-timing"
import { executeCommand as executeCommandById } from "../commands"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import {
  getKeybindingEntryFromSnapshot,
  getKeybindingRegistrySnapshot,
  type KeybindingRegistryEntry,
  type KeybindingRegistrySnapshot,
  normalizeKeybinding,
  snapshotHasKeybindingStartingWith,
} from "../keybindings/registry"

type SequenceState = {
  currentSequence: string[]
  sequenceTimer: ReturnType<typeof setTimeout> | null
  // Monotonic guard for chord timers: bumped whenever the armed timer is
  // superseded, so a fired-but-queued timer task can detect it is stale even
  // if the state object was deleted and recreated in the meantime.
  timerEpoch: number
  pendingSingle: {
    entry: KeybindingRegistryEntry
    context: Browser.Context
  } | null
}

const sequenceStates = new Map<string, SequenceState>()
let nextTimerEpoch = 0

const createSequenceState = (): SequenceState => ({
  currentSequence: [],
  pendingSingle: null,
  sequenceTimer: null,
  timerEpoch: 0,
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

// Disarm the chord timer and drop any pending single match. Bumping the epoch
// invalidates a timer callback that has already fired but is still waiting in
// the per-scope serialization queue. Invariant: pendingSingle is non-null only
// while its timer is armed.
const clearSequenceTimer = (state: SequenceState): void => {
  if (state.sequenceTimer) {
    clearTimeout(state.sequenceTimer)
  }
  state.sequenceTimer = null
  state.pendingSingle = null
  state.timerEpoch = ++nextTimerEpoch
}

const scheduleReset = (scopeKey: string, state: SequenceState): void => {
  const epoch = ++nextTimerEpoch
  state.timerEpoch = epoch
  state.sequenceTimer = setTimeout(() => {
    // Serialize with stroke handling so the reset cannot interleave with a
    // continuation stroke that arrived as the timer fired.
    void runSerialized(scopeKey, async () => {
      const latestState = sequenceStates.get(scopeKey)
      if (!latestState || latestState.timerEpoch !== epoch) {
        return
      }
      resetSequence(scopeKey)
    })
  }, CHORD_TIMEOUT_MS)
}

const executeNow = async (
  scopeKey: string,
  entry: KeybindingRegistryEntry,
  context: Browser.Context,
  sender?: any,
) => {
  if (entry.behavior === "openPaletteAtCommand") {
    resetSequence(scopeKey)
    return {
      success: true,
      executed: false,
      openPaletteAtCommand: {
        commandId: entry.commandId,
      },
    }
  }

  try {
    const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
    await executeCommandById(
      entry.commandId,
      context,
      {},
      undefined,
      undefined,
      {
        siteSdk,
      },
    )
    resetSequence(scopeKey)
    return { success: true, executed: true }
  } catch (error) {
    console.error(
      `[ExecuteKeybinding] Failed to execute ${entry.commandId}:`,
      error,
    )
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
  entry: KeybindingRegistryEntry,
  context: Browser.Context,
  sender?: any,
): void => {
  const epoch = ++nextTimerEpoch
  state.timerEpoch = epoch
  state.pendingSingle = { entry, context }
  state.sequenceTimer = setTimeout(() => {
    // Serialize with stroke handling: without this, a continuation stroke
    // arriving as the timer fires can interleave with this execution and both
    // the pending single and the full sequence run. The epoch check makes a
    // stale fired-but-queued timer a no-op even if the continuation re-armed
    // a new timer in the meantime.
    void runSerialized(scopeKey, async () => {
      const latestState = sequenceStates.get(scopeKey)
      if (!latestState || latestState.timerEpoch !== epoch) {
        return
      }

      const pendingSingle = latestState.pendingSingle
      if (!pendingSingle) {
        resetSequence(scopeKey)
        return
      }

      try {
        if (pendingSingle.entry.behavior === "openPaletteAtCommand") {
          return
        }

        await executeCommandById(
          pendingSingle.entry.commandId,
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
          `[ExecuteKeybinding] Delayed execute failed for ${pendingSingle.entry.commandId}:`,
          error,
        )
      } finally {
        resetSequence(scopeKey)
      }
    })
  }, CHORD_TIMEOUT_MS)
}

const loadKeybindingSnapshot = async (
  context: Browser.Context,
  sender?: any,
): Promise<KeybindingRegistrySnapshot> => {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
  return await getKeybindingRegistrySnapshot(context, { siteSdk })
}

const getPrefixMatch = (
  snapshot: KeybindingRegistrySnapshot,
  prefix: string,
): {
  exactEntry: KeybindingRegistryEntry | undefined
  hasLonger: boolean
} => ({
  exactEntry: getKeybindingEntryFromSnapshot(snapshot, prefix),
  hasLonger: snapshotHasKeybindingStartingWith(snapshot, prefix),
})

const evaluatePrefix = async (
  scopeKey: string,
  state: SequenceState | null,
  prefix: string,
  snapshot: KeybindingRegistrySnapshot,
  context: Browser.Context,
  sender?: any,
) => {
  const { exactEntry, hasLonger } = getPrefixMatch(snapshot, prefix)

  if (exactEntry && exactEntry.behavior === "openPaletteAtCommand") {
    return await executeNow(scopeKey, exactEntry, context, sender)
  }

  if (exactEntry && !hasLonger) {
    return await executeNow(scopeKey, exactEntry, context, sender)
  }

  if (!state) {
    return null
  }

  if (exactEntry && hasLonger) {
    schedulePendingSingle(scopeKey, state, exactEntry, context, sender)
    return { success: true, executed: false, pending: true }
  }

  if (!exactEntry && hasLonger) {
    scheduleReset(scopeKey, state)
    return { success: true, executed: false, pending: true }
  }

  return null
}

const evaluateSequence = async (
  scopeKey: string,
  state: SequenceState,
  context: Browser.Context,
  sender?: any,
  snapshot?: KeybindingRegistrySnapshot,
) => {
  const currentSnapshot =
    snapshot ?? (await loadKeybindingSnapshot(context, sender))
  return await evaluatePrefix(
    scopeKey,
    state,
    state.currentSequence.join(", "),
    currentSnapshot,
    context,
    sender,
  )
}

const canResolveFirstStrokeWithoutSequenceState = (
  snapshot: KeybindingRegistrySnapshot,
  stroke: string,
): boolean => {
  const { exactEntry, hasLonger } = getPrefixMatch(snapshot, stroke)
  return Boolean(
    exactEntry &&
      (exactEntry.behavior === "openPaletteAtCommand" || !hasLonger),
  )
}

const handleExecuteKeybinding = async (
  scopeKey: string,
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

  const existingState = sequenceStates.get(scopeKey)

  if (!existingState || existingState.currentSequence.length === 0) {
    const snapshot = await loadKeybindingSnapshot(message.context, sender)
    const { exactEntry, hasLonger } = getPrefixMatch(snapshot, stroke)

    if (canResolveFirstStrokeWithoutSequenceState(snapshot, stroke)) {
      return await evaluatePrefix(
        scopeKey,
        null,
        stroke,
        snapshot,
        message.context,
        sender,
      )
    }

    if (!exactEntry && !hasLonger) {
      return {
        success: false,
        error: `No command registered for keybinding: ${message.keybinding}`,
      }
    }

    const state = getSequenceState(scopeKey)

    clearSequenceTimer(state)

    state.currentSequence.push(stroke)
    const firstStrokeResult = await evaluateSequence(
      scopeKey,
      state,
      message.context,
      sender,
      snapshot,
    )

    if (firstStrokeResult) {
      return firstStrokeResult
    }

    resetSequence(scopeKey)
    return {
      success: false,
      error: `No command registered for keybinding: ${message.keybinding}`,
    }
  }

  const state = getSequenceState(scopeKey)

  clearSequenceTimer(state)

  state.currentSequence.push(stroke)

  // Load once and thread through both evaluations so the continuation and
  // its single-stroke fallback always see the same registry state, even if
  // the entries cache is invalidated mid-message.
  const continuationSnapshot = await loadKeybindingSnapshot(
    message.context,
    sender,
  )

  const sequenceResult = await evaluateSequence(
    scopeKey,
    state,
    message.context,
    sender,
    continuationSnapshot,
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
    continuationSnapshot,
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

// Each keydown dispatches an independent async execute-keybinding message, and
// handleExecuteKeybinding mutates shared per-scope sequence state across an
// awaited registry rebuild. Without serialization, fast multi-stroke sequences
// interleave and corrupt that state (every overlapping stroke can read the full
// sequence and execute). Serialize per scope so stroke N fully resolves before
// N+1 is evaluated, matching the design intent that sequence state is
// authoritative in the background.
const scopeQueues = new Map<string, Promise<unknown>>()

const runSerialized = <T>(
  scopeKey: string,
  task: () => Promise<T>,
): Promise<T> => {
  const previous = scopeQueues.get(scopeKey) ?? Promise.resolve()
  const run = previous.then(task, task)
  scopeQueues.set(scopeKey, run)

  // Drop the queue entry once this is the tail and it has settled, so idle
  // scopes don't accumulate. (`run` never rejects — `task` swallows its own
  // errors — but handle both settlements defensively.)
  const cleanup = () => {
    if (scopeQueues.get(scopeKey) === run) {
      scopeQueues.delete(scopeKey)
    }
  }
  run.then(cleanup, cleanup)

  return run
}

export const executeKeybinding = async (
  message: ExecuteKeybindingMessage,
  sender?: any,
) => {
  const scopeKey = getSequenceScopeKey(message, sender)

  return runSerialized(scopeKey, async () => {
    try {
      return await handleExecuteKeybinding(scopeKey, message, sender)
    } catch (error) {
      console.error("[background] Failed to execute keybinding:", error)
      return { error: "Failed to execute keybinding" }
    }
  })
}
