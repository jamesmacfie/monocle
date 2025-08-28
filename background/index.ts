console.log("[Background] Loading background script...");

import { handleMessage } from "./messages";
import { addRuntimeListener, createCrossBrowserMessageHandler } from "./utils/runtime";
import { initializeKeybindingRegistry } from "./keybindings/registry";
import { getActiveTab } from "./utils/browser";

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

console.log("[Background] Imports loaded, initializing...");

// Initialize keybinding registry on startup
initializeKeybindingRegistry().catch(console.error);

console.log("[Background] Setting up message listener...");
addRuntimeListener(
  createCrossBrowserMessageHandler(handleMessage)
);

console.log("[Background] Setting up browser commands listener...");
// Handle browser-level keyboard shortcuts
if (browserAPI.commands) {
  browserAPI.commands.onCommand.addListener((command) => {
    console.log("[Background] Browser command triggered:", command);

    if (command === "toggle-command-palette") {
      // Send toggle message to active tab
      getActiveTab().then((activeTab) => {
        if (activeTab) {
          browserAPI.tabs.sendMessage(activeTab.id, { type: "toggle-ui" })
            .catch((error) => {
              console.debug("[Background] Could not send toggle message to tab:", error);
            });
        }
      })
    }
  });
}

console.log("[Background] Background script initialization complete");

