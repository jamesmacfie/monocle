import { isFirefox } from "../../shared/utils/browser"
import type { BrowserPermission } from "../../types/"

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
    const missingPermissions: BrowserPermission[] = []

    // Check each permission individually
    for (const permission of requiredPermissions) {
      // Skip contextualIdentities check on Chrome as it's Firefox-only
      if (permission === "contextualIdentities" && !isFirefox) {
        continue
      }

      const hasPermission = await browserAPI.permissions.contains({
        permissions: [permission],
      })

      if (!hasPermission) {
        missingPermissions.push(permission)
      }
    }

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
