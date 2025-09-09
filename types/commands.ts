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

// Base command with all common properties
export interface BaseCommand {
  id: string
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor | string>
  keywords?: AsyncValue<string[]>
  keybinding?: string
  supportedBrowsers?: Browser.Platform[]
  doNotAddToRecents?: boolean
  priority?: (context: Browser.Context) => Promise<Command[]>
  actions?: Command[]
  allowCustomKeybinding?: boolean
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
    confirmAction?: boolean
  }

export type ParentCommand = BaseCommand & {
  commands: (context: Browser.Context) => Promise<Command[]>
  enableDeepSearch?: boolean
}

export type UICommand = BaseCommand &
  ActionLabel & {
    ui: FormField[]
    run: (
      context?: Browser.Context,
      values?: Record<string, string>,
    ) => void | Promise<void>
  }

export type Command = RunCommand | ParentCommand | UICommand

// New structure (for gradual migration)
export interface CommandDefinition {
  id: string
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor | string>
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
