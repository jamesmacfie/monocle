import type { Suggestion } from "./ui"

// Re-export main types for convenience
export type { Suggestion } from "./ui"

// Command data structure
export type CommandData = {
  favorites: Suggestion[]
  suggestions: Suggestion[]
  deepSearchItems: Suggestion[]
}

// Component prop interfaces have been moved to their respective component files
