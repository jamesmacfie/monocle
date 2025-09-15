import type { ActionCommandNode } from "../../../shared/types"

/**
 * Example command that demonstrates URL filtering.
 * This command will only appear on localhost development environments.
 */
export const devTools: ActionCommandNode = {
  type: "action",
  id: "dev-tools",
  name: "Open Developer Tools",
  description: "Open browser developer tools (localhost only)",
  icon: { type: "lucide", name: "Code2" },
  keywords: ["console", "inspector", "debugger", "development"],
  urlRules: {
    // Only show on localhost URLs
    allowUrls: [
      "localhost:*",
      "127.0.0.1:*",
      "*://localhost/*",
      "*://127.0.0.1/*",
    ],
  },
  execute: async () => {
    // Open developer tools
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        // This requires the chrome.debugger API which may not be available
        // In a real implementation, you might use chrome.devtools or other APIs
        console.log("Opening developer tools for tab:", tabs[0].id)
        // Note: Actually opening devtools programmatically requires specific APIs
        // that may not be available in all contexts
      }
    })
  },
  keybinding: "⌘ ⌥ i",
}
