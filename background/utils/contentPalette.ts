import { getBrowserAPI } from "../../shared/utils/extension-api"
import { callBrowserAPI } from "./browser"

const CONTENT_SCRIPT_FILE = "content-scripts/content.js"
const MESSAGE_RETRY_DELAY_MS = 75
const MESSAGE_RETRY_ATTEMPTS = 5

type PaletteMessage = { type: "toggle-ui" } | { type: "show-ui" }

export async function toggleContentPalette(tabId: number): Promise<void> {
  const didToggle = await sendPaletteMessage(tabId, { type: "toggle-ui" })
  if (didToggle) {
    return
  }

  const didInject = await injectContentPalette(tabId)
  if (!didInject) {
    return
  }

  await sendPaletteMessageWithRetries(tabId, { type: "show-ui" })
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

function isMissingContentScriptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes("Could not establish connection") ||
    message.includes("Receiving end does not exist")
  )
}

function isNoResponseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return message.includes(
    "The message port closed before a response was received",
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
