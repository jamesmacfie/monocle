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

// Component prop interfaces have been moved to their respective component files
