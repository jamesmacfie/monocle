// UI representations, forms, and display types
import type { Browser } from "./browser"
import type { BrowserPermission, CommandIcon } from "./commands"

export type FormField = {
  id: string
  label: string
  required?: boolean
  validation?: JSONSchema // JSON Schema from z.toJSONSchema()
} & (
  | {
      type: "text"
      placeholder?: string
      defaultValue?: string
    }
  | {
      type: "select"
      options: Array<{ value: string; label: string }>
      defaultValue?: string
      placeholder?: string
    }
  | {
      type: "checkbox" | "switch"
      defaultChecked?: boolean
    }
  | {
      type: "radio"
      options: Array<{ value: string; label: string }>
      defaultValue?: string
    }
  | {
      type: "multi"
      options: Array<{ value: string; label: string }>
      defaultValue?: string[]
    }
  | {
      type: "color"
      defaultValue?: string // Hex color like #RRGGBB
      placeholder?: string
    }
)

// JSON Schema type for validation
export interface JSONSchema {
  type?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: unknown[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  additionalProperties?: boolean
  [key: string]: unknown
}

// The Suggestion types that the UI actually uses
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

// Base properties shared by all suggestion types
interface SuggestionBase {
  id: string
  name: string | string[]
  description?: string
  color?: string
  keywords?: string[]
  icon?: CommandIcon
  keybinding?: string
  isFavorite?: boolean
  permissions?: BrowserPermission[]
}

export interface ActionSuggestion extends SuggestionBase {
  type: "action"
  actionLabel: string
  modifierActionLabel?: {
    [modifierKey in Browser.ModifierKey]?: string
  }
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  executionContext?: ActionExecutionContext
  actions?: Suggestion[]
}

export interface SubmitSuggestion extends SuggestionBase {
  type: "submit"
  actionLabel: string
  modifierActionLabel?: {
    [modifierKey in Browser.ModifierKey]?: string
  }
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  executionContext?: ActionExecutionContext
  actions?: Suggestion[]
}

export interface GroupSuggestion extends SuggestionBase {
  type: "group"
  actionLabel: string
  actions?: Suggestion[]
}

export interface SearchSuggestion extends SuggestionBase {
  type: "search"
  actionLabel: string
  actions?: Suggestion[]
}

export interface InputSuggestion extends SuggestionBase {
  type: "input"
  inputField: FormField
  actionLabel?: string
}

export interface DisplaySuggestion extends SuggestionBase {
  type: "display"
  actionLabel?: string
}

export type Suggestion =
  | ActionSuggestion
  | SubmitSuggestion
  | GroupSuggestion
  | SearchSuggestion
  | InputSuggestion
  | DisplaySuggestion

// Backward compatibility alias
export type CommandSuggestion = Suggestion

// Unsplash background image types
export interface UnsplashPhoto {
  id: string
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  user: {
    name: string
    username: string
    links: {
      html: string
    }
  }
  links: {
    html: string
  }
}

export interface UnsplashBackgroundResponse {
  imageUrl: string
  photographerName: string
  photographerUrl: string
  photoUrl: string
  error?: string
}
