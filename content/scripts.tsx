import React from "react"
import ReactDOM from "react-dom/client"
import { SurfaceHost } from "../shared/components/SurfaceHost"
import { ContentCommandPaletteWithState } from "./components/ContentCommandPaletteWithState"

export function renderContentCommandPalette(container: HTMLElement) {
  const mountingPoint = ReactDOM.createRoot(container)

  mountingPoint.render(
    React.createElement("div", { className: "content_script raycast" }, [
      React.createElement(ContentCommandPaletteWithState, { key: "palette" }),
      // Generic surface host: renders background-owned overlays (e.g. the Focus
      // Mode hard block) and modals (e.g. the QR-code command) in the same
      // closed shadow root. See docs/surfaces.md.
      React.createElement(SurfaceHost, {
        key: "surfaces",
        kinds: ["overlay", "modal"],
      }),
    ]),
  )

  return () => {
    mountingPoint.unmount()
  }
}
