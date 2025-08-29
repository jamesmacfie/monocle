console.log("[Background] Loading background script...")

import { initializeKeybindingRegistry } from "./keybindings/registry"
import { handleMessage } from "./messages"
import { getActiveTab } from "./utils/browser"
import {
  addRuntimeListener,
  createCrossBrowserMessageHandler,
} from "./utils/runtime"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

// Initialize keybinding registry on startup
initializeKeybindingRegistry().catch(console.error)

addRuntimeListener(createCrossBrowserMessageHandler(handleMessage))

// Handle browser-level keyboard shortcuts
if (browserAPI.commands) {
  browserAPI.commands.onCommand.addListener((command) => {
    console.log("[Background] Browser command triggered:", command)

    if (command === "toggle-command-palette") {
      // Send toggle message to active tab
      getActiveTab().then((activeTab) => {
        if (activeTab) {
          browserAPI.tabs
            .sendMessage(activeTab.id, { type: "toggle-ui" })
            .catch((error) => {
              console.debug(
                "[Background] Could not send toggle message to tab:",
                error,
              )
            })
        }
      })
    }
  })
}
