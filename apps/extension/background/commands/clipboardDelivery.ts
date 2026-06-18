// Architecture: background command system. The delivery seam for data-producing
// commands. Copy/value commands compute a value, call deliverClipboard() to put
// it on the active tab's clipboard, AND return it as a CommandResult. The
// PALETTE/keybinding path runs with delivery "clipboard" (the default), so the
// clipboard write happens as before. The native-messaging BRIDGE path runs with
// delivery "return" (set by executeResolvedCommand via runWithDelivery), so the
// clipboard write is suppressed — the bridge forwards the returned value to the
// external app instead, which is the value the user actually wants there.
//
// The mode is ambient module state rather than a parameter so command bodies
// never learn they are being called by the bridge (the doc invariant): they
// just call deliverClipboard(). Background command execution is sequential per
// request and runWithDelivery restores the prior mode in finally, so the flag
// can never leak across runs. See docs/native-messaging/execution.md.
import { sendTabMessage } from "../utils/browser"

type DeliveryMode = "clipboard" | "return"

let currentMode: DeliveryMode = "clipboard"

// Runs `fn` with the given delivery mode active, restoring the previous mode
// afterward. Used by executeResolvedCommand to wrap a command's execute().
export const runWithDelivery = async <T>(
  mode: DeliveryMode,
  fn: () => T | Promise<T>,
): Promise<T> => {
  const previous = currentMode
  currentMode = mode
  try {
    return await fn()
  } finally {
    currentMode = previous
  }
}

// Writes `value` to the active tab's clipboard with a success toast — but only
// in "clipboard" delivery mode. In "return" mode (bridge) this is a no-op and
// the caller's returned CommandResult carries the value instead.
export const deliverClipboard = async (
  tabId: number,
  value: string,
  toast: string,
): Promise<void> => {
  if (currentMode === "return") {
    return
  }
  await sendTabMessage(tabId, {
    type: "monocle-clipboard-write",
    message: value,
  })
  await sendTabMessage(tabId, {
    type: "monocle-toast",
    level: "success",
    message: toast,
  })
}
