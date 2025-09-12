import type { RefObject } from "react"
import type { CommandSuggestion } from "../../types/"

// Re-export main types for convenience
export type { CommandSuggestion } from "../../types/"

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
  parentPath: string[] // Track the path of parent command IDs
}

// UI overlay removed in node-based migration

// Command data structure
export type CommandData = {
  favorites: CommandSuggestion[]
  recents: CommandSuggestion[]
  suggestions: CommandSuggestion[]
  deepSearchItems: CommandSuggestion[]
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
  isLoading?: boolean
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
  suggestion: CommandSuggestion
  onActionSelect?: (id: string) => void
  onClose: (force?: boolean) => void
  onRefresh?: () => void
}
