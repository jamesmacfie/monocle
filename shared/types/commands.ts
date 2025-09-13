// Core command definitions and execution types
import type { Browser } from "./browser"
import type { FormField } from "./ui"

export type AsyncValue<T> = T | ((context: Browser.Context) => Promise<T>)

export type CommandIcon =
  | { type: "lucide"; name: string }
  | { type: "url"; url: string }

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

export type BrowserPermission =
  | "activeTab"
  | "bookmarks"
  | "browsingData"
  | "contextualIdentities"
  | "cookies"
  | "downloads"
  | "history"
  | "sessions"
  | "storage"
  | "tabs"

// Action labels
export type ActionLabel = {
  actionLabel?: AsyncValue<string>
  modifierActionLabel?: {
    [K in Browser.ModifierKey]?: AsyncValue<string>
  }
}

// ===========
// Node-based Command Model (inline UI as commands)
// ===========

// Common base for all node-based command nodes (minimal surface)
export interface CommandNodeBase {
  id: string
  supportedBrowsers?: Browser.Platform[]
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor | string>
  keywords?: AsyncValue<string[]>
  // Keep permissions at base so groups/inputs can participate if needed
  permissions?: BrowserPermission[]
}

// Group of children; replaces UI forms composed of multiple fields
export interface GroupCommandNode extends CommandNodeBase {
  type: "group"
  children: (context: Browser.Context) => Promise<CommandNode[]>
  enableDeepSearch?: boolean
}

// Executable action; contains execution behavior and labels
export type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | Promise<void>

export interface ActionCommandNode extends CommandNodeBase, ActionLabel {
  type: "action"
  execute: CommandExecutor
  // Action-only metadata (moved off the base)
  doNotAddToRecents?: boolean
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  allowCustomKeybinding?: boolean
  keybinding?: string
}

// A single inline input rendered as a list item
// Each previous FormField becomes one of these
export interface InputCommandNode extends CommandNodeBase {
  type: "input"
  field: FormField // reuse existing FormField shape for consistency
}

// Pure display-only row (e.g., headings, help text)
export interface DisplayCommandNode extends CommandNodeBase {
  type: "display"
}

export type CommandNode =
  | GroupCommandNode
  | ActionCommandNode
  | InputCommandNode
  | DisplayCommandNode
