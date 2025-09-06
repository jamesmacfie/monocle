import { useEffect, useMemo } from "react"
import { Provider } from "react-redux"
import { ToastContainer } from "../shared/components/ToastContainer"
import { createAppStore } from "../shared/store"
import { useAppDispatch, useAppSelector } from "../shared/store/hooks"
import {
  loadSettings,
  selectClockVisibility,
} from "../shared/store/slices/settings.slice"
import { Clock } from "./components/Clock"
import { NewTabCommandPalette } from "./components/NewTabCommandPalette"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

function NewTabAppContent() {
  const showClock = useAppSelector(selectClockVisibility)
  const dispatch = useAppDispatch()

  // Load initial settings on mount
  useEffect(() => {
    dispatch(loadSettings())
  }, [dispatch])

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
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        {showClock && <Clock className="mb-12" />}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Monocle</h1>
          <p className="text-gray-600">Command palette for the web</p>
        </div>

        <div className="raycast new-tab-palette">
          <NewTabCommandPalette autoFocus={true} className="w-full" />
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            Press{" "}
            <kbd className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
              Cmd+Shift+K
            </kbd>{" "}
            on any webpage to open the command palette
          </p>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}

export default function NewTabApp() {
  // Create Redux store for the entire app
  const store = useMemo(() => createAppStore(), [])

  return (
    <Provider store={store}>
      <NewTabAppContent />
    </Provider>
  )
}
