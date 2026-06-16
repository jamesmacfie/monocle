// Architecture: shared/ global keybinding coordinator, installed by both the
// content overlay and the new-tab palette.
//
// The background owns the keybinding registry and all execution; this hook is
// the page-side dispatcher. On mount it pulls a snapshot of the currently
// handled bindings (exact strings + sequence prefixes) and keeps it fresh via
// chrome.storage.onChanged plus an optional external refresh signal. On each
// keystroke it consults that local snapshot first: only keys that could match a
// known binding (or continue an in-progress chord) are sent to the background —
// everything else stays on the page and never wakes the service worker. Multi-
// stroke chords are tracked locally (localSequenceRef) with an idle timeout so a
// stalled chord resets; the background keeps the authoritative chord state.
//
// Two forks matter: when keybinding capture is active (isCapturing) the hook
// stands down entirely so the capture UI receives raw keys, and a stale local
// snapshot silently drops bindings — hence the refresh subscription below for
// binding sources that don't write monocle-settings. See docs/keybindings.md.
import { useCallback, useEffect, useRef } from "react"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppSelector } from "../store/hooks"
import { selectIsCapturing } from "../store/slices/keybinding.slice"
import type { Browser } from "../types"
import { UI_SEQUENCE_IDLE_TIMEOUT_MS } from "../utils/keybinding-timing"
import { RobustKeyCapture } from "../utils/robust-key-capture"

type KeybindingStateResponse = {
  exactKeybindings?: string[]
  sequencePrefixes?: string[]
}

type ExecuteKeybindingResponse = {
  success?: boolean
  pending?: boolean
  openPaletteAtCommand?: {
    commandId: string
  }
}

type GlobalKeybindingOptions = {
  isNewTab?: boolean
  onOpenPaletteAtCommand?: (commandId: string) => void | Promise<void>
  // Extra refresh signal for keybinding sources that don't write
  // monocle-settings (e.g. site SDK registrations). Returns an unsubscribe.
  subscribeToRefreshSignals?: (refresh: () => void) => (() => void) | undefined
}

const SETTINGS_STORAGE_KEY = "monocle-settings"

const sequenceKey = (strokes: readonly string[]): string => strokes.join(", ")

/**
 * Pure predicate for "could this keystroke be (part of) a binding we handle?" —
 * an exact binding, a known sequence prefix, or a continuation of the chord in
 * progress. Drives both preemptive event suppression and the decision to wake
 * the background. Exported for unit tests.
 */
export const computeKeybindingMatch = (
  keyString: string,
  exactKeybindings: ReadonlySet<string>,
  sequencePrefixes: ReadonlySet<string>,
  localSequence: readonly string[],
): boolean => {
  const isKnown = (key: string) =>
    exactKeybindings.has(key) || sequencePrefixes.has(key)

  const continuedSequence =
    localSequence.length > 0
      ? sequenceKey([...localSequence, keyString])
      : keyString

  return isKnown(continuedSequence) || isKnown(keyString)
}

/**
 * Install the page-side global keybinding dispatcher. Wires a RobustKeyCapture
 * that suppresses + dispatches only keys matching the local snapshot, manages
 * the chord buffer, stands down during capture, and surfaces the
 * "open palette at command" response. See module header and docs/keybindings.md.
 */
