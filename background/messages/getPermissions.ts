import type { GetPermissionsMessage } from "../../types/"
import { isFirefox } from "../utils/browser"

export const getPermissions = async (_message: GetPermissionsMessage) => {
  try {
    const browserAPI = isFirefox ? browser : chrome
    const currentPermissions = await browserAPI.permissions.getAll()

    // Extract the permission names from the permissions array
    const permissions = currentPermissions.permissions || []

    return {
      isLoaded: true,
      access: {
        activeTab: permissions.includes("activeTab"),
        bookmarks: permissions.includes("bookmarks"),
        browsingData: permissions.includes("browsingData"),
        contextualIdentities: permissions.includes("contextualIdentities"),
        cookies: permissions.includes("cookies"),
        downloads: permissions.includes("downloads"),
        history: permissions.includes("history"),
        sessions: permissions.includes("sessions"),
        storage: permissions.includes("storage"),
        tabs: permissions.includes("tabs"),
      },
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
