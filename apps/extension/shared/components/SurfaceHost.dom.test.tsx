// @vitest-environment jsdom
//
// The SurfaceHost renders a `modal` surface (the QR-code command's output) over
// the page and reports a `dismiss` surface-action when closed. Mounted in both
// the closed content shadow root and the new tab, so it must work in plain DOM.
import { fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Surface } from "../types"

const sendRuntimeMessageSafe = vi.fn()

vi.mock("../utils/extension-api", () => ({
  sendRuntimeMessageSafe: (msg: unknown) => sendRuntimeMessageSafe(msg),
  getBrowserAPI: () => ({
    runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
  }),
}))

vi.mock("../../content/utils/spaNavigation", () => ({
  trackSpaNavigation: () => () => {},
}))

import { SurfaceHost } from "./SurfaceHost"

const modal: Surface = {
  id: "qr",
  ownerId: "command:url-as-qr-code",
  kind: "modal",
  content: {
    title: "QR code",
    text: "https://example.com",
    blocks: [{ type: "image", dataUrl: "data:image/svg+xml;utf8,%3Csvg%3E" }],
  },
}

// get-surfaces returns the modal; surface-action resolves.
const respond = (surfaces: Surface[]) =>
  sendRuntimeMessageSafe.mockImplementation((msg: { type: string }) =>
    msg.type === "get-surfaces"
      ? Promise.resolve({ surfaces })
      : Promise.resolve({ ok: true }),
  )

afterEach(() => {
  sendRuntimeMessageSafe.mockReset()
  document.body.replaceChildren()
})

describe("SurfaceHost modal", () => {
  it("renders a modal surface's image block, title, and url", async () => {
    respond([modal])
    const { container } = render(<SurfaceHost kinds={["overlay", "modal"]} />)

    const img = await waitFor(() => {
      const el = container.querySelector("img")
      if (!el) throw new Error("no image yet")
      return el
    })
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;utf8,%3Csvg%3E")
    // Title (DialogTitle) and the url (DialogDescription).
    expect(container.textContent).toContain("QR code")
    expect(container.textContent).toContain("https://example.com")
  })

  it("does not render a modal when the host does not own that kind", async () => {
    respond([modal])
    const { container } = render(<SurfaceHost kinds={["badge"]} />)
    // Give the async refresh a tick; nothing of the modal should appear.
    await waitFor(() => expect(sendRuntimeMessageSafe).toHaveBeenCalled())
    expect(container.querySelector("img")).toBeNull()
  })

  it("reports a dismiss surface-action when the close button is pressed", async () => {
    respond([modal])
    const { container } = render(<SurfaceHost kinds={["modal"]} />)
    const closeButton = await waitFor(() => {
      const el = container.querySelector('[aria-label="Close"]')
      if (!el) throw new Error("no close button yet")
      return el
    })
    fireEvent.click(closeButton)
    expect(sendRuntimeMessageSafe).toHaveBeenCalledWith({
      type: "surface-action",
      ownerId: "command:url-as-qr-code",
      surfaceId: "qr",
      actionId: "dismiss",
    })
  })

  it("reports a dismiss surface-action on Escape", async () => {
    respond([modal])
    const { container } = render(<SurfaceHost kinds={["modal"]} />)
    await waitFor(() => {
      if (!container.querySelector("img")) throw new Error("no image yet")
    })
    fireEvent.keyDown(document, { key: "Escape" })
    expect(sendRuntimeMessageSafe).toHaveBeenCalledWith({
      type: "surface-action",
      ownerId: "command:url-as-qr-code",
      surfaceId: "qr",
      actionId: "dismiss",
    })
  })
})