export function useGlobalKeybindings(options: GlobalKeybindingOptions = {}) {
  const sendMessage = useSendMessage()
  const isCapturing = useAppSelector(selectIsCapturing)
  const exactKeybindingsRef = useRef<Set<string>>(new Set())
  const sequencePrefixesRef = useRef<Set<string>>(new Set())
  const localSequenceRef = useRef<string[]>([])
  const clearSequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const resetLocalSequence = useCallback(() => {
    localSequenceRef.current = []
    if (clearSequenceTimerRef.current) {
      clearTimeout(clearSequenceTimerRef.current)
      clearSequenceTimerRef.current = null
    }
  }, [])

  const getContextOverride = useCallback((): Partial<Browser.Context> => {
    return options.isNewTab ? { isNewTab: true } : {}
  }, [options.isNewTab])

  // Pull the current handled-binding snapshot (exact strings + sequence
  // prefixes) from the background into the local refs the keydown path reads.
  // Called on mount, on monocle-settings changes, on external refresh signals,
  // and after any failed/unhandled dispatch so the snapshot self-heals.
  const refreshKeybindingState = useCallback(async () => {
    try {
      const response = (await sendMessage(
        { type: "get-keybinding-state" },
        getContextOverride(),
      )) as KeybindingStateResponse

      exactKeybindingsRef.current = new Set(response.exactKeybindings ?? [])
      sequencePrefixesRef.current = new Set(response.sequencePrefixes ?? [])
    } catch (error) {
      console.error("[useGlobalKeybindings] Failed to refresh state:", error)
      exactKeybindingsRef.current = new Set()
      sequencePrefixesRef.current = new Set()
    }
  }, [getContextOverride, sendMessage])

  const isKnownHandledSequence = useCallback((keybinding: string): boolean => {
    return (
      exactKeybindingsRef.current.has(keybinding) ||
      sequencePrefixesRef.current.has(keybinding)
    )
  }, [])

  const matchesKnownBinding = useCallback(
    (keyString: string): boolean =>
      computeKeybindingMatch(
        keyString,
        exactKeybindingsRef.current,
        sequencePrefixesRef.current,
        localSequenceRef.current,
      ),
    [],
  )

  // Advance the local chord buffer after the background reports a stroke as
  // `pending` (a valid prefix awaiting more keys). Appends if the extended
  // sequence is still a known prefix, otherwise restarts the buffer at this
  // stroke, and (re)arms the idle timeout that clears a stalled chord so it
  // mirrors the background's own chord-timeout reset.
  const updateLocalSequenceForPendingStroke = useCallback(
    (keyString: string) => {
      const existingSequence = localSequenceRef.current
      const continuedSequence = [...existingSequence, keyString]

      localSequenceRef.current = isKnownHandledSequence(
        sequenceKey(continuedSequence),
      )
        ? continuedSequence
        : [keyString]

      if (clearSequenceTimerRef.current) {
        clearTimeout(clearSequenceTimerRef.current)
      }

      clearSequenceTimerRef.current = setTimeout(() => {
        localSequenceRef.current = []
        clearSequenceTimerRef.current = null
      }, UI_SEQUENCE_IDLE_TIMEOUT_MS)
    },
    [isKnownHandledSequence],
  )

  useEffect(() => {
    refreshKeybindingState()

    const storage =
      typeof chrome === "undefined" ? undefined : chrome.storage?.onChanged
    if (!storage?.addListener) {
      return
    }

    const handleStorageChanged = (
      changes: Record<string, unknown>,
      areaName: string,
    ) => {
      if (areaName === "local" && SETTINGS_STORAGE_KEY in changes) {
        refreshKeybindingState()
      }
    }

    storage.addListener(handleStorageChanged)

    return () => {
      storage.removeListener?.(handleStorageChanged)
    }
  }, [refreshKeybindingState])

  // The gate below means a stale snapshot silently drops bindings, so any
  // binding source that doesn't write monocle-settings must push a refresh
  // signal through this subscription (e.g. site SDK registrations).
  useEffect(() => {
    const unsubscribe = options.subscribeToRefreshSignals?.(() => {
      void refreshKeybindingState()
    })

    return () => {
      unsubscribe?.()
    }
  }, [options.subscribeToRefreshSignals, refreshKeybindingState])

  useEffect(() => {
    const keyCapture = new RobustKeyCapture({
      debug: false,
      shouldPreemptivelySuppress: (keyString: string): boolean => {
        if (isCapturing) {
          return false
        }

        return matchesKnownBinding(keyString)
      },
      onKeyPress: async (keyString: string): Promise<boolean> => {
        if (isCapturing) {
          return false
        }

        // Only message the background for keystrokes that can match a known
        // binding or continue the sequence in progress — everything else
        // stays on the page and never wakes the service worker.
        if (!matchesKnownBinding(keyString)) {
          if (localSequenceRef.current.length > 0) {
            // The key abandoned an in-progress sequence; the background's own
            // chord timeout clears its copy of the sequence state.
            resetLocalSequence()
          }
          return false
        }

        try {
          const response = (await sendMessage(
            {
              type: "execute-keybinding",
              keybinding: keyString,
            },
            getContextOverride(),
          )) as ExecuteKeybindingResponse

          if (response?.success) {
            if (response.openPaletteAtCommand) {
              await options.onOpenPaletteAtCommand?.(
                response.openPaletteAtCommand.commandId,
              )
            }

            if (response.pending) {
              updateLocalSequenceForPendingStroke(keyString)
            } else {
              resetLocalSequence()
            }

            return true
          }

          resetLocalSequence()
          refreshKeybindingState()
          return false
        } catch (_error) {
          resetLocalSequence()
          refreshKeybindingState()
          return false
        }
      },
    })

    keyCapture.install()

    return () => {
      keyCapture.uninstall()
      resetLocalSequence()
    }
  }, [
    getContextOverride,
    isCapturing,
    options.onOpenPaletteAtCommand,
    refreshKeybindingState,
    resetLocalSequence,
    sendMessage,
    updateLocalSequenceForPendingStroke,
    matchesKnownBinding,
  ])
}
