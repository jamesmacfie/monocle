import type { GetPermissionsMessage } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"

export const getPermissions = async (_message: GetPermissionsMessage) => {
  try {
    const browserAPI = isFirefox ? browser : chrome
    const currentPermissions = await browserAPI.permissions.getAll()

    // Extract the permission names from the permissions array
    const permissions = currentPermissions.permissions || []

    // Note: contextualIdentities is Firefox-specific and not available in Chrome
    const access = {
      activeTab: permissions.includes("activeTab"),
      bookmarks: permissions.includes("bookmarks"),
      browsingData: permissions.includes("browsingData"),
      contextualIdentities: isFirefox
        ? permissions.includes("contextualIdentities" as any)
        : false,
      cookies: permissions.includes("cookies"),
      downloads: permissions.includes("downloads"),
      history: permissions.includes("history"),
      sessions: permissions.includes("sessions"),
      storage: permissions.includes("storage"),
      tabs: permissions.includes("tabs"),
      // Chrome-only permission; absent (false) on Firefox.
      tabGroups: permissions.includes("tabGroups" as any),
      management: permissions.includes("management"),
      nativeMessaging: permissions.includes("nativeMessaging" as any),
    }

    return {
      isLoaded: true,
      access,
    }
  } catch (error) {
    console.error("[Background] Failed to get permissions:", error)
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to get extension permissions",
    )
  }
}
