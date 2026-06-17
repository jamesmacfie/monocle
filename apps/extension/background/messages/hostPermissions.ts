import type {
  EnsureHostPermissionMessage,
  EnsureHostPermissionResponse,
} from "../../shared/types"
import { ensureHostPermission } from "../utils/hostPermissions"

export const ensureHostPermissionMessage = async (
  message: EnsureHostPermissionMessage,
): Promise<EnsureHostPermissionResponse> => {
  return await ensureHostPermission({
    tabId: message.tabId,
    url: message.url,
    reason: message.reason,
    request: true,
    ensureContentScript: true,
  })
}
