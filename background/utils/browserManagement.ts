// Architecture: background layer. Thin wrappers over the `chrome.management`
// API (Promise/callback-bridged through callBrowserAPI) backing the Extensions
// command group (background/commands/extensions/). The "management" permission
// is optional and requested on demand — it can disable/uninstall other
// extensions, so it is granted only when the user first opens the group. See
// docs/commands/extensions.md.
import { callBrowserAPI } from "./browserApi"

// Minimal cross-browser projection of chrome.management.ExtensionInfo. We type
// only the fields the command group reads so the util does not depend on the
// exact @types/chrome shape (and so Firefox's near-identical API also fits).
export type ManagedExtension = {
  id: string
  name: string
  enabled: boolean
  // "extension" | "hosted_app" | "packaged_app" | "legacy_packaged_app" |
  // "theme" | "login_screen_extension"
  type: string
  version: string
  description?: string
  // false when the browser forbids the user disabling it (policy-installed,
  // or the extension itself). Drives whether we offer enable/disable.
  mayDisable: boolean
  optionsUrl?: string
  homepageUrl?: string
  icons?: Array<{ size: number; url: string }>
}

/** True for the app extension types (apps can be launched, not just toggled). */
export const isExtensionApp = (extension: ManagedExtension): boolean =>
  extension.type === "hosted_app" ||
  extension.type === "packaged_app" ||
  extension.type === "legacy_packaged_app"

/**
 * Picks the largest icon at or below `maxSize` (falling back to the largest
 * available) for use as a command-row icon. Returns undefined when the
 * extension declares no icons.
 */
export const pickExtensionIconUrl = (
  extension: ManagedExtension,
  maxSize = 32,
): string | undefined => {
  const icons = extension.icons
  if (!icons || icons.length === 0) {
    return undefined
  }
  const sorted = [...icons].sort((a, b) => a.size - b.size)
  const best = sorted.filter((icon) => icon.size <= maxSize).pop() ?? sorted[0]
  return best?.url
}

/** All installed extensions/apps/themes (includes Monocle itself). */
export const getAllExtensions = async (): Promise<ManagedExtension[]> =>
  (await callBrowserAPI("management", "getAll")) ?? []

/** Re-reads a single extension by id so action labels reflect current state. */
export const getExtension = async (
  id: string,
): Promise<ManagedExtension | null> => {
  try {
    return await callBrowserAPI("management", "get", id)
  } catch {
    return null
  }
}

/** Monocle's own ExtensionInfo, used to exclude itself from the listing. */
export const getSelfExtension = async (): Promise<ManagedExtension | null> => {
  try {
    return await callBrowserAPI("management", "getSelf")
  } catch {
    return null
  }
}

export const setExtensionEnabled = async (
  id: string,
  enabled: boolean,
): Promise<void> => {
  await callBrowserAPI("management", "setEnabled", id, enabled)
}

export const launchApp = async (id: string): Promise<void> => {
  await callBrowserAPI("management", "launchApp", id)
}
