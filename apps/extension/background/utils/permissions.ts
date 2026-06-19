import type { BrowserPermission } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"

/**
 * The set of optional permissions currently granted to the extension. One
 * `getAll` call so callers can subset-check many commands in memory instead of
 * one `contains` call per permission. Returns an empty set on error (fail
 * closed — treat everything as ungranted).
 */
export async function getGrantedPermissions(): Promise<Set<string>> {
  try {
    const browserAPI = isFirefox ? browser : chrome
    const all = await browserAPI.permissions.getAll()
    return new Set(all.permissions ?? [])
  } catch (error) {
    console.error("[Permissions] Error reading granted permissions:", error)
    return new Set()
  }
}

/**
 * Cross-browser compatible permission checking utility
 */
export async function checkPermissions(
  requiredPermissions: BrowserPermission[],
): Promise<{
  hasAllPermissions: boolean
  missingPermissions: BrowserPermission[]
}> {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return {
      hasAllPermissions: true,
      missingPermissions: [],
    }
  }

  try {
    const browserAPI = isFirefox ? browser : chrome

    // Check permissions concurrently; each check is an independent API call
    const checkResults = await Promise.all(
      requiredPermissions.map(async (permission) => {
        // Skip contextualIdentities check on Chrome as it's Firefox-only
        if (permission === "contextualIdentities" && !isFirefox) {
          return null
        }

        const hasPermission = await browserAPI.permissions.contains({
          permissions: [permission as chrome.runtime.ManifestPermissions],
        })

        return hasPermission ? null : permission
      }),
    )
    const missingPermissions = checkResults.filter(
      (permission): permission is BrowserPermission => permission !== null,
    )

    return {
      hasAllPermissions: missingPermissions.length === 0,
      missingPermissions,
    }
  } catch (error) {
    console.error("[Permissions] Error checking permissions:", error)
    // On error, assume permissions are missing for safety
    return {
      hasAllPermissions: false,
      missingPermissions: requiredPermissions,
    }
  }
}
