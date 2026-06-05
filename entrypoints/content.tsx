import "../content/styles.css"

import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root"
import { defineContentScript } from "wxt/utils/define-content-script"
import { renderContentCommandPalette } from "../content/scripts"
import { getBrowserAPI } from "../shared/utils/extension-api"

type MountedPalette = () => void

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "manifest",
  cssInjectionMode: "ui",
  async main(ctx) {
    await waitForBody()

    const ui = await createShadowRootUi<MountedPalette>(ctx, {
      name: "monocle-command-palette",
      position: "inline",
      anchor: "body",
      mode: "closed",
      onMount: (container, _shadow, shadowHost) => {
        shadowHost.id = "extension-root"

        const browserAPI = getBrowserAPI()
        const applyTheme = (settings: any) => {
          const themeMode = settings?.theme?.mode || "system"

          shadowHost.classList.remove("dark", "system")
          if (themeMode === "dark") {
            shadowHost.classList.add("dark")
          } else if (themeMode === "system") {
            shadowHost.classList.add("system")
          }
        }

        browserAPI.storage?.local
          ?.get("monocle-settings")
          .then((result: Record<string, any>) => {
            applyTheme(result["monocle-settings"] || {})
          })
          .catch((error: unknown) => {
            console.error("[content] Failed to load theme settings:", error)
          })

        const handleStorageChange = (changes: any, areaName: string) => {
          if (areaName === "local" && changes["monocle-settings"]) {
            applyTheme(changes["monocle-settings"].newValue || {})
          }
        }

        browserAPI.storage?.onChanged?.addListener(handleStorageChange)
        const unmountPalette = renderContentCommandPalette(container)

        return () => {
          browserAPI.storage?.onChanged?.removeListener(handleStorageChange)
          unmountPalette()
        }
      },
      onRemove: (unmountPalette) => {
        unmountPalette?.()
      },
    })

    ui.mount()
  },
})

function waitForBody(): Promise<void> {
  if (document.body) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    })
  })
}
