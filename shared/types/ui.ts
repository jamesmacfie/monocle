// UI representations, forms, and display types
import type { Browser } from "./browser"
import type {
  BrowserPermission,
  CommandIcon,
  KeybindingRequirements,
} from "./commands"

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
      type: "textarea"
      placeholder?: string
      defaultValue?: string
      rows?: number
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
      type: "text-list"
      placeholder?: string
      defaultValue?: string[]
      maxItems?: number
    }
  | {
      // Numeric input. Used by feature settings schemas (options-page
      // SchemaForm); the palette form renderers fall through their default and
      // do not render this variant inline.
      type: "number"
      placeholder?: string
      defaultValue?: number
      min?: number
      max?: number
      step?: number
    }
  | {
      type: "color"
      defaultValue?: string // Hex color like #RRGGBB
      placeholder?: string
    }
  | {
      // A list of feature-owned records (e.g. saved tab groups), rendered by the
      // options-page SchemaForm only. Rows are NOT edited as a draft: they come
      // from the feature descriptor's `lists[field.id]` projection and each
      // declared action dispatches `execute-feature-action` with a payload
      // identifying the row (and child). Group rows with `children` expand to
      // reveal per-child rows (e.g. a group's tabs) carrying `childActions`.
      type: "record-list"
      itemActions: RecordListAction[]
      childActions?: RecordListAction[]
      emptyText?: string
    }
)

// One button on a record-list row (or child row). `id` is the action id sent to
// the feature's handleAction; `editLabel` makes the row enter inline-edit mode
// and dispatch with `payload.value` set to the edited text (e.g. Rename).
export type RecordListAction = {
  id: string
  label: string
  icon?: string
  style?: "default" | "primary" | "danger"
  editLabel?: boolean
}

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

// Discriminated tag the background stamps onto generated action-menu items so
// the UI can branch on intent without re-parsing id prefixes (see
// CommandPalette.handleActionSelect / CommandActionsList.ActionItem). Each
// variant names the command it operates on via `targetCommandId`.
// See docs/execution-and-actions.md.
export type ActionExecutionContext =
  // Re-run the command's primary action from the menu.
  | {
      type: "primary"
      targetCommandId: string
    }
  // Run the command as if a modifier (e.g. cmd/shift) was held — its
  // alternate action.
  | {
      type: "modifier"
      targetCommandId: string
      modifierKey: Browser.ModifierKey
    }
  // Toggle the command's favorite status; the menu refreshes the page after.
  | {
      type: "favorite"
      targetCommandId: string
    }
  // Begin keybinding capture for the command — keeps the action menu open and
  // swaps in the capture widget.
  | {
      type: "setKeybinding"
      targetCommandId: string
      // The target command's assignment constraints, so the capture UI can
      // hint them before the first stroke.
      requirements?: KeybindingRequirements
    }
  // Clear the command's custom keybinding (executes without confirmation).
  | {
      type: "resetKeybinding"
      targetCommandId: string
    }
  // Add a deny rule for the focused page's domain to this command's urlRules.
  | {
      type: "hideDomain"
      targetCommandId: string
      domain: string
    }
  // Globally hide the command (settings `hidden` flag).
  | {
      type: "hideCommand"
      targetCommandId: string
    }

export type SuggestionExecutionPayload = Record<string, string | string[]>

// Base properties shared by all suggestion types
interface SuggestionBase {
  id: string
  name: string | string[]
  description?: string
  executionPayload?: SuggestionExecutionPayload
  color?: string
  keywords?: string[]
  icon?: CommandIcon
  keybinding?: string
  isFavorite?: boolean
  permissions?: BrowserPermission[]
  rankWeight?: number
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
