import { manageAllowList } from "./manageAllowList"
import { manageDenyList } from "./manageDenyList"
import { openSettings } from "./openSettings"
import { selectTheme } from "./selectTheme"
import { toggleTheme } from "./theme"

export const uiCommands = [
  openSettings,
  toggleTheme,
  selectTheme,
  manageAllowList,
  manageDenyList,
]
