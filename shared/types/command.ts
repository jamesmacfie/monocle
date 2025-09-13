import type { Suggestion } from "../../types/"

// Re-export main types for convenience
export type { Suggestion } from "../../types/"

// Command navigation types
export type Page = {
  id: string
  commands: {
    favorites: Suggestion[]
    recents: Suggestion[]
    suggestions: Suggestion[]
  }
  searchValue: string
  parent?: Suggestion
  parentPath: string[] // Track the path of parent command IDs
}

// UI overlay removed in node-based migration

// Command data structure
export type CommandData = {
  favorites: Suggestion[]
  recents: Suggestion[]
  suggestions: Suggestion[]
  deepSearchItems: Suggestion[]
}

// Component prop interfaces have been moved to their respective component files
