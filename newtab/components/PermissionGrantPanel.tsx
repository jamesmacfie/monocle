import { useState } from "react"
import { useAppDispatch } from "../../shared/store/hooks"
import { refreshPermissions } from "../../shared/store/slices/settings.slice"
import type { BrowserPermission } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"

const browserAPI = getBrowserAPI()

const grantablePermissions = new Set<BrowserPermission>([
  "activeTab",
  "bookmarks",
  "browsingData",
  "contextualIdentities",
  "cookies",
  "downloads",
  "history",
  "sessions",
  "storage",
  "tabs",
  "tabGroups",
  "management",
])

const permissionDisplayNames: Record<BrowserPermission, string> = {
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
  tabGroups: "Tab Groups",
  management: "Manage Extensions",
}

export const normalizeGrantPermission = (
  value: string | null,
): BrowserPermission | null => {
  if (!value || !grantablePermissions.has(value as BrowserPermission)) {
    return null
  }

  return value as BrowserPermission
}

interface PermissionGrantPanelProps {
  permission: BrowserPermission
}

export function PermissionGrantPanel({
  permission,
}: PermissionGrantPanelProps) {
  const dispatch = useAppDispatch()
  const [status, setStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [error, setError] = useState<string | null>(null)
  const displayName = permissionDisplayNames[permission]

  const handleGrant = async () => {
    setError(null)

    try {
      const permissionRequest = {
        permissions: [permission as chrome.runtime.ManifestPermissions],
      }

      await browserAPI.permissions.request(permissionRequest)
      const granted = await browserAPI.permissions.contains(permissionRequest)

      setStatus(granted ? "granted" : "denied")
      await dispatch(refreshPermissions())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Permission request failed",
      )
    }
  }

  return (
    <div className="mb-4 rounded-md border border-[var(--cmdk-border)] bg-[var(--cmdk-background)] px-4 py-3 text-[var(--cmdk-foreground)] shadow-lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">
            {displayName} permission required
          </div>
          {status === "granted" ? (
            <div className="text-xs text-[var(--color-success-fg)]">
              Permission granted
            </div>
          ) : status === "denied" ? (
            <div className="text-xs text-[var(--color-warning-fg)]">
              Permission denied
            </div>
          ) : error ? (
            <div className="text-xs text-[var(--color-error-fg)]">{error}</div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleGrant}
          disabled={status === "granted"}
          className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-fg-inverse)] hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)] disabled:cursor-default disabled:opacity-60"
        >
          {status === "granted" ? "Granted" : `Grant ${displayName}`}
        </button>
      </div>
    </div>
  )
}
