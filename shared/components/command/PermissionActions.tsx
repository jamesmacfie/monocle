import { Command } from "cmdk"
import type { PermissionKey } from "../../hooks/usePermissionsGranted"
import { CommandName } from "./CommandName"

interface PermissionActionsProps {
  missingPermissions: PermissionKey[]
  onPermissionRequest: (permission: PermissionKey) => void
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
  onPermissionRequest,
}: PermissionActionsProps) {
  return (
    <>
      {missingPermissions.map((permission) => (
        <Command.Item
          key={`permission-${permission}`}
          value={`grant-${permission}`}
          onSelect={() => onPermissionRequest(permission)}
        >
          <CommandName
            name={`Grant ${permissionDisplayNames[permission]} permission`}
          />
        </Command.Item>
      ))}
    </>
  )
}
