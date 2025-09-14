/**
 * Theme management utilities
 * Handles applying theme classes based on user preferences
 */

/**
 * Gets the effective theme based on mode and system preference
 */
export function getEffectiveTheme(
  mode: "light" | "dark" | "system",
): "light" | "dark" {
  if (mode === "system") {
    // Check system preference
    if (window?.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    }
    // Default to light if can't detect
    return "light"
  }
  return mode
}

/**
 * Applies theme class to an element (host for shadow DOM or root for regular DOM)
 */
export function applyThemeClass(
  element: HTMLElement | ShadowRoot,
  mode: "light" | "dark" | "system",
): void {
  const hostElement = element instanceof ShadowRoot ? element.host : element

  // Remove existing theme classes
  hostElement.classList.remove("light", "dark", "system")

  // Add the appropriate class
  if (mode === "system") {
    hostElement.classList.add("system")
  } else {
    hostElement.classList.add(mode)
  }
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
export function applyThemeToDocument(mode: "light" | "dark" | "system"): void {
  const root = document.documentElement

  // Remove existing theme classes
  root.classList.remove("light", "dark", "system")

  // Add the appropriate class
  if (mode === "system") {
    root.classList.add("system")
  } else {
    root.classList.add(mode)
  }
}
