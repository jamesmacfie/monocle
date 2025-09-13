import type { Suggestion } from "../../types/"

// Re-export main types for convenience
export type { Suggestion } from "../../types/"

// Command data structure
export type CommandData = {
  favorites: Suggestion[]
  recents: Suggestion[]
  suggestions: Suggestion[]
  deepSearchItems: Suggestion[]
}

// Component prop interfaces have been moved to their respective component files
