import { getBrowserAPI } from "../shared/utils/extension-api"
import {
  initializeSearchIndexInvalidation,
  invalidateSearchIndex,
  warmSearchIndex,
} from "./commands/searchIndex"
import { clearSiteSdkScopesForTab } from "./commands/siteSdk"
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

  // Wire search-index invalidation events and warm the index so the first
  // palette query after a cold start doesn't pay the full tree resolve
  initializeSearchIndexInvalidation()
  warmSearchIndex()

  browserAPI.tabs?.onRemoved?.addListener((tabId: number) => {
    if (clearSiteSdkScopesForTab(tabId)) {
      invalidateSearchIndex()
    }
  })

  browserAPI.tabs?.onUpdated?.addListener(
    (tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url && clearSiteSdkScopesForTab(tabId)) {
        invalidateSearchIndex()
      }
    },
  )

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
