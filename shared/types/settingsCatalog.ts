import type { Browser } from "./browser"
import type {
  BrowserPermission,
  CommandColor,
  CommandIcon,
  CommandNode,
} from "./commands"
import type { CommandSettings } from "./settings"

export type SettingsCatalogCategoryId =
  | "browser"
  | "tools"
  | "ui"
  | "websites"
  | "new-tab"
  | "favorites"

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
  usage: {
    totalUsage: number
    lastUsed: number
    emaScore: number
    parentNames?: string[]
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
