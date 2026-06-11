import { useCallback, useEffect, useRef } from "react"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppSelector } from "../store/hooks"
import { selectIsCapturing } from "../store/slices/keybinding.slice"
import type { Browser } from "../types"
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
}

const SETTINGS_STORAGE_KEY = "monocle-settings"

const sequenceKey = (strokes: string[]): string => strokes.join(", ")

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
      }, 900)
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

  useEffect(() => {
    const keyCapture = new RobustKeyCapture({
      debug: false,
      shouldPreemptivelySuppress: (keyString: string): boolean => {
        if (isCapturing) {
          return false
        }

        const existingSequence = localSequenceRef.current
        const continuedSequence =
          existingSequence.length > 0
            ? sequenceKey([...existingSequence, keyString])
            : keyString

        return (
          isKnownHandledSequence(continuedSequence) ||
          isKnownHandledSequence(keyString)
        )
      },
      onKeyPress: async (keyString: string): Promise<boolean> => {
        if (isCapturing) {
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
    isKnownHandledSequence,
    options.onOpenPaletteAtCommand,
    refreshKeybindingState,
    resetLocalSequence,
    sendMessage,
    updateLocalSequenceForPendingStroke,
  ])
}
