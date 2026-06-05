import { useEffect } from "react"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppSelector } from "../store/hooks"
import { selectIsCapturing } from "../store/slices/keybinding.slice"
import { RobustKeyCapture } from "../utils/robust-key-capture"

export function useGlobalKeybindings() {
  const sendMessage = useSendMessage()
  const isCapturing = useAppSelector(selectIsCapturing)

  useEffect(() => {
    // Track whether a multi-stroke sequence is in progress
    let _sequenceActive = false
    let clearSequenceTimer: ReturnType<typeof setTimeout> | null = null

    const resetSequenceFlag = () => {
      _sequenceActive = false
      if (clearSequenceTimer) {
        clearTimeout(clearSequenceTimer)
        clearSequenceTimer = null
      }
    }

    // Create robust key capture instance
    const keyCapture = new RobustKeyCapture({
      debug: false, // Set to true for debugging
      onKeyPress: async (
        keyString: string,
        _event: KeyboardEvent,
      ): Promise<boolean> => {
        // Disable global keybindings while capturing a custom keybinding
        if (isCapturing) {
          return false
        }

        try {
          // Try to execute (or continue) the keybinding sequence
          const response = await sendMessage({
            type: "execute-keybinding",
            keybinding: keyString,
          })

          // If background handled this stroke, return true to suppress event
          if (response?.success) {
            // Manage local sequence state based on background response
            if (response?.pending) {
              _sequenceActive = true
              if (clearSequenceTimer) clearTimeout(clearSequenceTimer)
              // Match background chord timeout (slightly longer to be safe)
              clearSequenceTimer = setTimeout(() => {
                _sequenceActive = false
                clearSequenceTimer = null
              }, 900)
            } else if (response?.executed) {
              // Command executed — clear local sequence state
              resetSequenceFlag()
            } else if (response.success === false) {
              // Unhandled — clear local sequence state so page regains control
              resetSequenceFlag()
            }

            return true // Event was handled, suppress it
          }

          return false // Event not handled, let it through
        } catch (_error) {
          // Silently ignore - this just means no command is bound to this key
          resetSequenceFlag()
          return false
        }
      },
    })

    // Install the robust capture system
    keyCapture.install()

    return () => {
      keyCapture.uninstall()
      resetSequenceFlag()
    }
  }, [sendMessage, isCapturing])
}
