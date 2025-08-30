// Core command definitions and execution types
import type { Browser } from "./browser"
import type { FormField } from "./ui"

export type AsyncValue<T> = T | ((context: Browser.Context) => Promise<T>)

// Keep the old Icon type for now to minimize changes
export type Icon = {
  name?: string // Will reference icon library
  url?: string
}

export type CommandIcon =
  | { type: "lucide"; name: string }
  | { type: "url"; url: string }

// Keep simple color for now
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

// Base command with all common properties
export interface BaseCommand {
  id: string
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<Icon> // Use old Icon type for now
  color?: AsyncValue<ColorName | string> // Use simple color for now
  keywords?: AsyncValue<string[]>
  keybinding?: string
  supportedBrowsers?: Browser.Platform[]
  doNotAddToRecents?: boolean
  priority?: (context: Browser.Context) => Promise<Command[]>
  actions?: Command[]
}

// Action labels
export type ActionLabel = {
  actionLabel?: AsyncValue<string>
  modifierActionLabel?: {
    [K in Browser.ModifierKey]?: AsyncValue<string>
  }
}

// Command types with proper structure
export type RunCommand = BaseCommand &
  ActionLabel & {
    run: (
      context?: Browser.Context,
      values?: Record<string, string>,
    ) => void | Promise<void>
  }

export type ParentCommand = BaseCommand & {
  commands: (context: Browser.Context) => Promise<Command[]>
}

export type UICommand = BaseCommand &
  ActionLabel & {
    ui: CommandUI[]
    run: (
      context?: Browser.Context,
      values?: Record<string, string>,
    ) => void | Promise<void>
  }

// For backward compatibility with UI forms
export type CommandUIInput = {
  id: string
  type: "input"
  label?: string
  placeholder?: string
  defaultValue?: string
}

export type CommandUIText = {
  id: string
  type: "text"
  label?: string
}

export type CommandUI = CommandUIInput | CommandUIText
export type CommandSuggestionUI = CommandUI

export type Command = RunCommand | ParentCommand | UICommand

// New structure (for gradual migration)
export interface CommandDefinition {
  id: string
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor>
  keywords?: AsyncValue<string[]>
  keybinding?: string
  supportedPlatforms?: Browser.Platform[]
  doNotTrack?: boolean

  actions?: {
    label?: AsyncValue<string>
    modifiers?: {
      [K in Browser.ModifierKey]?: AsyncValue<string>
    }
  }
}

type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | Promise<void>

export interface ExecutableCommand extends CommandDefinition {
  execute: CommandExecutor
}

export interface FormCommand extends CommandDefinition {
  form: FormField[]
  execute: CommandExecutor
}
