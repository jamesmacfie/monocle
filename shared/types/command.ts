import type { RefObject } from "react"
import type { CommandSuggestion, CommandSuggestionUI } from "../../types"

// Re-export main types for convenience
export type { CommandSuggestion, CommandSuggestionUI } from "../../types"

// Command navigation types
export type Page = {
  id: string
  commands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
  }
  searchValue: string
  parent?: CommandSuggestion
}

export type UI = {
  id: string
  name: string
  ui: CommandSuggestionUI[]
}

// Command data structure
export type CommandData = {
  favorites: CommandSuggestion[]
  recents: CommandSuggestion[]
  suggestions: CommandSuggestion[]
}

// Common prop interfaces for command components
export interface CommandItemProps {
  suggestion: CommandSuggestion
  onSelect: (id: string) => void
  currentPage: Page
}

export interface CommandListProps {
  currentPage: Page
  onSelect: (id: string) => void
}

export interface CommandHeaderProps {
  pages: Page[]
  currentPage: Page
  inputRef: RefObject<HTMLInputElement>
  onNavigateBack: () => void
  onSearchChange: (search: string) => void
}

export interface CommandFooterProps {
  currentPage: Page
  focusedSuggestion: CommandSuggestion | undefined
  actionLabel: string
  inputRef: RefObject<HTMLInputElement>
  onActionSelect?: (id: string) => void
  onOpenActions?: (suggestion: CommandSuggestion) => void
  actionsButtonRef?: RefObject<HTMLButtonElement>
}

export interface CommandActionsProps {
  open: boolean
  selectedValue: string
  inputRef: RefObject<HTMLInputElement>
  actions?: CommandSuggestion[]
  onActionSelect?: (id: string) => void
  onClose: () => void
}
