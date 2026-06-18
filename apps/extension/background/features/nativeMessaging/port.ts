// Architecture: background feature layer (Native Messaging bridge). Owns the
// connectNative port lifecycle. Holding the port keeps the MV3 service worker
// alive while the bridge is enabled; the host can die independently, so we
// reconnect with backoff. The port is only opened when the opt-in flag is on AND
// the nativeMessaging permission is granted. All request handling is delegated
// to the pump. See docs/native-messaging/architecture.md.
import { NATIVE_MESSAGING_HOST } from "../../../shared/types"
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { handleBridgeRequest } from "./pump"
import { clearReconnectAlarm, ensureReconnectAlarm } from "./reconnect"

// Minimal port surface we use — avoids depending on a specific @types/chrome
// shape for connectNative's return (named differently across versions).
type NativePort = {
  onMessage: { addListener: (cb: (raw: unknown) => void) => void }
  onDisconnect: { addListener: (cb: () => void) => void }
  postMessage: (message: unknown) => void
  disconnect: () => void
}

let port: NativePort | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1_000
const MAX_BACKOFF_MS = 60_000
// Set while the feature is enabled; gates whether onDisconnect reconnects.
let wantConnected = false

const hasPermission = async (): Promise<boolean> => {
  try {
    return await getBrowserAPI().permissions.contains({
      permissions: ["nativeMessaging" as chrome.runtime.ManifestPermissions],
    })
  } catch {
    return false
  }
}

const scheduleReconnect = (): void => {
  if (!wantConnected || reconnectTimer) {
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connectBridge()
  }, backoffMs)
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
}

export const connectBridge = async (): Promise<void> => {
  wantConnected = true
  // Heartbeat survives worker death and re-opens the port even if the in-memory
  // setTimeout reconnect below is lost when the worker is terminated.
  ensureReconnectAlarm()
  if (port) {
    return
  }
  if (!(await hasPermission())) {
    // No permission yet — the enable command requests it; nothing to do until
    // then. Do not spin a reconnect loop on a permission we cannot self-grant.
    console.warn(
      "[native-messaging] enabled but nativeMessaging permission not granted — " +
        'run the palette command "Enable native bridge" to grant it. Port not opened.',
    )
    return
  }

  try {
    port = (
      getBrowserAPI().runtime as unknown as {
        connectNative: (host: string) => NativePort
      }
    ).connectNative(NATIVE_MESSAGING_HOST)
    console.info(
      "[native-messaging] connectNative requested:",
      NATIVE_MESSAGING_HOST,
    )
  } catch (error) {
    console.error("[native-messaging] connectNative failed:", error)
    scheduleReconnect()
    return
  }

  backoffMs = 1_000

  port.onMessage.addListener((raw: unknown) => {
    void handleBridgeRequest(raw).then((response) => {
      try {
        port?.postMessage(response)
      } catch (error) {
        console.error("[native-messaging] postMessage failed:", error)
      }
    })
  })

  port.onDisconnect.addListener(() => {
    // lastError carries the reason (e.g. "Specified native messaging host not
    // found." when the manifest is missing / the extension id does not match
    // allowed_origins).
    const reason = getBrowserAPI().runtime.lastError?.message
    console.warn(
      "[native-messaging] host port disconnected:",
      reason ?? "(no reason)",
    )
    port = null
    scheduleReconnect()
  })
}

export const disconnectBridge = (): void => {
  wantConnected = false
  clearReconnectAlarm()
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (port) {
    try {
      port.disconnect()
    } catch {
      // already gone
    }
    port = null
  }
}
