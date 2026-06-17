// Architecture: shared/ type layer. Background/content/options message
// contract — every UI -> background request and response shape. The runtime
// validation twins of these types live in shared/types/validation.ts; the
// router is background/messages/index.ts. docs/messaging.md is the full
// catalog.

import type {
  Automation,
  AutomationPageTriggerSpec,
  AutomationRunResult,
} from "./automations"
import type { AutomationDraft } from "./automationValidation"
import type { Browser } from "./browser"
import type { KeybindingRequirementViolation } from "./commands"
import type { PickedElement } from "./picker"
import type { CommandUrlRulesSetting } from "./settings"
import type { SettingsCatalogResponse } from "./settingsCatalog"
import type { SiteSdkRegistration } from "./siteSdk"
import type { Snippet } from "./snippets"
import type { Suggestion } from "./ui"
import type { Workflow, WorkflowResult } from "./workflow"

export type CommandExecutionScope = {
  pageId: string
  parentPath?: string[]
  searchValue?: string
}

export type CommandRef = { id: string; name: string }

export type ExecuteCommandMessage = {
  type: "monocle-command-execute"
  id: string
  context: Browser.Context
  formValues?: Record<string, string | string[]>
  parentNames?: string[] // Optional parent context for nested commands
  executionScope?: CommandExecutionScope
}

export type ExecuteKeybindingMessage = {
  type: "monocle-keybinding-execute"
  keybinding: string
  context: Browser.Context
}

export type GetKeybindingStateMessage = {
  type: "monocle-keybinding-state-get"
  context: Browser.Context
}

export type GetChildrenMessage = {
  type: "monocle-command-children-get"
  id: string
  context: Browser.Context
  parentPath?: string[]
  // Optional page-level search value used to compute dynamic children
  searchValue?: string
}

export type GetCommandsMessage = {
  type: "monocle-commands-get"
  context: Browser.Context
}

export type SearchCommandsMessage = {
  type: "monocle-commands-search"
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

// A UI (or a background command) asks the background to surface a toast. The
// handler rate-limits, then renders it on the active tab via the distinct
// background -> tab `monocle-toast` event. See docs/messaging.md.
export type ShowToastMessage = {
  type: "monocle-toast-show"
  level: "info" | "warning" | "success" | "error"
  message: string
}

type UpdateKeybindingSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "keybinding"
  value?: string | null
  context?: Browser.Context
}

type UpdateUrlRulesSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "urlRules"
  value: CommandUrlRulesSetting
  context?: Browser.Context
}

type UpdateHiddenSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "hidden"
  value: boolean
  context?: Browser.Context
}

export type UpdateCommandSettingMessage =
  | UpdateKeybindingSettingMessage
  | UpdateUrlRulesSettingMessage
  | UpdateHiddenSettingMessage

export type UpdateCommandKeybindingsMessage = {
  type: "monocle-command-keybindings-update"
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
  command: CommandRef
  keybinding: string
}

export type CheckKeybindingConflictResponse = {
  hasConflict: boolean
  conflictingCommand: CommandRef | null
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
  conflictingCommand?: CommandRef
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
  type: "monocle-settings-catalog-get"
  platform?: Browser.Platform
}

export type GetSettingsCatalogResponse = SettingsCatalogResponse

export type SetCommandFavoriteMessage = {
  type: "monocle-command-favorite-set"
  id: string
  favorite: boolean
}

export type GetSnippetsMessage = {
  type: "monocle-snippets-get"
  context?: Browser.Context
}

export type GetSnippetsResponse = {
  snippets: Snippet[]
}

export type AddSnippetMessage = {
  type: "monocle-snippet-add"
  name: string
  body: string
  context?: Browser.Context
}

export type AddSnippetResponse = {
  snippet: Snippet
}

export type UpdateSnippetMessage = {
  type: "monocle-snippet-update"
  id: string
  name?: string
  body?: string
  context?: Browser.Context
}

export type UpdateSnippetResponse = {
  snippet: Snippet | null
}

export type DeleteSnippetMessage = {
  type: "monocle-snippet-delete"
  id: string
  context?: Browser.Context
}

export type DeleteSnippetResponse = {
  deleted: boolean
}

export type CheckKeybindingConflictMessage = {
  type: "monocle-keybinding-conflict-check"
  keybinding: string
  excludeCommandId?: string
  context?: Browser.Context
}

export type GetUnsplashBackgroundMessage = {
  type: "monocle-unsplash-background-get"
  context: Browser.Context
}

export type GetPermissionsMessage = {
  type: "monocle-permissions-get"
}

export type RequestPermissionMessage = {
  type: "monocle-permission-request"
  permission: string
}

export type OpenPermissionGrantPageMessage = {
  type: "monocle-permission-grant-page-open"
  permission: string
}

