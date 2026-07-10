// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Surface } from "../../shared/types"
import { mountInlineSurface } from "./inlineSurfaceController"

const surface = (
  position: "before" | "prepend" | "append" | "after",
): Surface => ({
  id: `s-${position}`,
  ownerId: "automation:a",
  kind: "inline",
  placement: { selector: "#anchor", position },
  actions: [{ id: "run", label: "Run" }],
  content: { text: "Monocle" },
})

const frameQueue = () => {
  const callbacks: FrameRequestCallback[] = []
  return {
    requestFrame: (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    },
    flush: () => callbacks.splice(0).forEach((callback) => callback(0)),
  }
}

afterEach(() => document.body.replaceChildren())

describe("inline surface controller", () => {
  it.each(["before", "prepend", "append", "after"] as const)(
    "mounts with %s placement in a closed shadow host",
    (position) => {
      const wrapper = document.createElement("div")
      wrapper.innerHTML = '<span id="anchor"><i>existing</i></span>'
      document.body.append(wrapper)
      const frames = frameQueue()
      const cleanup = mountInlineSurface({
        surface: surface(position) as never,
        onAction: vi.fn(),
        requestFrame: frames.requestFrame,
      })
      frames.flush()
      const host = document.querySelector("monocle-inline-surface")
      const anchor = document.querySelector("#anchor") as HTMLElement
      expect(host).not.toBeNull()
      expect(host?.shadowRoot).toBeNull()
      if (position === "before") expect(host?.nextSibling).toBe(anchor)
      if (position === "after") expect(anchor.nextSibling).toBe(host)
      if (position === "prepend") expect(anchor.firstChild).toBe(host)
      if (position === "append") expect(anchor.lastChild).toBe(host)
      cleanup()
      expect(document.querySelector("monocle-inline-surface")).toBeNull()
    },
  )

  it("waits for a late target and remounts after SPA replacement", () => {
    const frames = frameQueue()
    let observerCallback: MutationCallback = () => undefined
    const disconnect = vi.fn()
    const cleanup = mountInlineSurface({
      surface: surface("after") as never,
      onAction: vi.fn(),
      requestFrame: frames.requestFrame,
      createObserver: (callback) => {
        observerCallback = callback
        return { observe: vi.fn(), disconnect } as unknown as MutationObserver
      },
    })
    frames.flush()
    expect(document.querySelector("monocle-inline-surface")).toBeNull()

    document.body.innerHTML = '<div id="anchor"></div>'
    observerCallback([], {} as MutationObserver)
    frames.flush()
    const first = document.querySelector("monocle-inline-surface")
    expect(first).not.toBeNull()

    document.body.innerHTML = '<div id="anchor"></div>'
    observerCallback([], {} as MutationObserver)
    frames.flush()
    const second = document.querySelector("monocle-inline-surface")
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    cleanup()
    expect(disconnect).toHaveBeenCalled()
  })

  it("treats invalid selectors as an inactive recoverable state", () => {
    const frames = frameQueue()
    const invalid = surface("after")
    if (invalid.placement) invalid.placement.selector = "["
    expect(() => {
      const cleanup = mountInlineSurface({
        surface: invalid as never,
        onAction: vi.fn(),
        requestFrame: frames.requestFrame,
      })
      frames.flush()
      cleanup()
    }).not.toThrow()
  })
})
