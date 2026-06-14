// Architecture: shared/ type layer. Background/content/options message
// contract — every UI -> background request and response shape. The runtime
// validation twins of these types live in shared/types/validation.ts; the
// router is background/messages/index.ts. docs/messaging.md is the full
// catalog.
import type { Browser } from "./browser"
import type { KeybindingRequirementViolation } from "./commands"
import type { CommandUrlRulesSetting } from "./settings"
import type { SettingsCatalogResponse } from "./settingsCatalog"
import type { SiteSdkRegistration } from "./siteSdk"
import type { Snippet } from "./snippets"
import type { Suggestion } from "./ui"
import type {
  UserScript,
  UserScriptPageTriggerSpec,
  UserScriptRunResult,
} from "./userScripts"
import type { UserScriptDraft } from "./userScriptValidation"
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

// Two directions, deliberately distinct types. `show-toast` is background ->
// tab: the background tells a specific UI to render a toast. `request-toast` is
// UI -> background: a UI asks the background to fan a toast out to the relevant
// surface(s). They are not interchangeable; see docs/messaging.md.
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
  // Present only when the binding violates the target command's
  // KeybindingRequirements. A violation is not a conflict (no other command
  // is involved); hasConflict stays false for pure violations.
  requirementViolation?: {
    code: KeybindingRequirementViolation
    message: string
  }
}

export type UpdateCommandKeybindingsConflict = {
  commandId: string
  keybinding: string
  // Absent for requirement violations (no other command is involved).
  conflictingCommand?: {
    id: string
    name: string
  }
  // Present only for non-exact skips (e.g. open-palette shadowing) and
  // requirement violations.
  reason?: KeybindingConflictType | "requirement-not-met"
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

export type GetSnippetsMessage = {
  type: "get-snippets"
  context?: Browser.Context
}

export type GetSnippetsResponse = {
  snippets: Snippet[]
}

export type AddSnippetMessage = {
  type: "add-snippet"
  name: string
  body: string
  context?: Browser.Context
}

export type AddSnippetResponse = {
  snippet: Snippet
}

export type UpdateSnippetMessage = {
  type: "update-snippet"
  id: string
  name?: string
  body?: string
  context?: Browser.Context
}

export type UpdateSnippetResponse = {
  snippet: Snippet | null
}

export type DeleteSnippetMessage = {
  type: "delete-snippet"
  id: string
  context?: Browser.Context
}

export type DeleteSnippetResponse = {
  deleted: boolean
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

// User script messages (handled in background/messages/userScripts.ts).

export type GetUserScriptsMessage = {
  type: "get-user-scripts"
}

export type GetUserScriptsResponse = {
  scripts: UserScript[]
}

export type AddUserScriptMessage = {
  type: "add-user-script"
  script: UserScriptDraft
}

export type AddUserScriptResponse = {
  script: UserScript
}

export type UpdateUserScriptMessage = {
  type: "update-user-script"
  id: string
  script: UserScriptDraft
}

export type UpdateUserScriptResponse = {
  script: UserScript | null
}

export type DeleteUserScriptMessage = {
  type: "delete-user-script"
  id: string
}

export type DeleteUserScriptResponse = {
  deleted: boolean
}

export type RunUserScriptMessage = {
  type: "run-user-script"
  id: string
  // Absent for options-page test runs; the engine targets the active tab.
  context?: Browser.Context
  paramValues?: Record<string, string>
}

export type RunUserScriptResponse = {
  result: UserScriptRunResult
}

// Content -> background trigger plumbing (see
// background/userScripts/triggerEngine.ts and content/userScriptTriggers.ts).

export type GetUserScriptTriggersMessage = {
  type: "get-user-script-triggers"
  url: string
}

export type GetUserScriptTriggersResponse = {
  triggers: UserScriptPageTriggerSpec[]
}

export type UserScriptTriggerFiredMessage = {
  type: "user-script-trigger-fired"
  scriptId: string
  trigger: {
    type: "urlMatch" | "elementAppears"
    url: string
    matchedText?: string
  }
}

export type UserScriptTriggerFiredResponse = {
  accepted: boolean
  reason?: string
}

// Feature-module messages (handled in background/messages/features.ts).
// Responses are typed in ./feature.ts.

export type GetFeaturesMessage = {
  type: "get-features"
}

export type UpdateFeatureConfigMessage = {
  type: "update-feature-config"
  featureId: string
  config: Record<string, unknown>
}

export type ExecuteFeatureActionMessage = {
  type: "execute-feature-action"
  featureId: string
  actionId: string
  context?: Browser.Context
}

// Surfaces (handled in background/messages/surfaces.ts). Response in
// ./surface.ts. The SurfaceHost queries this on mount/navigation/broadcast.

export type GetSurfacesMessage = {
  type: "get-surfaces"
  url: string
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
  | GetSnippetsMessage
  | AddSnippetMessage
  | UpdateSnippetMessage
  | DeleteSnippetMessage
  | CheckKeybindingConflictMessage
  | GetUnsplashBackgroundMessage
  | GetPermissionsMessage
  | RequestPermissionMessage
  | OpenPermissionGrantPageMessage
  | ExecuteWorkflowMessage
  | SiteSdkSyncMessage
  | GetUserScriptsMessage
  | AddUserScriptMessage
  | UpdateUserScriptMessage
  | DeleteUserScriptMessage
  | RunUserScriptMessage
  | GetUserScriptTriggersMessage
  | UserScriptTriggerFiredMessage
  | GetFeaturesMessage
  | UpdateFeatureConfigMessage
  | ExecuteFeatureActionMessage
  | GetSurfacesMessage

// Alternative naming (for future migration)
export type BackgroundMessage = Message
