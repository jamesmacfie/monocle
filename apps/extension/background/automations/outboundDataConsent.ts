import { isFirefox } from "../../shared/utils/browser"
import { OUTBOUND_DATA_CATEGORIES } from "../../shared/utils/http-request-policy"
import { callBrowserAPI } from "../utils/browserApi"

type PermissionSnapshot = {
  data_collection?: string[]
}

export const hasOutboundDataConsent = async (): Promise<boolean> => {
  if (!isFirefox) return true
  const permissions = (await callBrowserAPI(
    "permissions",
    "getAll",
  )) as PermissionSnapshot
  const granted = new Set(permissions.data_collection ?? [])
  return OUTBOUND_DATA_CATEGORIES.every((category) => granted.has(category))
}
