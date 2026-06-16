// Architecture: background layer root. initializeBackground() is the MV3
// service worker's startup: keybinding registry, search-index warm/invalidate
// wiring, the runtime message listener routing through background/messages,
// tab listeners for site-SDK scope cleanup, the automation command bridge +
// scheduled-trigger alarms, and the toolbar action. Called once from
// entrypoints/background.ts.
import { getBrowserAPI } from "../shared/utils/extension-api"
import { initializeAutomationAlarms } from "./automations/alarms"
import { registerAutomationCommandBridge } from "./automations/engine"
import { executeCommand } from "./commands"
import {
  forgetActivatedTab,
  recordActivatedTab,
} from "./commands/browser/tabActivationHistory"
import { resolveCommandById } from "./commands/query"
import {
  initializeSearchIndexInvalidation,
  invalidateSearchIndex,
  warmSearchIndex,
} from "./commands/searchIndex"
import { clearSiteSdkScopesForTab } from "./commands/siteSdk"
import { initFeatures } from "./features"
import { initializeKeybindingRegistry } from "./keybindings/registry"
import { initializeKeybindingEntriesInvalidation } from "./keybindings/source"
import { handleMessage } from "./messages"
import { initSurfaces } from "./surfaces"
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
  initializeKeybindingEntriesInvalidation()
  warmSearchIndex()

  // Automations: inject the command bridge (keeps the automations <->
  // commands module graph acyclic — see background/automations/engine.ts)
  // and arm scheduled triggers.
  registerAutomationCommandBridge({
    resolveCommandMeta: async (commandId, context) => {
      const resolved = await resolveCommandById(commandId, context)
      if (!resolved) {
        return { exists: false, confirmAction: false }
      }
      const { command } = resolved
      const confirmAction =
        (command.type === "action" || command.type === "submit") &&
        command.confirmAction === true
      return { exists: true, confirmAction }
    },
    executeCommand: async (commandId, context) => {
      await executeCommand(commandId, context, {})
    },
  })
  initializeAutomationAlarms()

  // Surfaces: drop per-session (automation) surfaces from a previous session
  // before features rebuild their own. See docs/surfaces.md.
  initSurfaces().catch(console.error)

  // Feature modules: run startup lifecycle hooks (e.g. Focus Mode re-arms its
  // session-end alarm and rebuilds its surfaces). See docs/features.md.
  initFeatures().catch(console.error)

  browserAPI.tabs?.onRemoved?.addListener((tabId: number) => {
    forgetActivatedTab(tabId)

    if (clearSiteSdkScopesForTab(tabId)) {
      invalidateSearchIndex()
    }
  })

  browserAPI.tabs?.onActivated?.addListener(({ tabId }: { tabId: number }) => {
    recordActivatedTab(tabId)
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
