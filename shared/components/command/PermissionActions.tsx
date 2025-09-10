import { Command } from "cmdk"
import type { PermissionKey } from "../../hooks/usePermissionsGranted"
import { useSendMessage } from "../../hooks/useSendMessage"
import { useAppDispatch } from "../../store/hooks"
import { refreshPermissions } from "../../store/slices/settings.slice"
import { CommandName } from "./CommandName"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

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
      // Request permission directly from content script
      const granted = await browserAPI.permissions.request({
        permissions: [permission],
      })

      if (granted) {
        // Update permissions in Redux store
        await dispatch(refreshPermissions())

        // Refresh commands to update UI
        onRefresh?.()

        // Close the actions menu
        onClose?.()

        // Show success toast
        await sendMessage({
          type: "request-toast",
          level: "success",
          message: `${permission} permission granted successfully`,
        })
      } else {
        // Close the actions menu
        onClose?.()

        // Show warning toast for denied permission
        await sendMessage({
          type: "request-toast",
          level: "warning",
          message: "Permission was denied",
        })
      }
    } catch (error) {
      console.error("Failed to request permission:", error)

      // Close the actions menu
      onClose?.()

      // Show error toast
      await sendMessage({
        type: "request-toast",
        level: "error",
        message: "Failed to request permission",
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
