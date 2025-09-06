// Browser-specific types and context
export namespace Browser {
  export type ModifierKey = "shift" | "cmd" | "alt" | "ctrl"
  export type Platform = "chrome" | "firefox"

  export interface Context {
    url: string
    title: string
    modifierKey: ModifierKey | null
    isNewTab?: boolean
  }
}
