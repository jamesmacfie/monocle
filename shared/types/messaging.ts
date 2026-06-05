// Background/content script communication types
import type { Browser } from "./browser"
import type { Workflow, WorkflowResult } from "./workflow"

export type CommandExecutionScope = {
  pageId: string
  parentPath?: string[]
  searchValue?: string
}

export type ExecuteCommandMessage = {
  type: "execute-command"
  id: string
  context: Browser.Context
  formValues?: Record<string, string | string[]>
  parentNames?: string[] // Optional parent context for nested commands
  executionScope?: CommandExecutionScope
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
  // Optional page-level search value used to compute dynamic children
  searchValue?: string
}

export type GetCommandsMessage = {
  type: "get-commands"
  context: Browser.Context
}

export type ShowToastMessage = {
  type: "show-toast"
  level: "info" | "warning" | "success" | "error"
  message: string
}

export type RequestToastMessage = {
  type: "request-toast"
  level: "info" | "warning" | "success" | "error"
  message: string
}

export type UpdateCommandSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: string
  value: any
}

export type CheckKeybindingConflictMessage = {
  type: "check-keybinding-conflict"
  keybinding: string
  excludeCommandId?: string
}

export type GetUnsplashBackgroundMessage = {
  type: "get-unsplash-background"
  context: Browser.Context
}

export type GetPermissionsMessage = {
  type: "get-permissions"
}

export type RequestPermissionMessage = {
  type: "request-permission"
  permission: string
}

export interface RequestPermissionResponse {
  granted: boolean
  error?: string
}

export type ExecuteWorkflowMessage = {
  type: "execute-workflow"
  workflow: Workflow
  context: Browser.Context
}

export interface ExecuteWorkflowResponse {
  result: WorkflowResult
}

export type Message =
  | ExecuteCommandMessage
  | GetChildrenMessage
  | GetCommandsMessage
  | ExecuteKeybindingMessage
  | ShowToastMessage
  | RequestToastMessage
  | UpdateCommandSettingMessage
  | CheckKeybindingConflictMessage
  | GetUnsplashBackgroundMessage
  | GetPermissionsMessage
  | RequestPermissionMessage
  | ExecuteWorkflowMessage

// Alternative naming (for future migration)
export type BackgroundMessage = Message
