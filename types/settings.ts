// Settings and user preferences types

// Individual command settings
export interface CommandSettings {
  keybinding?: string
}

// Global application settings (future expansion)
export interface GlobalSettings {
  // For future global preferences like themes, default behaviors, etc.
  [key: string]: any
}

// Main settings structure
export interface Settings {
  global?: GlobalSettings
  commands?: Record<string, CommandSettings>
}

// Settings that can be persisted
export interface PersistedSettings {
  global: GlobalSettings
  commands: Record<string, CommandSettings>
}
