import * as React from "react"
import type {
  Browser,
  CheckKeybindingConflictMessage,
  ExecuteCommandMessage,
  ExecuteKeybindingMessage,
  GetChildrenMessage,
  GetCommandsMessage,
  UpdateCommandSettingMessage,
} from "../../types/"
import { useIsModifierKeyPressed } from "./useIsModifierKeyPressed"

// Messages without context for easier usage
type ExecuteCommandMessageWithoutContext = Omit<
  ExecuteCommandMessage,
  "context"
>
type GetCommandsMessageWithoutContext = Omit<GetCommandsMessage, "context">
type GetChildrenMessageWithoutContext = Omit<GetChildrenMessage, "context">
type ExecuteKeybindingMessageWithoutContext = Omit<
  ExecuteKeybindingMessage,
  "context"
>

type SendableMessage =
  | ExecuteCommandMessageWithoutContext
  | GetCommandsMessageWithoutContext
  | GetChildrenMessageWithoutContext
  | ExecuteKeybindingMessageWithoutContext
  | UpdateCommandSettingMessage
  | CheckKeybindingConflictMessage

export function useSendMessage() {
  const { modifier } = useIsModifierKeyPressed()
  const modifierRef = React.useRef(modifier)

  React.useEffect(() => {
    modifierRef.current = modifier
  }, [modifier])

  return React.useCallback(
    (
      message: SendableMessage,
      contextOverride?: Partial<Browser.Context>,
    ): Promise<any> => {
      const baseContext = {
        title: document.title,
        url: window.location.href,
        modifierKey: modifierRef.current,
      }

      // Merge base context with any overrides
      const context = { ...baseContext, ...contextOverride }

      // Add context to all messages since they all require it
      const messageWithContext = { ...message, context }

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(messageWithContext, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })
    },
    [],
  )
}
