// Architecture: background utility. Opens the content-overlay palette in a tab,
// handling the case where the content script isn't loaded yet. It first tries a
// cheap toggle-ui message; if that fails because no receiver exists
// (isMissingContentScriptError), it programmatically injects the content script
// and then retries show-ui a few times, since the freshly injected script needs
// a beat to register its message listener. Benign "no response"/"port closed"
// errors are treated as success because fire-and-forget palette messages don't
// reply. This is the only path that injects the content script on demand
// (rather than via the declared content-script match patterns).
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { callBrowserAPI } from "./browser"
import {
  isMissingContentScriptError,
  isNoResponseError,
} from "./messagingErrors"

const CONTENT_SCRIPT_FILE = "content-scripts/content.js"
const MESSAGE_RETRY_DELAY_MS = 75
const MESSAGE_RETRY_ATTEMPTS = 5

type PaletteMessage =
  | { type: "monocle-ui-toggle" }
  | { type: "monocle-ui-show" }

export async function toggleContentPalette(tabId: number): Promise<void> {
  const didToggle = await sendPaletteMessage(tabId, {
    type: "monocle-ui-toggle",
  })
  if (didToggle) {
    return
  }

  const didInject = await injectContentPalette(tabId)
  if (!didInject) {
    return
  }

  await sendPaletteMessageWithRetries(tabId, { type: "monocle-ui-show" })
}

async function sendPaletteMessageWithRetries(
  tabId: number,
  message: PaletteMessage,
): Promise<boolean> {
  for (let attempt = 0; attempt < MESSAGE_RETRY_ATTEMPTS; attempt++) {
    if (await sendPaletteMessage(tabId, message, { quiet: true })) {
      return true
    }

    await wait(MESSAGE_RETRY_DELAY_MS)
  }

  console.error(
    "[Background] Could not send palette message after injecting content script",
  )
  return false
}

async function sendPaletteMessage(
  tabId: number,
  message: PaletteMessage,
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  try {
    await callBrowserAPI("tabs", "sendMessage", tabId, message)
    return true
  } catch (error) {
    if (isNoResponseError(error)) {
      return true
    }

    if (!options.quiet && !isMissingContentScriptError(error)) {
      console.error("[Background] Could not send palette message:", error)
    }

    return false
  }
}

async function injectContentPalette(tabId: number): Promise<boolean> {
  const browserAPI = getBrowserAPI()

  if (!browserAPI.scripting?.executeScript) {
    console.error("[Background] scripting.executeScript is unavailable")
    return false
  }

  try {
    await callBrowserAPI("scripting", "executeScript", {
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    })
    return true
  } catch (error) {
    console.error("[Background] Could not inject content palette:", error)
    return false
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
