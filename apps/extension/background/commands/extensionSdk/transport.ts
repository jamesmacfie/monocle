// Architecture: background command system, extension-to-extension bridge. The
// invoke RPC transport (Monocle → peer). Opening a port with
// `chrome.runtime.connect(extId)` WAKES the peer's MV3 worker; the peer answers
// on its onConnectExternal. Used only at the edges — to expand a callback group,
// run a search, or execute — never on the root-list hot path. Returned command
// lists are UNTRUSTED peer output and are re-validated (allowPlacement:false)
// before the engine converts them, exactly as the site SDK re-validates callback
// results. A sleeping/dead/slow peer is bounded by a timeout: the call rejects
// (the converting closure surfaces it as the palette already does for the site
// SDK). See docs/extension-extension/protocol.md.
import {
  EXT_INVOKE_PORT,
  EXT_PROTOCOL_VERSION,
  type ExternalCommand,
  type ExternalInvokeRequest,
  type ExtInvokeReply,
  validateExternalCommandList,
} from "../../../shared/types"
import { getBrowserAPI } from "../../../shared/utils/extension-api"

// Match the site SDK's callback budget so behavior is consistent across both
// external providers.
const INVOKE_TIMEOUT_MS = 3000

// Minimal structural shape for a cross-extension port (chrome.runtime.Port is
// not reliably typed across @types versions; the codebase already hand-rolls
// this for connectNative — see background/features/nativeMessaging/port.ts).
type ExtPort = {
  onMessage: { addListener: (cb: (raw: ExtInvokeReply) => void) => void }
  onDisconnect: { addListener: (cb: () => void) => void }
  postMessage: (message: unknown) => void
  disconnect: () => void
}

const validateCallbackCommands = (commands: unknown): ExternalCommand[] => {
  const validation = validateExternalCommandList(commands, {
    allowPlacement: false,
  })
  if (!validation.success) {
    throw new Error(validation.error)
  }
  return validation.commands
}

export const invokeExtension = (
  extId: string,
  request: ExternalInvokeRequest,
): Promise<ExternalCommand[] | undefined> =>
  new Promise((resolve, reject) => {
    const connect = (
      getBrowserAPI().runtime as unknown as {
        connect: (id: string, info: { name: string }) => ExtPort
      }
    ).connect
    let port: ExtPort
    try {
      port = connect(extId, { name: EXT_INVOKE_PORT })
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error("Could not reach extension"),
      )
      return
    }

    const id = crypto.randomUUID()
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        port.disconnect()
      } catch {
        // already gone
      }
      fn()
    }

    const timer = setTimeout(
      () => finish(() => reject(new Error("Extension callback timed out"))),
      INVOKE_TIMEOUT_MS,
    )

    port.onMessage.addListener((message: ExtInvokeReply) => {
      if (settled || message?.id !== id) return
      finish(() => {
        if (message.ok) {
          resolve(
            message.commands === undefined
              ? undefined
              : validateCallbackCommands(message.commands),
          )
        } else {
          reject(
            new Error(message.error?.message || "Extension callback failed"),
          )
        }
      })
    })

    port.onDisconnect.addListener(() =>
      finish(() => reject(new Error("Extension disconnected"))),
    )

    port.postMessage({
      v: EXT_PROTOCOL_VERSION,
      id,
      kind: "invoke",
      request,
    })
  })
