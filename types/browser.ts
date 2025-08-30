// Browser-specific types and context
export namespace Browser {
  export type ModifierKey = "shift" | "cmd" | "alt" | "ctrl"
  export type Platform = "chrome" | "firefox"

  export interface Context {
    url: string
    title: string
    modifierKey: ModifierKey | null // Keep original name for now
  }
}

// Export at top level for convenience
export type ModifierKey = Browser.ModifierKey
export type ExecutionContext = Browser.Context
export type SupportedBrowser = Browser.Platform
