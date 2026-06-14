// Core command definitions and execution types.
//
// `CommandNode` is the background-owned, authored shape of a command; the UI
// only ever sees the derived `Suggestion` (shared/types/ui.ts). The six node
// families are: action (executable), submit (executable, collects the page's
// form values), group (dynamic container of children), search (children driven
// by live search text), input (one inline form field rendered as a row), and
// display (static non-executable row). See docs/command-schema.md and
// docs/command-types.md.
import type { Browser } from "./browser"
import type { IconName } from "./icons"
import type { FormField, Suggestion, SuggestionExecutionPayload } from "./ui"

// A field that is either a literal value or a function resolved against the
// browser context at load/suggestion time. Lets command fields (name, icon,
// labels, ...) depend on the current tab without the node itself being async.
export type AsyncValue<T> = T | ((context: Browser.Context) => Promise<T>)

export type CommandIcon =
  | { type: "lucide"; name: IconName }
  | { type: "url"; url: string }
  // Raw SVG markup. Untrusted (site SDK) input: validated by
  // `validateSvgIconMarkup` at the SDK boundary and rendered only as a static
  // <img> data URI — never injected inline. See shared/utils/svg-icon.ts.
  | { type: "svg"; svg: string }

export type ColorName =
  | "red"
  | "green"
  | "blue"
  | "amber"
  | "lightBlue"
  | "gray"
  | "purple"
  | "orange"
  | "teal"
  | "pink"
  | "indigo"
  | "yellow"

export type CommandColor = { preset: ColorName } | { custom: string }

// Single source of truth for the browser permissions Monocle commands can
// request. Both the `BrowserPermission` type (below) and the runtime
// validation of request-permission messages (background/utils/validation.ts)
// derive from this tuple, so the list is maintained in exactly one place.
export const BROWSER_PERMISSIONS = [
  "activeTab",
  "bookmarks",
  "browsingData",
  "contextualIdentities",
  "cookies",
  "downloads",
  "history",
  "sessions",
  "storage",
  "tabs",
  "tabGroups",
  "management",
] as const

export type BrowserPermission = (typeof BROWSER_PERMISSIONS)[number]

// Action labels
export type ActionLabel = {
  actionLabel?: AsyncValue<string>
  modifierActionLabel?: {
    [K in Browser.ModifierKey]?: AsyncValue<string>
  }
}

export interface UrlRules {
  allowUrls?: string[]
  denyUrls?: string[]
}

export type KeybindingBehavior = "execute" | "openPaletteAtCommand"

// Per-command constraints on which custom keybindings may be assigned.
// Extensible: add new optional rule fields here as commands need them.
export type KeybindingRequirements = {
  // Every stroke in the binding (including each stroke of a sequence) must
  // include cmd, ctrl, or alt. Shift alone does not count. Required for
  // commands whose shortcuts must fire while an editable element is focused:
  // shared/utils/event-filter.ts only forwards editable-element key events
  // that carry a non-shift modifier.
  requireNonShiftModifier?: boolean
}

// Violation codes produced when a candidate keybinding fails a command's
// KeybindingRequirements (see shared/utils/keybinding-requirements.ts).
export type KeybindingRequirementViolation = "missing-non-shift-modifier"

// Common base for all node-based command nodes (minimal surface)
export interface CommandNodeBase {
  id: string
  supportedBrowsers?: Browser.Platform[]
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  executionPayload?: AsyncValue<SuggestionExecutionPayload>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor | string>
  keywords?: AsyncValue<string[]>
  // Keep permissions at base so groups/inputs can participate if needed
  permissions?: BrowserPermission[]
  // URL rules for filtering commands based on current page
  urlRules?: UrlRules
  // Defaults to "execute". Container/form commands can opt into opening the
  // palette at their page when triggered by a keyboard shortcut.
  keybindingBehavior?: KeybindingBehavior
  keybinding?: string
  settingsCatalog?: {
    // Root commands are cataloged by default. Children are cataloged only when
    // a parent explicitly opts in so volatile browser data rows do not get
    // durable settings by accident.
    includeChildren?: boolean
    configurable?: boolean
  }
}

// Group of children; replaces UI forms composed of multiple fields
export interface GroupCommandNode extends CommandNodeBase {
  type: "group"
  children: (context: Browser.Context) => Promise<CommandNode[]>
  enableDeepSearch?: boolean
}

// The side-effecting body of an executable node, run in the background with the
// browser context and (for submits/forms) the collected form values. Never
// crosses to the UI — only the background holds these functions.
export type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | Promise<void>

export interface ActionCommandNode extends CommandNodeBase, ActionLabel {
  type: "action"
  execute: CommandExecutor
  // Action-only metadata (moved off the base)
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  allowCustomKeybinding?: boolean
  keybindingRequirements?: KeybindingRequirements
  dedupeKey?: string
}

// Search parent node with dynamic results driven by search input
export interface SearchCommandNode extends CommandNodeBase, ActionLabel {
  type: "search"
  // Execute may be used when UI executes parent (e.g., open selected URL)
  execute?: CommandExecutor
  // Resolver for dynamic results given current search text
  getResults: (
    context: Browser.Context,
    search: string,
  ) => Promise<CommandNode[]>
}

// Like an action, but the executor receives the whole page's inline-input
// values — the "OK"/"Create" button at the bottom of a form page. Use action
// for fire-and-forget commands and submit when the command consumes sibling
// input rows.
export interface SubmitCommandNode extends CommandNodeBase, ActionLabel {
  type: "submit"
  execute: CommandExecutor
  // Submit-specific metadata
  doNotAddToRecents?: boolean
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  allowCustomKeybinding?: boolean
  keybindingRequirements?: KeybindingRequirements
  dedupeKey?: string
}

// One inline form field rendered as its own palette row (not executable). Its
// value lives in the page's formValues and is consumed by a sibling submit
// node. Authored as a CommandNode so a form is just a group of input rows + a
// submit row.
export interface InputCommandNode extends CommandNodeBase {
  type: "input"
  field: FormField // reuse existing FormField shape for consistency
}

// Non-executable, non-interactive row — headings, help text, and the
// NoOp/empty/error states preferred over alerts. Selecting it does nothing.
export interface DisplayCommandNode extends CommandNodeBase {
  type: "display"
}

export type CommandNode =
  | GroupCommandNode
  | ActionCommandNode
  | SubmitCommandNode
  | InputCommandNode
  | DisplayCommandNode
  | SearchCommandNode

// Command data structure for UI state
export type CommandData = {
  favorites: Suggestion[]
  suggestions: Suggestion[]
}
