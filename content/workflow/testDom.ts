// Architecture: content layer (test-only). Shared linkedom-based DOM
// fixture for workflow executor tests. Stubs the globals the executor and
// its op modules read (window/document/MouseEvent/NodeFilter, geometry and
// computed-style hooks driven by data- attributes) so step semantics can be
// asserted without a browser. Import from *.test.ts files only.
import { parseHTML } from "linkedom"
import { vi } from "vitest"

export const visibleRect = {
  x: 0,
  y: 0,
  top: 0,
  right: 100,
  bottom: 20,
  left: 0,
  width: 100,
  height: 20,
}

export const zeroRect = {
  ...visibleRect,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
}

export const installDom = (
  html: string,
  {
    url = "https://example.com/workflow-target",
    readyState = "complete",
  }: { url?: string; readyState?: DocumentReadyState } = {},
) => {
  const { window, document } = parseHTML(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
  )

  class TestMouseEvent extends window.Event {
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type, init)

      for (const [key, value] of Object.entries(init)) {
        Object.defineProperty(this, key, {
          value,
          enumerable: true,
        })
      }
    }
  }

  Object.defineProperty(window, "location", {
    value: { href: url },
    configurable: true,
  })
  Object.defineProperty(document, "readyState", {
    value: readyState,
    configurable: true,
  })
  Object.defineProperty(window, "MouseEvent", {
    value: TestMouseEvent,
    configurable: true,
  })
  Object.defineProperty(window, "NodeFilter", {
    value: { SHOW_TEXT: 4 },
    configurable: true,
  })
  Object.defineProperty(window.Element.prototype, "getBoundingClientRect", {
    value(this: Element) {
      return this.getAttribute("data-zero") === "true" ? zeroRect : visibleRect
    },
    configurable: true,
  })
  Object.defineProperty(window.Element.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  })

  const getComputedStyle = (element: Element) => ({
    display: element.getAttribute("data-hidden") === "true" ? "none" : "block",
    visibility:
      element.getAttribute("data-invisible") === "true" ? "hidden" : "visible",
  })

  Object.defineProperty(window, "getComputedStyle", {
    value: getComputedStyle,
    configurable: true,
  })

  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
  vi.stubGlobal("MouseEvent", TestMouseEvent)
  vi.stubGlobal("NodeFilter", window.NodeFilter)

  return { window, document }
}
