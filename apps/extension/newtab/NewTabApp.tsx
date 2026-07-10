import { Settings } from "lucide-react"
import { useEffect, useMemo } from "react"
import { Provider } from "react-redux"
import { PageMessageListeners } from "../shared/components/Listeners/PageMessageListeners"
import { MonocleMark } from "../shared/components/MonocleMark"
import { SurfaceHost } from "../shared/components/SurfaceHost"
import { MessageContextProvider } from "../shared/hooks/MessageContext"
import { useDocumentTheme } from "../shared/hooks/useDocumentTheme"
import { createAppStore } from "../shared/store"
import { useAppDispatch, useAppSelector } from "../shared/store/hooks"
import { createPaletteSendMessage } from "../shared/store/sendMessage"
import {
  loadPermissions,
  loadSettings,
  selectClockVisibility,
  selectThemeMode,
} from "../shared/store/slices/settings.slice"
import { getBrowserAPI, openOptionsPage } from "../shared/utils/extension-api"
import { BackgroundImage } from "./components/BackgroundImage"
import { Clock } from "./components/Clock"
import { NewTabCommandPalette } from "./components/NewTabCommandPalette"
import {
  HostPermissionGrantPanel,
  normalizeGrantHostPattern,
  normalizeGrantHostReason,
  normalizeGrantPermission,
  PermissionGrantPanel,
} from "./components/PermissionGrantPanel"
import { subscribeToNewTabSettingsChanges } from "./settingsSubscription"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()
const NEW_TAB_MESSAGE_CONTEXT = { isNewTab: true } as const

function NewTabAppContent() {
  const showClock = useAppSelector(selectClockVisibility)
  const themeMode = useAppSelector(selectThemeMode)
  const dispatch = useAppDispatch()
  const searchParams = new URLSearchParams(window.location.search)
  const grantPermission = normalizeGrantPermission(
    searchParams.get("grantPermission"),
  )
  const grantHost = normalizeGrantHostPattern(searchParams.get("grantHost"))
  const grantHostReason = normalizeGrantHostReason(
    searchParams.get("grantHostReason"),
  )
  const grantHostUrl = searchParams.get("grantHostUrl") ?? undefined
  const grantHostTabIdRaw = searchParams.get("grantHostTabId")
  const grantHostTabId = grantHostTabIdRaw
    ? Number(grantHostTabIdRaw)
    : undefined

  // Load initial settings and permissions on mount
  useEffect(() => {
    dispatch(loadSettings())
    dispatch(loadPermissions())
  }, [dispatch])

  useDocumentTheme(themeMode)

  useEffect(() => {
    const settingsChanges = browserAPI?.storage?.onChanged
    if (settingsChanges) {
      return subscribeToNewTabSettingsChanges(settingsChanges, () => {
        dispatch(loadSettings())
      })
    }
  }, [dispatch])

  return (
    <div className="min-h-screen relative">
      <BackgroundImage />
      <div className="relative z-10 p-6 flex items-center justify-center min-h-screen">
        <div className="max-w-2xl mx-auto">
          {showClock && <Clock className="mb-12" />}

          <div className="flex justify-center mb-8">
            <MonocleMark variant="full" size={72} title="Monocle" />
          </div>

          {grantPermission && (
            <PermissionGrantPanel permission={grantPermission} />
          )}
          {grantHost && (
            <HostPermissionGrantPanel
              originPattern={grantHost}
              reason={grantHostReason}
              sourceUrl={grantHostUrl}
              tabId={
                Number.isInteger(grantHostTabId) && Number(grantHostTabId) > 0
                  ? grantHostTabId
                  : undefined
              }
            />
          )}

          <div className="raycast new-tab-palette">
            <NewTabCommandPalette autoFocus={true} className="w-full" />
          </div>

          <div className="mt-8 text-center">
            <p className="text-[var(--color-fg-inverse)] text-sm drop-shadow-lg">
              Press{" "}
              <kbd className="px-2 py-1 bg-[var(--color-hero-overlay)] border border-[var(--color-hero-kbd-border)] text-[var(--color-fg-inverse)] rounded text-xs">
                Cmd+Shift+K
              </kbd>{" "}
              on any webpage to open the command palette
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          void openOptionsPage()
        }}
        aria-label="Open settings"
        title="Settings"
        className="fixed bottom-4 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,0,0,0.45)] text-white shadow-lg ring-1 ring-[rgba(255,255,255,0.25)] backdrop-blur-sm transition hover:bg-[rgba(0,0,0,0.65)] hover:scale-105"
      >
        <Settings size={18} />
      </button>
      <SurfaceHost kinds={["badge"]} />
      <PageMessageListeners />
    </div>
  )
}

export default function NewTabApp() {
  // Build a messaging function with new tab context and basic page info
  const sendMessageWithNewTab = useMemo(
    () => createPaletteSendMessage({ isNewTab: true }),
    [],
  )

  // Create Redux store for the entire app (provide messaging to thunks)
  const store = useMemo(
    () => createAppStore(sendMessageWithNewTab),
    [sendMessageWithNewTab],
  )

  return (
    <Provider store={store}>
      <MessageContextProvider value={NEW_TAB_MESSAGE_CONTEXT}>
        <NewTabAppContent />
      </MessageContextProvider>
    </Provider>
  )
}
