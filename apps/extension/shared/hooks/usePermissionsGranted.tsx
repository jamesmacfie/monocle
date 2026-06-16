import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  refreshPermissions,
  selectPermissions,
} from "../store/slices/settings.slice"

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
  | "tabGroups"
  | "management"

let lastPermissionRefreshAt = 0
const PERMISSION_REFRESH_THROTTLE_MS = 1000

export function usePermissionsGranted(requiredPermissions: PermissionKey[]): {
  isGrantedAllPermissions: boolean
  missingPermissions: PermissionKey[]
} {
  const dispatch = useAppDispatch()
  const permissions = useAppSelector(selectPermissions)
  const permissionKey = requiredPermissions.join(",")

  useEffect(() => {
    if (!permissionKey) {
      return
    }

    const now = Date.now()
    if (now - lastPermissionRefreshAt < PERMISSION_REFRESH_THROTTLE_MS) {
      return
    }

    lastPermissionRefreshAt = now
    dispatch(refreshPermissions())
  }, [dispatch, permissionKey])

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
