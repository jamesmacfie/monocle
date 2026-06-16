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
