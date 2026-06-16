import type { Settings, ThemeSettings } from "../types"
import { getThemeOption, THEME_IDS } from "./themes"

/**
 * Theme management utilities
 * Handles applying theme classes based on user preferences
 */

export type ThemeMode = NonNullable<ThemeSettings["mode"]>

type ThemeClassTarget = {
  classList: {
    add: (...tokens: string[]) => void
    remove: (...tokens: string[]) => void
  }
}

type ThemeSettingsSource =
  | {
      theme?: Partial<ThemeSettings> | null
    }
  | Pick<Settings, "theme">
  | null
  | undefined

// Every selectable theme class, so applyThemeClass can clear whichever one is
// currently applied before adding the new one.
const THEME_CLASSES: ThemeMode[] = THEME_IDS
const DEFAULT_THEME_MODE: ThemeMode = "system"

const isThemeMode = (mode: unknown): mode is ThemeMode => {
  return typeof mode === "string" && (THEME_IDS as string[]).includes(mode)
}

const getThemeClassTarget = (
  element: ThemeClassTarget | ShadowRoot,
): ThemeClassTarget => {
  if (typeof ShadowRoot !== "undefined" && element instanceof ShadowRoot) {
    return element.host as ThemeClassTarget
  }

  return element as ThemeClassTarget
}

export function normalizeThemeMode(mode: unknown): ThemeMode {
  return isThemeMode(mode) ? mode : DEFAULT_THEME_MODE
}

export function getThemeModeFromSettings(
  settings: ThemeSettingsSource,
): ThemeMode {
  return normalizeThemeMode(settings?.theme?.mode)
}

/**
 * Gets the effective theme based on mode and system preference
 */
export function getEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    const browserWindow =
      typeof globalThis.window === "undefined" ? undefined : globalThis.window
    const canReadSystemTheme = browserWindow?.matchMedia

    if (canReadSystemTheme) {
      return browserWindow.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    }

    return "light"
  }

  // Named themes are fixed; classify via their declared scheme.
  return getThemeOption(mode)?.scheme ?? "light"
}

/**
 * Applies theme class to an element (host for shadow DOM or root for regular DOM)
 */
export function applyThemeClass(
  element: ThemeClassTarget | ShadowRoot,
  mode: ThemeMode,
): void {
  const hostElement = getThemeClassTarget(element)

  // Remove existing theme classes
  hostElement.classList.remove(...THEME_CLASSES)

  // Add the appropriate class
  hostElement.classList.add(mode)
}

/**
 * Applies stored theme settings to a content shadow host element.
 */
export function applyThemeToHost(
  hostElement: ThemeClassTarget,
  settings: ThemeSettingsSource,
): ThemeMode {
  const mode = getThemeModeFromSettings(settings)
  applyThemeClass(hostElement, mode)
  return mode
}

/**
 * Sets up a listener for system theme changes when in system mode
 */
export function setupSystemThemeListener(
  callback: (isDark: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {} // No-op cleanup function
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

  const handler = (e: MediaQueryListEvent | MediaQueryList) => {
    callback(e.matches)
  }

  // Modern browsers
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener(
      "change",
      handler as (e: MediaQueryListEvent) => void,
    )
    return () =>
      mediaQuery.removeEventListener(
        "change",
        handler as (e: MediaQueryListEvent) => void,
      )
  }

  // Legacy browsers
  if (mediaQuery.addListener) {
    mediaQuery.addListener(handler as (e: MediaQueryListEvent) => void)
    return () =>
      mediaQuery.removeListener(handler as (e: MediaQueryListEvent) => void)
  }

  return () => {} // No-op cleanup function
}

/**
 * Applies theme to document root for new tab page
 */
export function applyThemeToDocument(mode: ThemeMode): void {
  applyThemeClass(document.documentElement, mode)
}
