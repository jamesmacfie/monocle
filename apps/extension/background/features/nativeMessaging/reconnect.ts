// Architecture: background feature layer (Native Messaging bridge). The durable
// reconnect backstop. The connectNative port keeps the MV3 service worker alive,
// but once the port drops (daemon restart, host crash) the worker can
// idle-terminate — taking the in-memory setTimeout reconnect (port.ts) with it,
// and nothing wakes it again (a loopback /status call hits only the daemon, not
// the browser). chrome.alarms is the only timer that survives worker death AND
// wakes the worker, so a periodic alarm re-opens the port even after a cold
// termination. See docs/native-messaging/architecture.md.
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { getFeatureConfig } from "../config"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  nativeMessagingConfigDefaults,
} from "./types"

const RECONNECT_ALARM = "native-bridge:reconnect"
// chrome.alarms floors periodInMinutes at 1 in production builds; that's the
// worst-case re-attach latency after a service-worker termination.
const PERIOD_MINUTES = 1

// Create the heartbeat alarm (idempotent — re-creating with the same name just
// resets it). Called when the bridge is enabled.
export const ensureReconnectAlarm = (): void => {
  getBrowserAPI().alarms?.create(RECONNECT_ALARM, {
    periodInMinutes: PERIOD_MINUTES,
  })
}

export const clearReconnectAlarm = (): void => {
  getBrowserAPI().alarms?.clear(RECONNECT_ALARM)
}

// Registered synchronously at worker startup (from background/index.ts) so an
// alarm-wake reaches the listener. On each tick: if the bridge is still enabled,
// (re)open the port — connectBridge is a no-op when already connected; if it was
// disabled, tear the alarm down so we stop waking the worker.
export const initializeBridgeReconnect = (): void => {
  getBrowserAPI().alarms?.onAlarm?.addListener((alarm: { name: string }) => {
    if (alarm.name !== RECONNECT_ALARM) {
      return
    }
    void (async () => {
      const config = await getFeatureConfig(
        NATIVE_MESSAGING_FEATURE_ID,
        nativeMessagingConfigDefaults,
      )
      if (!config.enabled) {
        clearReconnectAlarm()
        return
      }
      // Lazy import: keep port -> pump -> command-system out of the static graph
      // (mirrors the feature init's reasoning).
      const { connectBridge } = await import("./port")
      await connectBridge()
    })().catch((error) =>
      console.error("[native-messaging] reconnect alarm failed:", error),
    )
  })
}
