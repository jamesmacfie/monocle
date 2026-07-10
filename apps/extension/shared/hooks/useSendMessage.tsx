import * as React from "react"
import type {
  AddSnippetMessage,
  Browser,
  CheckKeybindingConflictMessage,
  DeleteSnippetMessage,
  EnsureHostPermissionMessage,
  ExecuteCommandMessage,
  ExecuteKeybindingMessage,
  GetChildrenMessage,
  GetCommandsMessage,
  GetKeybindingStateMessage,
  GetPermissionsMessage,
  GetSettingsCatalogMessage,
  GetSnippetsMessage,
  GetUnsplashBackgroundMessage,
  OpenPermissionGrantPageMessage,
  RequestPermissionMessage,
  SearchCommandsMessage,
  SetCommandFavoriteMessage,
  ShowToastMessage,
  UpdateCommandSettingMessage,
  UpdateSnippetMessage,
} from "../../shared/types"
import { sendRuntimeMessage } from "../utils/extension-api"
import { useMessageContext } from "./MessageContext"
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
type GetKeybindingStateMessageWithoutContext = Omit<
  GetKeybindingStateMessage,
  "context"
>
type SearchCommandsMessageWithoutContext = Omit<
  SearchCommandsMessage,
  "context"
>
type GetUnsplashBackgroundMessageWithoutContext = Omit<
  GetUnsplashBackgroundMessage,
  "context"
>

type SendableMessage =
  | ExecuteCommandMessageWithoutContext
  | GetCommandsMessageWithoutContext
  | SearchCommandsMessageWithoutContext
  | GetChildrenMessageWithoutContext
  | ExecuteKeybindingMessageWithoutContext
  | GetKeybindingStateMessageWithoutContext
  | UpdateCommandSettingMessage
  | GetSettingsCatalogMessage
  | SetCommandFavoriteMessage
  | GetSnippetsMessage
  | AddSnippetMessage
  | UpdateSnippetMessage
  | DeleteSnippetMessage
  | CheckKeybindingConflictMessage
  | GetPermissionsMessage
  | RequestPermissionMessage
  | OpenPermissionGrantPageMessage
  | EnsureHostPermissionMessage
  | ShowToastMessage
  | GetUnsplashBackgroundMessageWithoutContext

export function useSendMessage() {
  const { modifier } = useIsModifierKeyPressed()
  const ambientContext = useMessageContext()
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
      const context = { ...baseContext, ...ambientContext, ...contextOverride }

      // Add context to messages that require it (not GetPermissionsMessage or RequestPermissionMessage)
      const messageWithContext =
        message.type === "monocle-permissions-get" ||
        message.type === "monocle-permission-request" ||
        message.type === "monocle-permission-grant-page-open" ||
        message.type === "monocle-host-permission-ensure"
          ? message
          : { ...message, context }

      return sendRuntimeMessage(messageWithContext)
    },
    [ambientContext],
  )
}
