import type { ThemeMode } from "../types/settings"

/**
 * Single source of truth for the selectable themes.
 *
 * This module is intentionally DOM-free so it can be imported from the
 * background service worker (for the theme-selection command) as well as the
 * UIs. The actual color values live in the CSS theme blocks; `scheme`
 * classifies a theme as light/dark for the OS-aware resolution only.
 */
export interface ThemeOption {
  id: ThemeMode
  label: string
  // "Mode" = the OS-aware trio; "Themes" = always-on fixed schemes.
  group: "Mode" | "Themes"
  scheme: "light" | "dark"
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "system", label: "System", group: "Mode", scheme: "dark" },
  { id: "light", label: "Light", group: "Mode", scheme: "light" },
  { id: "dark", label: "Dark", group: "Mode", scheme: "dark" },
  {
    id: "solarized-light",
    label: "Solarized Light",
    group: "Themes",
    scheme: "light",
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    group: "Themes",
    scheme: "dark",
  },
  { id: "monokai", label: "Monokai", group: "Themes", scheme: "dark" },
  { id: "nord", label: "Nord", group: "Themes", scheme: "dark" },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    group: "Themes",
    scheme: "light",
  },
  {
    id: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    group: "Themes",
    scheme: "dark",
  },
  {
    id: "catppuccin-macchiato",
    label: "Catppuccin Macchiato",
    group: "Themes",
    scheme: "dark",
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    group: "Themes",
    scheme: "dark",
  },
  { id: "one-dark", label: "One Dark", group: "Themes", scheme: "dark" },
  { id: "dracula", label: "Dracula", group: "Themes", scheme: "dark" },
]

export const THEME_IDS: ThemeMode[] = THEME_OPTIONS.map((option) => option.id)

const THEME_OPTION_BY_ID = new Map(
  THEME_OPTIONS.map((option) => [option.id, option] as const),
)

export function getThemeOption(id: ThemeMode): ThemeOption | undefined {
  return THEME_OPTION_BY_ID.get(id)
}
