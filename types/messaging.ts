// Background/content script communication types
import type { Browser } from "./browser"

export type ExecuteCommandMessage = {
  type: "execute-command"
  id: string
  context: Browser.Context
  formValues?: Record<string, string>
}

export type ExecuteKeybindingMessage = {
  type: "execute-keybinding"
  keybinding: string
  context: Browser.Context
}

export type GetChildrenMessage = {
  type: "get-children-commands"
  id: string
  context: Browser.Context
  parentPath?: string[]
}

export type GetCommandsMessage = {
  type: "get-commands"
  context: Browser.Context
}

export type Message =
  | ExecuteCommandMessage
  | GetChildrenMessage
  | GetCommandsMessage
  | ExecuteKeybindingMessage

// Alternative naming (for future migration)
export type BackgroundMessage = Message
