import * as React from "react"
import type {
  ExecuteCommandMessage,
  ExecuteKeybindingMessage,
  GetChildrenMessage,
  GetCommandsMessage,
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

export function useSendMessage() {
  const { modifier } = useIsModifierKeyPressed()
  const modifierRef = React.useRef(modifier)

  React.useEffect(() => {
    modifierRef.current = modifier
  }, [modifier])

  return React.useCallback(
    (message: SendableMessage): Promise<any> => {
      const context = {
        title: document.title,
        url: window.location.href,
        modifierKey: modifierRef.current,
      }

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
