import "../content/styles.css"

import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root"
import { defineContentScript } from "wxt/utils/define-content-script"
import { renderContentCommandPalette } from "../content/scripts"
import { initializeSiteSdkBridge } from "../content/siteSdkBridge"
import type { Settings } from "../shared/types"
import { getBrowserAPI } from "../shared/utils/extension-api"
import { applyThemeToHost } from "../shared/utils/theme"

type MountedPalette = () => void

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "manifest",
  cssInjectionMode: "ui",
  async main(ctx) {
    initializeSiteSdkBridge()
    await waitForBody()

    const ui = await createShadowRootUi<MountedPalette>(ctx, {
      name: "monocle-command-palette",
      position: "inline",
      anchor: "body",
      mode: "closed",
      onMount: (container, _shadow, shadowHost) => {
        shadowHost.id = "extension-root"

        const browserAPI = getBrowserAPI()
        const applyTheme = (settings?: Settings) => {
          applyThemeToHost(shadowHost, settings)
        }

        browserAPI.storage?.local
          ?.get("monocle-settings")
          .then((result: Record<string, unknown>) => {
            applyTheme(
              (result["monocle-settings"] as Settings | undefined) || {},
            )
          })
          .catch((error: unknown) => {
            console.error("[content] Failed to load theme settings:", error)
          })

        const handleStorageChange = (
          changes: Record<string, { newValue?: unknown } | undefined>,
          areaName: string,
        ) => {
          if (areaName === "local" && changes["monocle-settings"]) {
            applyTheme(
              (changes["monocle-settings"].newValue as Settings | undefined) ||
                {},
            )
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
