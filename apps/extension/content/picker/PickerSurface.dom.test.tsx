// @vitest-environment jsdom
//
// Architecture: content layer (tests). PickerSurface owns the page-level event
// capture while a picker surface is active. It must suppress page gestures before
// they reach app handlers, then report the clicked element through its callback.
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Surface } from "../../shared/types"
import { PickerSurface } from "./PickerSurface"

const pickerSurface: Surface = {
  id: "picker",
  ownerId: "element-hider",
  kind: "picker",
  content: { title: "Pick" },
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe("PickerSurface", () => {
  it("suppresses early page pointer handlers while pick-mode is active", () => {
    const pageButton = document.createElement("button")
    pageButton.id = "danger"
    document.body.appendChild(pageButton)
    const pageHandler = vi.fn()
    pageButton.addEventListener("mousedown", pageHandler)

    render(
      <PickerSurface
        surface={pickerSurface}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.mouseDown(pageButton)

    expect(pageHandler).not.toHaveBeenCalled()
  })

  it("reports the clicked page element as a selection", () => {
    const pageButton = document.createElement("button")
    pageButton.id = "danger"
    pageButton.textContent = "Delete"
    document.body.appendChild(pageButton)
    const onPick = vi.fn()

    render(
      <PickerSurface
        surface={pickerSurface}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(pageButton)

    expect(onPick).toHaveBeenCalledWith(
      pickerSurface,
      expect.objectContaining({
        selector: "#danger",
        tagName: "BUTTON",
        innerText: "Delete",
      }),
    )
  })

  it("highlights the page element under pointer hover", () => {
    const pageButton = document.createElement("button")
    pageButton.id = "danger"
    document.body.appendChild(pageButton)
    vi.spyOn(pageButton, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 10,
      top: 10,
      left: 20,
      right: 120,
      bottom: 50,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    })
    const { container } = render(
      <PickerSurface
        surface={pickerSurface}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.pointerMove(pageButton)

    const highlight = container.querySelector("[data-monocle-picker-highlight]")
    expect(highlight).toBeTruthy()
    if (!(highlight instanceof HTMLElement)) {
      throw new Error("Expected picker highlight to render")
    }
    expect(highlight.style.top).toBe("10px")
    expect(highlight.style.left).toBe("20px")
    expect(highlight.style.width).toBe("100px")
    expect(highlight.style.height).toBe("40px")
  })

  it("captures computed css for the properties the surface requests", () => {
    const heading = document.createElement("h1")
    heading.id = "title"
    heading.style.fontFamily = "Inter, sans-serif"
    heading.style.fontSize = "32px"
    document.body.appendChild(heading)
    const onPick = vi.fn()
    const surface: Surface = {
      ...pickerSurface,
      content: { ...pickerSurface.content, css: ["font-family", "font-size"] },
    }

    render(
      <PickerSurface surface={surface} onPick={onPick} onCancel={vi.fn()} />,
    )

    fireEvent.click(heading)

    expect(onPick).toHaveBeenCalledWith(
      surface,
      expect.objectContaining({
        css: expect.objectContaining({
          "font-family": "Inter, sans-serif",
          "font-size": "32px",
        }),
      }),
    )
  })
})