export type EnsureHostPermissionMessage = {
  type: "monocle-host-permission-ensure"
  tabId?: number
  url?: string
  reason: "automation" | "elementHider"
}

export interface RequestPermissionResponse {
  granted: boolean
  error?: string
}

export interface EnsureHostPermissionResponse {
  granted: boolean
  originPattern?: string
  error?: string
}

export type ExecuteWorkflowMessage = {
  type: "monocle-workflow-execute"
  workflow: Workflow
  context: Browser.Context
  tabId?: number
}

export interface ExecuteWorkflowResponse {
  result: WorkflowResult
}

export type SiteSdkSyncMessage = {
  type: "monocle-site-sdk-sync"
  context: Browser.Context
  registrations: SiteSdkRegistration[]
}

// Automation messages (handled in background/messages/automations.ts).

export type GetAutomationsMessage = {
  type: "monocle-automations-get"
}

export type GetAutomationsResponse = {
  automations: Automation[]
}

export type AddAutomationMessage = {
  type: "monocle-automation-add"
  automation: AutomationDraft
}

export type AddAutomationResponse = {
  automation: Automation
}

export type UpdateAutomationMessage = {
  type: "monocle-automation-update"
  id: string
  automation: AutomationDraft
}

export type UpdateAutomationResponse = {
  automation: Automation | null
}

export type DeleteAutomationMessage = {
  type: "monocle-automation-delete"
  id: string
}

export type DeleteAutomationResponse = {
  deleted: boolean
}

export type RunAutomationMessage = {
  type: "monocle-automation-run"
  id: string
  // Absent for options-page test runs; the engine targets the active tab.
  context?: Browser.Context
  paramValues?: Record<string, string>
}

export type RunAutomationResponse = {
  result: AutomationRunResult
}

// Content -> background trigger plumbing (see
// background/automations/triggerEngine.ts and content/automationTriggers.ts).

export type GetAutomationTriggersMessage = {
  type: "monocle-automation-triggers-get"
  url: string
}

export type GetAutomationTriggersResponse = {
  triggers: AutomationPageTriggerSpec[]
}

export type AutomationTriggerFiredMessage = {
  type: "monocle-automation-trigger-fired"
  automationId: string
  trigger: {
    type: "urlMatch" | "elementAppears"
    url: string
    matchedText?: string
  }
}

export type AutomationTriggerFiredResponse = {
  accepted: boolean
  reason?: string
}

// Feature-module messages (handled in background/messages/features.ts).
// Responses are typed in ./feature.ts.

export type GetFeaturesMessage = {
  type: "monocle-features-get"
}

export type UpdateFeatureConfigMessage = {
  type: "monocle-feature-config-update"
  featureId: string
  config: Record<string, unknown>
}

export type ExecuteFeatureActionMessage = {
  type: "monocle-feature-action-execute"
  featureId: string
  actionId: string
  context?: Browser.Context
  // Optional payload for record-list row actions (itemId/childId/value/…).
  payload?: Record<string, string | number | boolean>
}

// Surfaces (handled in background/messages/surfaces.ts). Response in
// ./surface.ts. The SurfaceHost queries this on mount/navigation/broadcast.

export type GetSurfacesMessage = {
  type: "monocle-surfaces-get"
  url: string
}

// A user interaction inside a surface (content/new-tab -> background). The host
// captures the gesture and reports it; the background decides what it means.
// `dismiss` is universal; non-dismiss actions route to feature owners through
// handleAction. automation/command owner-specific routing remains future work.
// See docs/surfaces.md.
export type SurfaceActionMessage = {
  type: "monocle-surface-action"
  ownerId: string
  surfaceId: string
  actionId: string
  value?: string
  // A structured selection payload — set by the `picker` surface when the user
  // clicks an element. The background routes it to the owner feature's
  // handleAction; the surface never decides what to do with it.
  selection?: PickedElement
}

export type Message =
  | ExecuteCommandMessage
  | GetChildrenMessage
  | GetCommandsMessage
  | SearchCommandsMessage
  | ExecuteKeybindingMessage
  | GetKeybindingStateMessage
  | ShowToastMessage
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
  | EnsureHostPermissionMessage
  | ExecuteWorkflowMessage
  | SiteSdkSyncMessage
  | GetAutomationsMessage
  | AddAutomationMessage
  | UpdateAutomationMessage
  | DeleteAutomationMessage
  | RunAutomationMessage
  | GetAutomationTriggersMessage
  | AutomationTriggerFiredMessage
  | GetFeaturesMessage
  | UpdateFeatureConfigMessage
  | ExecuteFeatureActionMessage
  | GetSurfacesMessage
  | SurfaceActionMessage

// Alternative naming (for future migration)
export type BackgroundMessage = Message
