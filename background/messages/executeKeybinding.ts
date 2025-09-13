import type { Browser, ExecuteKeybindingMessage } from "../../shared/types"
import { executeCommand as executeCommandById } from "../commands"
import {
  getCommandIdForKeybinding,
  hasKeybindingStartingWith,
  normalizeKeybinding,
} from "../keybindings/registry"
import { createMessageHandler } from "../utils/messages"

// Sequence matching state (global per background script)
let currentSequence: string[] = []
let sequenceTimer: ReturnType<typeof setTimeout> | null = null
let pendingSingle: { commandId: string; context: Browser.Context } | null = null

const CHORD_TIMEOUT_MS = 800

function resetSequence() {
  currentSequence = []
  if (sequenceTimer) {
    clearTimeout(sequenceTimer)
    sequenceTimer = null
  }
  pendingSingle = null
}

const handleExecuteKeybinding = async (message: ExecuteKeybindingMessage) => {
  // Normalize incoming single-stroke keybinding (e.g., "⌘ k" -> "cmd k")
  const stroke = normalizeKeybinding(message.keybinding)

  // Any new input cancels a previous pending timeout
  if (sequenceTimer) {
    clearTimeout(sequenceTimer)
    sequenceTimer = null
  }

  // Append stroke to the current sequence
  currentSequence.push(stroke)
  const prefix = currentSequence.join(", ")

  const exactId = getCommandIdForKeybinding(prefix)
  const hasLonger = hasKeybindingStartingWith(prefix)

  // Helper to execute a command safely
  const executeNow = async (id: string) => {
    try {
      await executeCommandById(id, message.context, {})
      resetSequence()
      return { success: true, executed: true }
    } catch (error) {
      console.error(`[ExecuteKeybinding] Failed to execute ${id}:`, error)
      resetSequence()
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  // Case 1: Exact match and no longer sequence — execute immediately
  if (exactId && !hasLonger) {
    return await executeNow(exactId)
  }

  // Case 2: Exact match but also a longer sequence exists — delay execution
  if (exactId && hasLonger) {
    pendingSingle = { commandId: exactId, context: message.context }

    sequenceTimer = setTimeout(async () => {
      if (pendingSingle) {
        try {
          await executeCommandById(
            pendingSingle.commandId,
            pendingSingle.context,
            {},
          )
        } catch (error) {
          console.error(
            `[ExecuteKeybinding] Delayed execute failed for ${pendingSingle.commandId}:`,
            error,
          )
        } finally {
          resetSequence()
        }
      }
    }, CHORD_TIMEOUT_MS)

    // Mark as handled to let content preventDefault, but not executed yet
    return { success: true, executed: false, pending: true }
  }

  // Case 3: No exact match but we have longer sequences that start with the prefix — wait for next stroke
  if (!exactId && hasLonger) {
    // Schedule cleanup to avoid getting stuck if user stops typing
    sequenceTimer = setTimeout(() => {
      resetSequence()
    }, CHORD_TIMEOUT_MS)

    return { success: true, executed: false, pending: true }
  }

  // Case 4: No match at all — try treating the latest stroke as a new prefix
  // Reset to just the latest stroke and re-evaluate
  currentSequence = [stroke]
  const singlePrefix = currentSequence.join(", ")
  const singleExact = getCommandIdForKeybinding(singlePrefix)
  const singleHasLonger = hasKeybindingStartingWith(singlePrefix)

  if (singleExact && !singleHasLonger) {
    return await executeNow(singleExact)
  }

  if (singleExact && singleHasLonger) {
    pendingSingle = { commandId: singleExact, context: message.context }
    sequenceTimer = setTimeout(async () => {
      if (pendingSingle) {
        try {
          await executeCommandById(
            pendingSingle.commandId,
            pendingSingle.context,
            {},
          )
        } catch (error) {
          console.error(
            `[ExecuteKeybinding] Delayed execute failed for ${pendingSingle.commandId}:`,
            error,
          )
        } finally {
          resetSequence()
        }
      }
    }, CHORD_TIMEOUT_MS)

    return { success: true, executed: false, pending: true }
  }

  if (!singleExact && singleHasLonger) {
    sequenceTimer = setTimeout(() => {
      resetSequence()
    }, CHORD_TIMEOUT_MS)
    return { success: true, executed: false, pending: true }
  }

  // No matches at all — clear state and report unhandled so page can receive the key
  resetSequence()
  return {
    success: false,
    error: `No command registered for keybinding: ${message.keybinding}`,
  }
}

export const executeKeybinding = createMessageHandler(
  handleExecuteKeybinding,
  "Failed to execute keybinding",
)
