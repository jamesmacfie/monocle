import { Command } from "cmdk"
import type { PermissionKey } from "../../hooks/usePermissionsGranted"
import { useSendMessage } from "../../hooks/useSendMessage"
import { useAppDispatch } from "../../store/hooks"
import { refreshPermissions } from "../../store/slices/settings.slice"
import { isFirefox } from "../../utils/browser"
import { getBrowserAPI } from "../../utils/extension-api"
import { CommandName } from "./CommandName"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()

interface PermissionActionsProps {
  missingPermissions: PermissionKey[]
  onRefresh?: () => void
  onClose?: () => void
}

// Map permission keys to human-readable names
const permissionDisplayNames: Record<PermissionKey, string> = {
  activeTab: "Active Tab",
  bookmarks: "Bookmarks",
  browsingData: "Browsing Data",
  contextualIdentities: "Container Tabs",
  cookies: "Cookies",
  downloads: "Downloads",
  history: "History",
  sessions: "Sessions",
  storage: "Storage",
  tabs: "Tabs",
}

export function PermissionActions({
  missingPermissions,
  onRefresh,
  onClose,
}: PermissionActionsProps) {
  const dispatch = useAppDispatch()
  const sendMessage = useSendMessage()

  const handlePermissionRequest = async (permission: PermissionKey) => {
    try {
      let granted = false
      let errorMessage: string | undefined

      const canRequestDirectly =
        // Some browsers expose the permissions API directly to the content script
        typeof browserAPI?.permissions?.request === "function"
      const permissionRequest = {
        permissions: [permission as chrome.runtime.ManifestPermissions],
      }

      if (isFirefox && canRequestDirectly) {
        const canCheckDirectly =
          typeof browserAPI?.permissions?.contains === "function"

        if (canCheckDirectly) {
          await browserAPI.permissions.request(permissionRequest)
          granted = await browserAPI.permissions.contains(permissionRequest)
        } else {
          // Firefox: Request permission directly from content script when available
          granted = await browserAPI.permissions.request(permissionRequest)
        }
      } else if (isFirefox) {
        await sendMessage({
          type: "open-permission-grant-page",
          permission,
        })
        onClose?.()
        await sendMessage({
          type: "request-toast",
          level: "info",
          message: `Grant ${permissionDisplayNames[permission]} permission in the opened Monocle tab`,
        })
        return
      } else {
        // Fallback: Request permission via background script (Chrome + Firefox sandboxed envs)
        const response: { granted: boolean; error?: string } =
          await sendMessage({
            type: "request-permission",
            permission,
          })
        granted = response?.granted || false
        errorMessage = response?.error
      }

      await dispatch(refreshPermissions())

      if (granted) {
        // Refresh commands to update UI
        onRefresh?.()

        // Close the actions menu
        onClose?.()

        // Show success toast
        await sendMessage({
          type: "request-toast",
          level: "success",
          message: `${permissionDisplayNames[permission]} permission granted successfully`,
        })
      } else {
        // Close the actions menu
        onClose?.()

        // Show warning toast with specific error if available
        const message = errorMessage || "Permission was denied"
        await sendMessage({
          type: "request-toast",
          level: "warning",
          message,
        })
      }
    } catch (error) {
      console.error("Failed to request permission:", error)

      await dispatch(refreshPermissions())

      // Close the actions menu
      onClose?.()

      // Show error toast with specific error message
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error occurred"
      await sendMessage({
        type: "request-toast",
        level: "error",
        message: `Failed to request ${permissionDisplayNames[permission]} permission: ${errorMsg}`,
      })
    }
  }

  return (
    <>
      {missingPermissions.map((permission) => (
        <Command.Item
          key={`permission-${permission}`}
          value={`grant-${permission}`}
          onSelect={() => handlePermissionRequest(permission)}
        >
          <CommandName
            name={`Grant ${permissionDisplayNames[permission]} permission`}
          />
        </Command.Item>
      ))}
    </>
  )
}
