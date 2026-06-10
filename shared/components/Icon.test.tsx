import { parseHTML } from "linkedom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Icon } from "./Icon"

let container: HTMLElement
let root: Root
type LinkedomWindow = Window & {
  HTMLElement: typeof HTMLElement
  SVGElement: typeof SVGElement
  Event: typeof Event
}

let testWindow: LinkedomWindow

beforeEach(() => {
  const parsed = parseHTML("<html><body></body></html>")
  testWindow = parsed.window as unknown as LinkedomWindow

  vi.stubGlobal("window", testWindow)
  vi.stubGlobal("document", parsed.document)
  vi.stubGlobal("HTMLElement", testWindow.HTMLElement)
  vi.stubGlobal("SVGElement", testWindow.SVGElement)
  vi.stubGlobal("Event", testWindow.Event)
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  container = parsed.document.createElement("div")
  parsed.document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  vi.unstubAllGlobals()
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT
})

describe("Icon", () => {
  it("falls back to a Lucide icon when URL image rendering fails", async () => {
    await act(async () => {
      root.render(
        <Icon icon={{ type: "url", url: "https://example.com/icon.ico" }} />,
      )
    })

    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.ico")

    await act(async () => {
      img?.dispatchEvent(new testWindow.Event("error", { bubbles: true }))
    })

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("svg")).not.toBeNull()
  })
})
