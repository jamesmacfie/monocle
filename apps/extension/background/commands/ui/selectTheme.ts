import type {
  ActionCommandNode,
  CommandIcon,
  CommandNode,
  GroupCommandNode,
  ThemeMode,
} from "../../../shared/types"
import { THEME_OPTIONS } from "../../../shared/utils/themes"
import { getThemeSettings, updateThemeSettings } from "../settings"

const iconForTheme = (id: ThemeMode): CommandIcon => {
  switch (id) {
    case "system":
      return { type: "lucide", name: "Monitor" }
    case "light":
      return { type: "lucide", name: "Sun" }
    case "dark":
      return { type: "lucide", name: "Moon" }
    default:
      return { type: "lucide", name: "Palette" }
  }
}

/**
 * Theme picker group. Each child applies its theme immediately via
 * `updateThemeSettings`; the content overlay and new-tab page reapply on the
 * resulting storage change. `remainOpenOnSelect` keeps the palette open on
 * Enter so the change is visible live and the "current" marker refreshes;
 * Cmd/Ctrl+Enter applies the theme and closes the palette.
 */
export const selectTheme: GroupCommandNode = {
  type: "group",
  id: "theme",
  name: "Themes",
  description: "Change the color theme",
  icon: { type: "lucide", name: "Palette" },
  color: "purple",
  keywords: [
    "theme",
    "appearance",
    "color",
    "colour",
    "scheme",
    "dark",
    "light",
    "system",
  ],
  enableDeepSearch: true,
  children: async () => {
    const currentMode = (await getThemeSettings()).mode ?? "system"

    return THEME_OPTIONS.map((option) => {
      const isActive = option.id === currentMode

      const action: ActionCommandNode = {
        type: "action",
        id: `theme-${option.id}`,
        name: option.label,
        description: isActive ? "Current theme" : `Switch to ${option.label}`,
        icon: isActive
          ? { type: "lucide", name: "Check" }
          : iconForTheme(option.id),
        color: "purple",
        keywords: ["theme", option.label.toLowerCase()],
        remainOpenOnSelect: true,
        execute: async () => {
          await updateThemeSettings({ mode: option.id })
        },
        supportedBrowsers: ["chrome", "firefox"],
      }

      return action
    }) as CommandNode[]
  },
  supportedBrowsers: ["chrome", "firefox"],
}
