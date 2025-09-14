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

addRuntimeListener(
  createCrossBrowserMessageHandler((message, sender) =>
    handleMessage(message, sender),
  ),
)

// Handle toolbar icon clicks
if (browserAPI.action) {
  browserAPI.action.onClicked.addListener((tab) => {
    // Send toggle message to active tab
    if (tab?.id) {
      browserAPI.tabs
        .sendMessage(tab.id, { type: "toggle-ui" })
        .catch((error) => {
          console.error(
            "[Background] Could not send toggle message to tab:",
            error,
          )
        })
    }
  })
}

// Handle browser-level keyboard shortcuts
if (browserAPI.commands) {
  browserAPI.commands.onCommand.addListener((command) => {
    if (command === "toggle-command-palette") {
      // Send toggle message to active tab
      getActiveTab().then((activeTab) => {
        if (activeTab) {
          browserAPI.tabs
            .sendMessage(activeTab.id, { type: "toggle-ui" })
            .catch((error) => {
              console.error(
                "[Background] Could not send toggle message to tab:",
                error,
              )
            })
        }
      })
    }
  })
}
