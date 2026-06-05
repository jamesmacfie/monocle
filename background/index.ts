import { getBrowserAPI } from "../shared/utils/extension-api"
import { initializeKeybindingRegistry } from "./keybindings/registry"
import { handleMessage } from "./messages"
import { toggleContentPalette } from "./utils/contentPalette"
import {
  addRuntimeListener,
  createCrossBrowserMessageHandler,
} from "./utils/runtime"

export function initializeBackground() {
  const browserAPI = getBrowserAPI()

  // Initialize keybinding registry on startup
  initializeKeybindingRegistry().catch(console.error)

  addRuntimeListener(
    createCrossBrowserMessageHandler((message, sender) =>
      handleMessage(message, sender),
    ),
  )

  // Handle toolbar icon clicks
  if (browserAPI.action) {
    browserAPI.action.onClicked.addListener((tab) => {
      if (tab?.id) {
        toggleContentPalette(tab.id).catch((error) => {
          console.error("[Background] Could not toggle command palette:", error)
        })
      }
    })
  }
}
