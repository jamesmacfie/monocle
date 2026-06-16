// Architecture: shared/ type layer. The durable command-catalog row model
// served to the options page by get-settings-catalog
// (background/commands/settingsCatalog.ts): command metadata, per-command
// settings, capabilities, and usage — data only, no executable functions.
import type { Browser } from "./browser"
import type {
  BrowserPermission,
  CommandColor,
  CommandIcon,
  CommandNode,
  KeybindingRequirements,
} from "./commands"
import type { CommandSettings } from "./settings"

export type SettingsCatalogCategoryId =
  | "browser"
  | "tools"
  | "ui"
  | "websites"
  | "new-tab"
  | "favorites"
  | "automations"
  | "features"
  | "extensions"

export type SettingsCatalogCommand = {
  id: string
  type: CommandNode["type"]
  name: string
  description?: string
  icon?: CommandIcon
  color?: CommandColor | string
  categoryId: SettingsCatalogCategoryId
  categoryLabel: string
  parentPath: string[]
  parentNames: string[]
  supportedBrowsers?: Browser.Platform[]
  permissions?: BrowserPermission[]
  settings: CommandSettings
  isFavorite: boolean
  defaultKeybinding?: string
  effectiveKeybinding?: string
  // Per-command constraints on assignable keybindings (action/submit only).
  keybindingRequirements?: KeybindingRequirements
  usage: {
    totalUsage: number
    lastUsed: number
    emaScore: number
    parentNames?: string[]
    parentIds?: string[]
  }
  capabilities: {
    configurable: boolean
    canHide: boolean
    canFavorite: boolean
    canSetKeybinding: boolean
    canEditUrlRules: boolean
    hasUrlRules: boolean
  }
}

export type SettingsCatalogResponse = {
  commands: SettingsCatalogCommand[]
}
