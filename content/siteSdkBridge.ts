import type {
  Browser,
  SiteSdkInvokeRequest,
  SiteSdkInvokeResponse,
  SiteSdkRegistration,
} from "../shared/types"
import {
  SITE_SDK_BRIDGE_SOURCE,
  SITE_SDK_PAGE_SOURCE,
  validateContentMessage,
  validateSiteSdkCommandList,
  validateSiteSdkRegistrations,
} from "../shared/types"
import { getBrowserAPI } from "../shared/utils/extension-api"

const PAGE_REQUEST_TIMEOUT_MS = 3000

type CommandsChangedListener = () => void

type PendingPageRequest = {
  resolve: (response: SiteSdkInvokeResponse) => void
  timer: ReturnType<typeof setTimeout>
}

let initialized = false
let latestRegistrations: SiteSdkRegistration[] = []
const listeners = new Set<CommandsChangedListener>()
const pendingPageRequests = new Map<string, PendingPageRequest>()

// Capture the current page context at the bridge boundary. The background
// still derives trust/scoping from the extension sender, not from this object.
const createContext = (): Browser.Context => ({
  title: document.title,
  url: window.location.href,
  modifierKey: null,
})

// Notify the mounted content palette that the root command source changed, so
// an open palette can refresh without waiting for the next toggle.
const notifyCommandsChanged = () => {
  for (const listener of listeners) {
    listener()
  }
}

// `site-sdk-sync` is the only page-to-background write path for SDK commands.
// It carries validated, function-free declarations scoped by the sender tab.
const sendBackgroundSync = async (registrations: SiteSdkRegistration[]) => {
  const api = getBrowserAPI()

  await api.runtime.sendMessage({
    type: "site-sdk-sync",
    context: createContext(),
    registrations,
  })
}

// Validate page-world registrations before the background ever sees them. Bad
// declarations are ignored instead of partially syncing a broken command tree.
const syncRegistrations = async (rawRegistrations: unknown) => {
  const validation = validateSiteSdkRegistrations(rawRegistrations)

  if (!validation.success) {
    console.warn("[Monocle SDK] Ignoring invalid site commands:", {
      error: validation.error,
    })
    return
  }

  latestRegistrations = validation.registrations

  try {
    await sendBackgroundSync(latestRegistrations)
    notifyCommandsChanged()
  } catch (error) {
    console.warn("[Monocle SDK] Failed to sync site commands:", error)
  }
}

// Messages to the page facade are source-tagged so ordinary page postMessage
// traffic cannot be mistaken for SDK protocol traffic.
const postBridgeMessage = (message: Record<string, unknown>) => {
  window.postMessage(
    {
      source: SITE_SDK_BRIDGE_SOURCE,
      ...message,
    },
    "*",
  )
}

// Correlate one background invoke with one page callback response. The timeout
// prevents a site callback from pinning the extension message channel forever.
const requestPageInvoke = (
  request: SiteSdkInvokeRequest,
): Promise<SiteSdkInvokeResponse> => {
  const requestId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPageRequests.delete(requestId)
      resolve({
        success: false,
        error: "Timed out waiting for site SDK callback",
      })
    }, PAGE_REQUEST_TIMEOUT_MS)

    pendingPageRequests.set(requestId, { resolve, timer })

    postBridgeMessage({
      type: "invoke",
      requestId,
      request,
    })
  })
}

// Receive full registration snapshots and invoke responses from the page-world
// facade. All other same-window messages are ignored.
const handlePageMessage = (event: MessageEvent) => {
  if (event.source !== window) return

  const data = event.data
  if (!data || data.source !== SITE_SDK_PAGE_SOURCE) return

  if (data.type === "sync") {
    void syncRegistrations(data.registrations)
    return
  }

  if (data.type === "invoke-response" && typeof data.requestId === "string") {
    const pending = pendingPageRequests.get(data.requestId)
    if (!pending) return

    clearTimeout(pending.timer)
    pendingPageRequests.delete(data.requestId)

    if (data.success === true) {
      pending.resolve({
        success: true,
        commands: data.commands,
      })
      return
    }

    pending.resolve({
      success: false,
      error:
        typeof data.error === "string"
          ? data.error
          : "Site SDK callback failed",
    })
  }
}

// Background messages are async Chrome message responses. Dynamic command
// results are validated again after the page callback returns.
const handleBackgroundMessage = (
  message: any,
  _sender: any,
  sendResponse: (response?: any) => void,
) => {
  const event = validateContentMessage(message)

  if (event?.type === "monocle-sdk-sync-request") {
    postBridgeMessage({ type: "sync-request" })
    sendResponse({ registrations: latestRegistrations })
    return false
  }

  if (event?.type === "monocle-sdk-invoke") {
    requestPageInvoke(event.request)
      .then((response) => {
        if (response.success && response.commands) {
          const validation = validateSiteSdkCommandList(response.commands, {
            allowPlacement: false,
          })

          if (!validation.success) {
            sendResponse({
              success: false,
              error: validation.error,
            })
            return
          }

          sendResponse({
            success: true,
            commands: validation.commands,
          })
          return
        }

        sendResponse(response)
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown SDK error",
        })
      })

    return true
  }

  return undefined
}

/**
 * Starts the isolated-world SDK bridge once per content-script document.
 *
 * This must run before the palette UI boots so early page registrations queued
 * by the main-world facade can be replayed immediately.
 */
export function initializeSiteSdkBridge() {
  if (initialized) {
    return
  }

  initialized = true
  window.addEventListener("message", handlePageMessage)

  const api = getBrowserAPI()
  api.runtime.onMessage.addListener(handleBackgroundMessage)

  postBridgeMessage({ type: "ready" })
}

/**
 * Lets the content palette refresh when SDK registrations change.
 *
 * This is content-local UI plumbing; background command resolution remains the
 * source of truth for which SDK commands are visible.
 */
export function subscribeSiteSdkCommandsChanged(
  listener: CommandsChangedListener,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
