// Settings and user preferences types

// Individual command settings
export interface CommandSettings {
  keybinding?: string
}

// Theme settings
export interface ThemeSettings {
  mode?: "light" | "dark" | "system"
}

// New tab page settings
export interface NewTabSettings {
  backgroundCategories?: string[]
  clock?: {
    show?: boolean
    // room for future: format, timezone, etc.
  }
  greeting?: {
    show?: boolean
    // room for future: customText, name, etc.
  }
}

// Main settings structure
export interface Settings {
  theme?: ThemeSettings
  newTab?: NewTabSettings
  commands?: Record<string, CommandSettings>
}

// Settings that can be persisted
export interface PersistedSettings {
  theme: ThemeSettings
  newTab: NewTabSettings
  commands: Record<string, CommandSettings>
}
