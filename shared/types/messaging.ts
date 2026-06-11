// Background/content script communication types
import type { Browser } from "./browser"
import type { CommandUrlRulesSetting } from "./settings"
import type { SettingsCatalogResponse } from "./settingsCatalog"
import type { SiteSdkRegistration } from "./siteSdk"
import type { Suggestion } from "./ui"
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

export type GetKeybindingStateMessage = {
  type: "get-keybinding-state"
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

export type SearchCommandsMessage = {
  type: "search-commands"
  context: Browser.Context
  query: string
  // Empty/undefined = root palette; otherwise the command-page parent path
  parentPath?: string[]
  // Maximum results to return (default 40)
  limit?: number
  // Monotonic sequence number echoed back for out-of-order response handling
  seq: number
}

export interface SearchCommandsResponse {
  results: Suggestion[]
  // seq and query are echoed back so the UI can drop stale responses
  seq: number
  query: string
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

type UpdateKeybindingSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: "keybinding"
  value?: string | null
  context?: Browser.Context
}

type UpdateUrlRulesSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: "urlRules"
  value: CommandUrlRulesSetting
  context?: Browser.Context
}

type UpdateHiddenSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: "hidden"
  value: boolean
  context?: Browser.Context
}

export type UpdateCommandSettingMessage =
  | UpdateKeybindingSettingMessage
  | UpdateUrlRulesSettingMessage
  | UpdateHiddenSettingMessage

export type UpdateCommandKeybindingsMessage = {
  type: "update-command-keybindings"
  updates: Array<{
    commandId: string
    keybinding?: string | null
  }>
  context?: Browser.Context
}

// Blocking conflict categories: "exact" — another command already holds the
// binding; "shadowed-by-open-palette" — the assignment involves an
// open-palette binding on a proper prefix of a sequence, which executes
// immediately on its stroke and makes the longer sequence unreachable.
export type KeybindingConflictType = "exact" | "shadowed-by-open-palette"

// Non-blocking advisory: the candidate and an existing execute-behavior
// binding overlap as sequence prefixes, so the shared prefix only resolves
// after the chord timeout.
export type KeybindingConflictWarning = {
  type: "prefix-overlap"
  direction: "candidate-extends-existing" | "existing-extends-candidate"
  command: {
    id: string
    name: string
  }
  keybinding: string
}

export type CheckKeybindingConflictResponse = {
  hasConflict: boolean
  conflictingCommand: {
    id: string
    name: string
  } | null
  // Present only when hasConflict is true.
  conflictType?: KeybindingConflictType
  // Present only when non-empty.
  warnings?: KeybindingConflictWarning[]
}

export type UpdateCommandKeybindingsConflict = {
  commandId: string
  keybinding: string
  conflictingCommand: {
    id: string
    name: string
  }
  // Present only for non-exact skips (e.g. open-palette shadowing).
  reason?: KeybindingConflictType
}

export type UpdateCommandKeybindingsResponse = {
  success: boolean
  updated: number
  conflicts: UpdateCommandKeybindingsConflict[]
}

export type GetSettingsCatalogMessage = {
  type: "get-settings-catalog"
  platform?: Browser.Platform
}

export type GetSettingsCatalogResponse = SettingsCatalogResponse

export type SetCommandFavoriteMessage = {
  type: "set-command-favorite"
  commandId: string
  favorite: boolean
}

export type CheckKeybindingConflictMessage = {
  type: "check-keybinding-conflict"
  keybinding: string
  excludeCommandId?: string
  context?: Browser.Context
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

export type OpenPermissionGrantPageMessage = {
  type: "open-permission-grant-page"
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
  tabId?: number
}

export interface ExecuteWorkflowResponse {
  result: WorkflowResult
}

export type SiteSdkSyncMessage = {
  type: "site-sdk-sync"
  context: Browser.Context
  registrations: SiteSdkRegistration[]
}

export type Message =
  | ExecuteCommandMessage
  | GetChildrenMessage
  | GetCommandsMessage
  | SearchCommandsMessage
  | ExecuteKeybindingMessage
  | GetKeybindingStateMessage
  | ShowToastMessage
  | RequestToastMessage
  | UpdateCommandSettingMessage
  | UpdateCommandKeybindingsMessage
  | GetSettingsCatalogMessage
  | SetCommandFavoriteMessage
  | CheckKeybindingConflictMessage
  | GetUnsplashBackgroundMessage
  | GetPermissionsMessage
  | RequestPermissionMessage
  | OpenPermissionGrantPageMessage
  | ExecuteWorkflowMessage
  | SiteSdkSyncMessage

// Alternative naming (for future migration)
export type BackgroundMessage = Message
