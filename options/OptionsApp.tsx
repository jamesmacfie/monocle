import { useEffect, useMemo } from "react"
import { Provider } from "react-redux"
import { Redirect, Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"
import { ToastContainer } from "../shared/components/ToastContainer"
import { createAppStore } from "../shared/store"
import { useAppDispatch, useAppSelector } from "../shared/store/hooks"
import { createPaletteSendMessage } from "../shared/store/sendMessage"
import {
  loadSettings,
  selectThemeMode,
} from "../shared/store/slices/settings.slice"
import { loadSettingsCatalog } from "../shared/store/slices/settingsCatalog.slice"
import { getBrowserAPI } from "../shared/utils/extension-api"
import {
  applyThemeToDocument,
  setupSystemThemeListener,
} from "../shared/utils/theme"
import { OptionsShell } from "./components/OptionsShell"
import { TooltipProvider } from "./components/ui"
import { AboutPage } from "./pages/AboutPage"
import { CommandsPage } from "./pages/CommandsPage"
import { FavoritesPage } from "./pages/FavoritesPage"
import { GeneralPage } from "./pages/GeneralPage"
import { KeyboardPage } from "./pages/KeyboardPage"
import { NewTabPage } from "./pages/NewTabPage"
import { UrlRulesPage } from "./pages/UrlRulesPage"

const browserAPI = getBrowserAPI()

function OptionsAppContent() {
  const dispatch = useAppDispatch()
  const themeMode = useAppSelector(selectThemeMode)

  useEffect(() => {
    dispatch(loadSettings())
    dispatch(loadSettingsCatalog())
  }, [dispatch])

  useEffect(() => {
    applyThemeToDocument(themeMode)
  }, [themeMode])

  useEffect(() => {
    if (themeMode === "system") {
      return setupSystemThemeListener(() => applyThemeToDocument(themeMode))
    }
  }, [themeMode])

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, unknown>,
      areaName: string,
    ) => {
      if (areaName !== "local") {
        return
      }

      if ("monocle-settings" in changes) {
        dispatch(loadSettings())
        dispatch(loadSettingsCatalog())
      }

      if (
        "monocle-favoriteCommandIds" in changes ||
        "monocle-commandUsage" in changes
      ) {
        dispatch(loadSettingsCatalog())
      }
    }

    browserAPI.storage?.onChanged?.addListener(handleStorageChange)
    return () => {
      browserAPI.storage?.onChanged?.removeListener(handleStorageChange)
    }
  }, [dispatch])

  return (
    <TooltipProvider delayDuration={250}>
      <OptionsShell>
        <Switch>
          <Route path="/" component={GeneralPage} />
          <Route path="/new-tab" component={NewTabPage} />
          <Route path="/commands" component={CommandsPage} />
          <Route path="/favorites" component={FavoritesPage} />
          <Route path="/keyboard" component={KeyboardPage} />
          <Route path="/url-rules" component={UrlRulesPage} />
          <Route path="/about" component={AboutPage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </OptionsShell>
      <ToastContainer />
    </TooltipProvider>
  )
}

export default function OptionsApp() {
  const sendMessage = useMemo(() => createPaletteSendMessage(), [])
  const store = useMemo(() => createAppStore(sendMessage), [sendMessage])

  return (
    <Provider store={store}>
      <Router hook={useHashLocation}>
        <OptionsAppContent />
      </Router>
    </Provider>
  )
}
