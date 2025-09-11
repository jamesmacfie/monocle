import type {
  RequestPermissionMessage,
  RequestPermissionResponse,
} from "../../types/"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

export async function requestPermission(
  message: RequestPermissionMessage,
): Promise<RequestPermissionResponse> {
  try {
    const granted = await browserAPI.permissions.request({
      permissions: [message.permission],
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
