// Add type declaration for webpack hot module replacement
declare global {
  interface Window {
    wrappedJSObject?: any // Firefox specific property
  }
}

import React from "react"
import ReactDOM from "react-dom/client"
import { ContentCommandPaletteWithState } from "./components/ContentCommandPaletteWithState"

let unmount: () => void

if (import.meta.webpackHot) {
  import.meta.webpackHot?.accept()
  import.meta.webpackHot?.dispose(() => unmount?.())
}

// Run as early as possible
initializeExtension()

function initializeExtension() {
  // If document is already interactive or complete, initialize immediately
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    initial().then((cleanup) => {
      unmount = cleanup || (() => {})
    })
  } else {
    // Otherwise wait for DOMContentLoaded which fires earlier than readyState complete
    document.addEventListener("DOMContentLoaded", () => {
      initial().then((cleanup) => {
        unmount = cleanup || (() => {})
      })
    })
  }
}

async function initial() {
  // Create a new div element and append it to the document's body
  const rootDiv = document.createElement("div")
  rootDiv.id = "extension-root"
  document.body.appendChild(rootDiv)

  // Injecting content_scripts inside a shadow dom with Firefox compatibility
  try {
    const shadowRoot = rootDiv.attachShadow({ mode: "closed" })

    // Use traditional style element approach instead of adoptedStyleSheets for Firefox compatibility
    const styleElement = document.createElement("style")
    shadowRoot.appendChild(styleElement)

    fetchCSS().then((response) => {
      styleElement.textContent = response
    })

    if (import.meta.webpackHot) {
      import.meta.webpackHot?.accept("./styles.css", () => {
        fetchCSS().then((response) => {
          styleElement.textContent = response
        })
      })
    }

    // Get theme settings and apply class to the shadow root
    chrome.storage.local.get("monocle-settings", (result) => {
      const settings = result["monocle-settings"] || {}
      const themeMode = settings.theme?.mode || "system"

      // Apply theme class using :host selector support
      if (themeMode === "dark") {
        shadowRoot.host.classList.add("dark")
      } else if (themeMode === "system") {
        shadowRoot.host.classList.add("system")
      }
    })

    // Listen for theme changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes["monocle-settings"]) {
        const newSettings = changes["monocle-settings"].newValue || {}
        const themeMode = newSettings.theme?.mode || "system"

        // Update theme class
        shadowRoot.host.classList.remove("dark", "system")
        if (themeMode === "dark") {
          shadowRoot.host.classList.add("dark")
        } else if (themeMode === "system") {
          shadowRoot.host.classList.add("system")
        }
      }
    })

    const mountingPoint = ReactDOM.createRoot(shadowRoot)

    mountingPoint.render(
      React.createElement("div", { className: "content_script raycast" }, [
        React.createElement(ContentCommandPaletteWithState, { key: "palette" }),
      ]),
    )

    return () => {
      mountingPoint.unmount()
      rootDiv.remove()
    }
  } catch (e) {
    console.error("[content] Error setting up shadow DOM:", e)
    return () => {
      rootDiv.remove()
    }
  }
}

async function fetchCSS() {
  const cssUrl = new URL("./styles.css", import.meta.url)
  const response = await fetch(cssUrl)
  const text = await response.text()
  return response.ok ? text : Promise.reject(text)
}
