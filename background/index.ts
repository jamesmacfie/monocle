console.log("[Background] Loading background script...");

import { handleMessage } from "./messages";
import { addRuntimeListener, createCrossBrowserMessageHandler } from "./utils/runtime";
import { initializeKeybindingRegistry } from "./keybindings/registry";

console.log("[Background] Imports loaded, initializing...");

// Initialize keybinding registry on startup
initializeKeybindingRegistry().catch(console.error);

console.log("[Background] Setting up message listener...");
addRuntimeListener(
  createCrossBrowserMessageHandler(handleMessage)
);

console.log("[Background] Background script initialization complete");

