import { useAppSelector } from "../store/hooks"
import { selectPermissions } from "../store/slices/settings.slice"

export type PermissionKey =
  | "activeTab"
  | "bookmarks"
  | "browsingData"
  | "contextualIdentities"
  | "cookies"
  | "downloads"
  | "history"
  | "sessions"
  | "storage"
  | "tabs"

export function usePermissionsGranted(requiredPermissions: PermissionKey[]): {
  isGrantedAllPermissions: boolean
  missingPermissions: PermissionKey[]
} {
  const permissions = useAppSelector(selectPermissions)

  if (!permissions.isLoaded) {
    return {
      isGrantedAllPermissions: false,
      missingPermissions: [],
    }
  }

  return {
    isGrantedAllPermissions: requiredPermissions.every(
      (permission) => permissions.access[permission] === true,
    ),
    missingPermissions: requiredPermissions.filter(
      (permission) => permissions.access[permission] === false,
    ),
  }
}
