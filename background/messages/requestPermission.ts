import type {
  RequestPermissionMessage,
  RequestPermissionResponse,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"

export async function requestPermission(
  message: RequestPermissionMessage,
): Promise<RequestPermissionResponse> {
  const browserAPI = getBrowserAPI()
  const permissions = [message.permission as chrome.runtime.ManifestPermissions]

  try {
    await browserAPI.permissions.request({
      permissions,
    })

    const granted = await browserAPI.permissions.contains({
      permissions,
    })

    return { granted }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred"
    console.error(
      `Failed to request permission '${message.permission}' in background:`,
      errorMessage,
    )

    return {
      granted: false,
      error: `Failed to request ${message.permission} permission: ${errorMessage}`,
    }
  }
}
