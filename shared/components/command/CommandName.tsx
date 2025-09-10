import {
  type PermissionKey,
  usePermissionsGranted,
} from "../../hooks/usePermissionsGranted"

interface Props {
  name: string | string[]
  permissions?: PermissionKey[]
  className?: string
}

const humanReadableMap: {
  [key in PermissionKey]: string
} = {
  activeTab: "active tab",
  bookmarks: "bookmarks",
  browsingData: "browsing data",
  contextualIdentities: "contextual identities",
  cookies: "cookies",
  downloads: "downloads",
  history: "history",
  sessions: "sessions",
  storage: "storage",
  tabs: "tabs",
}

const formatHumanReadablePermissions = (
  permissions: PermissionKey[],
): string => {
  if (!permissions.length) return ""

  if (permissions.length === 1) return humanReadableMap[permissions[0]]

  if (permissions.length === 2)
    return `${humanReadableMap[permissions[0]]} and ${humanReadableMap[permissions[1]]}`

  return `${humanReadableMap[permissions[0]]}, ${humanReadableMap[permissions[1]]} and ${permissions.length - 2} other${permissions.length - 2 > 1 ? "s" : ""}`
}

export function CommandName({ name, className, permissions = [] }: Props) {
  const { isGrantedAllPermissions, missingPermissions } =
    usePermissionsGranted(permissions)

  if (Array.isArray(name)) {
    const fullTitle = `${name[0]} > ${name[1]}`
    return (
      <span className={className} title={fullTitle}>
        {name[0]}
        <span className="command-item-seperator">&gt;</span>
        <span className="command-item-parent">{name[1]}</span>
      </span>
    )
  }

  const permissionDisplay = !isGrantedAllPermissions ? (
    <>{formatHumanReadablePermissions(missingPermissions)}</>
  ) : null

  console.log(
    name,
    isGrantedAllPermissions,
    missingPermissions,
    permissionDisplay,
  )

  return (
    <span className={className} title={name}>
      {name}
      {permissionDisplay && (
        <span className="ml-2 text-red-400">
          &gt; Missing permissions: {permissionDisplay}
        </span>
      )}
    </span>
  )
}

// Utility function to get the display name from a command name
export function getDisplayName(name: string | string[]): string {
  return Array.isArray(name) ? name[0] : name
}
