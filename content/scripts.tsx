import React from "react"
import ReactDOM from "react-dom/client"
import { ContentCommandPaletteWithState } from "./components/ContentCommandPaletteWithState"

export function renderContentCommandPalette(container: HTMLElement) {
  const mountingPoint = ReactDOM.createRoot(container)

  mountingPoint.render(
    React.createElement("div", { className: "content_script raycast" }, [
      React.createElement(ContentCommandPaletteWithState, { key: "palette" }),
    ]),
  )

  return () => {
    mountingPoint.unmount()
  }
}
