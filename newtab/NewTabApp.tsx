import { useEffect, useMemo } from "react"
import { Provider } from "react-redux"
import { ToastContainer } from "../shared/components/ToastContainer"
import { createAppStore } from "../shared/store"
import { useAppDispatch, useAppSelector } from "../shared/store/hooks"
import {
  loadPermissions,
  loadSettings,
  selectClockVisibility,
  selectThemeMode,
} from "../shared/store/slices/settings.slice"
import {
  applyThemeToDocument,
  setupSystemThemeListener,
} from "../shared/utils/theme"
import { BackgroundImage } from "./components/BackgroundImage"
import { Clock } from "./components/Clock"
import { NewTabCommandPalette } from "./components/NewTabCommandPalette"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

function NewTabAppContent() {
  const showClock = useAppSelector(selectClockVisibility)
  const themeMode = useAppSelector(selectThemeMode)
  const dispatch = useAppDispatch()

  // Load initial settings and permissions on mount
  useEffect(() => {
    dispatch(loadSettings())
    dispatch(loadPermissions())
  }, [dispatch])

  // Apply theme to document root
  useEffect(() => {
    applyThemeToDocument(themeMode)
  }, [themeMode])

  // Setup system theme listener
  useEffect(() => {
    if (themeMode === "system") {
      return setupSystemThemeListener(() => {
        // Re-apply theme when system preference changes
        applyThemeToDocument(themeMode)
      })
    }
  }, [themeMode])

  // Listen for storage changes and reload settings
  useEffect(() => {
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === "local" && changes["monocle-settings"]) {
        dispatch(loadSettings())
      }
    }

    if (browserAPI?.storage?.onChanged) {
      browserAPI.storage.onChanged.addListener(handleStorageChange)
      return () => {
        browserAPI.storage.onChanged.removeListener(handleStorageChange)
      }
    }
  }, [dispatch])

  return (
    <div className="min-h-screen relative">
      <BackgroundImage />
      <div className="relative z-10 p-6 flex items-center justify-center min-h-screen">
        <div className="max-w-2xl mx-auto">
          {showClock && <Clock className="mb-12" />}

          <div className="raycast new-tab-palette">
            <NewTabCommandPalette autoFocus={true} className="w-full" />
          </div>

          <div className="mt-8 text-center">
            <p className="text-white text-sm drop-shadow-lg">
              Press{" "}
              <kbd className="px-2 py-1 bg-black/20 border border-white/30 text-white rounded text-xs">
                Cmd+Shift+K
              </kbd>{" "}
              on any webpage to open the command palette
            </p>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}

export default function NewTabApp() {
  // Build a messaging function with new tab context and basic page info
  const sendMessageWithNewTab = useMemo(() => {
    return (message: any) =>
      new Promise((resolve, reject) => {
        const context = {
          title: document.title,
          url: window.location.href,
          modifierKey: null,
          isNewTab: true,
        }
        const messageWithContext = { ...message, context }
        chrome.runtime.sendMessage(messageWithContext, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })
  }, [])

  // Create Redux store for the entire app (provide messaging to thunks)
  const store = useMemo(
    () => createAppStore(sendMessageWithNewTab),
    [sendMessageWithNewTab],
  )

  return (
    <Provider store={store}>
      <NewTabAppContent />
    </Provider>
  )
}
