// UI representations, forms, and display types
import type { Browser } from "./browser"
import type { BrowserPermission, CommandIcon } from "./commands"

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
export type ActionExecutionContext =
  | {
      type: "primary"
      targetCommandId: string
    }
  | {
      type: "modifier"
      targetCommandId: string
      modifierKey: Browser.ModifierKey
    }
  | {
      type: "favorite"
      targetCommandId: string
    }
  | {
      type: "setKeybinding"
      targetCommandId: string
    }
  | {
      type: "resetKeybinding"
      targetCommandId: string
    }

export type CommandSuggestion = {
  id: string
  name: string | string[]
  description?: string
  color?: string
  keywords?: string[]
  icon?: CommandIcon
  type: "group" | "action" | "input" | "display"
  inputField?: FormField // when type === 'input'
  actionLabel: string
  modifierActionLabel?: {
    [modifierKey in Browser.ModifierKey]?: string
  }
  actions?: CommandSuggestion[]
  keybinding?: string
  isFavorite?: boolean
  remainOpenOnSelect?: boolean
  confirmAction?: boolean // Add confirmAction property
  executionContext?: ActionExecutionContext // Context for action execution
  permissions?: BrowserPermission[]
}
