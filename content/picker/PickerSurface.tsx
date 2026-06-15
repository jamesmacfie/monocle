// Architecture: content layer. The renderer + gesture controller for a
// `picker` surface. While a picker surface is present the host enters element
// pick-mode: it highlights the element under the cursor and, on click, resolves
// a stable selector (selector.ts) and reports the rich PickedElement back to
// the owning feature via `surface-action`. It NEVER mutates the page — the
// feature decides what the selection means. Escape (or any dismiss path)
// reports the universal `dismiss` action. Rendered by the shared SurfaceHost,
// which only passes `picker` to the content mount. See docs/surfaces.md.
import { useEffect, useState } from "react"
import type { PickedElement, Surface } from "../../shared/types"
import { describeElement } from "./selector"

const HOST_ID = "extension-root"
const HIGHLIGHT_Z = 2147483646
const HINT_Z = 2147483647

type Rect = { top: number; left: number; width: number; height: number }

// Skip our own injected UI (the closed shadow host) and non-element targets.
const isPageElement = (target: EventTarget | null): target is Element => {
  if (!(target instanceof Element)) {
    return false
  }
  if (target.id === HOST_ID || target.closest(`#${HOST_ID}`)) {
    return false
  }
  return true
}

export function PickerSurface({
  surface,
  onPick,
  onCancel,
}: {
  surface: Surface
  onPick: (surface: Surface, selection: PickedElement) => void
  onCancel: (surface: Surface) => void
}) {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    const suppressPagePointerEvent = (
      event: MouseEvent | PointerEvent,
    ): void => {
      if (!isPageElement(event.target)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const handleMove = (event: MouseEvent): void => {
      if (!isPageElement(event.target)) {
        setRect(null)
        return
      }
      const bounds = event.target.getBoundingClientRect()
      setRect({
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      })
    }

    const handleClick = (event: MouseEvent): void => {
      if (!isPageElement(event.target)) {
        return
      }
      // Capture-phase suppression so the click never activates the page
      // (links, buttons) — picking is the only effect.
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onPick(surface, describeElement(event.target))
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onCancel(surface)
      }
    }

    // Capture phase so we win over page handlers.
    document.addEventListener("mousemove", handleMove, true)
    document.addEventListener("pointerdown", suppressPagePointerEvent, true)
    document.addEventListener("pointerup", suppressPagePointerEvent, true)
    document.addEventListener("mousedown", suppressPagePointerEvent, true)
    document.addEventListener("mouseup", suppressPagePointerEvent, true)
    document.addEventListener("click", handleClick, true)
    document.addEventListener("auxclick", suppressPagePointerEvent, true)
    document.addEventListener("contextmenu", suppressPagePointerEvent, true)
    document.addEventListener("keydown", handleKeyDown, true)

    const previousCursor = document.documentElement.style.cursor
    document.documentElement.style.cursor = "crosshair"

    return () => {
      document.removeEventListener("mousemove", handleMove, true)
      document.removeEventListener(
        "pointerdown",
        suppressPagePointerEvent,
        true,
      )
      document.removeEventListener("pointerup", suppressPagePointerEvent, true)
      document.removeEventListener("mousedown", suppressPagePointerEvent, true)
      document.removeEventListener("mouseup", suppressPagePointerEvent, true)
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("auxclick", suppressPagePointerEvent, true)
      document.removeEventListener(
        "contextmenu",
        suppressPagePointerEvent,
        true,
      )
      document.removeEventListener("keydown", handleKeyDown, true)
      document.documentElement.style.cursor = previousCursor
    }
  }, [surface, onPick, onCancel])

  const title = surface.content.title ?? "Pick an element"
  const text =
    surface.content.text ?? "Click an element to select it · Esc to cancel"

  return (
    <>
      {rect ? (
        <div
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            zIndex: HIGHLIGHT_Z,
            pointerEvents: "none",
            background: "rgba(139, 92, 246, 0.25)",
            border: "2px solid #8b5cf6",
            borderRadius: 2,
            boxSizing: "border-box",
          }}
        />
      ) : null}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: HINT_Z,
          pointerEvents: "none",
          maxWidth: 420,
          padding: "10px 16px",
          borderRadius: 9999,
          background: "rgba(15, 16, 22, 0.92)",
          color: "#f5f5f7",
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 14,
        }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ marginTop: 2, opacity: 0.8, fontSize: 13 }}>{text}</div>
      </div>
    </>
  )
}
