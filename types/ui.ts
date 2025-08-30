// UI representations, forms, and display types
import type { Browser } from "./browser"
import type { CommandIcon } from "./commands"

export type FormField = {
  id: string
  label?: string
  required?: boolean
} & (
  | {
      type: "text"
      placeholder?: string
      defaultValue?: string
      validation?: { pattern?: string; minLength?: number; maxLength?: number }
    }
  | {
      type: "select"
      options: Array<{ value: string; label: string }>
      defaultValue?: string
    }
  | {
      type: "checkbox"
      defaultChecked?: boolean
    }
)

// The CommandSuggestion type that the UI actually uses
export type CommandSuggestion = {
  id: string
  name: string | string[]
  description?: string
  color?: string
  keywords?: string[]
  hasCommands: boolean
  icon?: CommandIcon
  ui?: FormField[]
  actionLabel: string
  modifierActionLabel?: {
    [modifierKey in Browser.ModifierKey]?: string
  }
  actions?: CommandSuggestion[]
  keybinding?: string
  isFavorite?: boolean
  remainOpenOnSelect?: boolean
}

// Resolved UI representation of commands
export interface CommandListItem {
  id: string
  name: string | string[]
  description?: string
  icon?: CommandIcon
  color?: string // Use simple string
  keywords?: string[]
  keybinding?: string

  // Resolved action labels
  actionLabel: string
  modifierLabels?: Record<Browser.ModifierKey, string>

  // UI state
  hasChildren: boolean
  childActions?: CommandListItem[]
  form?: FormField[]
  isFavorite?: boolean
  category: "favorites" | "recents" | "suggestions"
}
