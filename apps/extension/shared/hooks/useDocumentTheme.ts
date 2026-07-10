import { useEffect } from "react"
import type { ThemeMode } from "../types"
import { applyThemeToDocument, setupSystemThemeListener } from "../utils/theme"

export const useDocumentTheme = (themeMode: ThemeMode): void => {
  useEffect(() => {
    applyThemeToDocument(themeMode)
  }, [themeMode])

  useEffect(() => {
    if (themeMode === "system") {
      return setupSystemThemeListener(() => applyThemeToDocument(themeMode))
    }
  }, [themeMode])
}
