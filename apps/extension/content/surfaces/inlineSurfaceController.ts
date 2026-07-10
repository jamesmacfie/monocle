import type { Surface } from "../../shared/types"

type InlineSurface = Surface & {
  kind: "inline"
  placement: NonNullable<Surface["placement"]>
  actions: NonNullable<Surface["actions"]>
}

export type InlineSurfaceActionResult =
  | { success: true }
  | { success: false; error?: string }

export type InlineSurfaceControllerOptions = {
  surface: InlineSurface
  onAction: (actionId: string) => Promise<InlineSurfaceActionResult>
  document?: Document
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
  createObserver?: (callback: MutationCallback) => MutationObserver
}

const HOST_TAG = "monocle-inline-surface"

const styleText = `
:host { all: initial; contain: content; display: inline-flex; margin: 4px; vertical-align: middle; }
.root { align-items: center; background: #18181b; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.24); color: #fafafa; display: inline-flex; font: 500 13px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; gap: 6px; padding: 5px; }
.copy { display: grid; gap: 2px; padding: 0 4px; }
.title { font-weight: 650; }
.text,.error { color: #a1a1aa; font-size: 11px; }
.error { color: #fca5a5; max-width: 260px; }
button { appearance: none; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #fafafa; cursor: pointer; font: inherit; padding: 6px 9px; }
button:hover:not(:disabled) { background: #3f3f46; }
button[data-style="primary"] { background: #7c3aed; border-color: #8b5cf6; }
button[data-style="danger"] { background: #991b1b; border-color: #b91c1c; }
button:disabled { cursor: wait; opacity: .55; }
`

const isInlineSurface = (surface: Surface): surface is InlineSurface =>
  surface.kind === "inline" &&
  surface.placement !== undefined &&
  surface.actions !== undefined

const insertHost = (
  host: HTMLElement,
  anchor: Element,
  position: InlineSurface["placement"]["position"],
): void => {
  if (position === "before") anchor.before(host)
  else if (position === "prepend") anchor.prepend(host)
  else if (position === "append") anchor.append(host)
  else anchor.after(host)
}

const isCorrectlyPlaced = (
  host: HTMLElement,
  anchor: Element,
  position: InlineSurface["placement"]["position"],
): boolean => {
  if (!host.isConnected) return false
  if (position === "before") return host.nextSibling === anchor
  if (position === "prepend") return anchor.firstChild === host
  if (position === "append") return anchor.lastChild === host
  return anchor.nextSibling === host
}

const renderHost = (
  host: HTMLElement,
  surface: InlineSurface,
  onAction: InlineSurfaceControllerOptions["onAction"],
): void => {
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = styleText
  const root = document.createElement("div")
  root.className = "root"

  if (surface.content.title || surface.content.text) {
    const copy = document.createElement("div")
    copy.className = "copy"
    if (surface.content.title) {
      const title = document.createElement("span")
      title.className = "title"
      title.textContent = surface.content.title
      copy.append(title)
    }
    if (surface.content.text) {
      const text = document.createElement("span")
      text.className = "text"
      text.textContent = surface.content.text
      copy.append(text)
    }
    root.append(copy)
  }

  const error = document.createElement("span")
  error.className = "error"
  error.hidden = true
  const buttons: HTMLButtonElement[] = []
  surface.actions.forEach((action) => {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.style = action.style ?? "default"
    button.textContent = action.label
    button.addEventListener("pointerdown", (event) => event.stopPropagation())
    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (buttons.some((entry) => entry.disabled)) return
      buttons.forEach((entry) => {
        entry.disabled = true
      })
      error.hidden = true
      void onAction(action.id)
        .then((result) => {
          if (!result.success) {
            error.textContent =
              result.error ?? "This Monocle action could not be completed."
            error.hidden = false
          }
        })
        .catch(() => {
          error.textContent = "This Monocle action could not be completed."
          error.hidden = false
        })
        .finally(() => {
          buttons.forEach((entry) => {
            entry.disabled = false
          })
        })
    })
    buttons.push(button)
    root.append(button)
  })
  root.append(error)
  shadow.append(style, root)
}

export const mountInlineSurface = (
  options: InlineSurfaceControllerOptions,
): (() => void) => {
  if (!isInlineSurface(options.surface)) return () => undefined
  const doc = options.document ?? document
  const requestFrame = options.requestFrame ?? requestAnimationFrame
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame
  const createObserver =
    options.createObserver ?? ((callback) => new MutationObserver(callback))
  const { surface } = options
  let host: HTMLElement | null = null
  let anchor: Element | null = null
  let frame: number | null = null
  let disposed = false
  let selectorDiagnosticWritten = false

  const reconcile = (): void => {
    frame = null
    if (disposed) return

    let nextAnchor: Element | undefined
    try {
      nextAnchor = doc.querySelectorAll(surface.placement.selector)[
        surface.placement.index ?? 0
      ]
    } catch (error) {
      if (import.meta.env.DEV && !selectorDiagnosticWritten) {
        selectorDiagnosticWritten = true
        console.debug("[surfaces] Invalid inline selector", {
          surfaceId: surface.id,
          error: error instanceof Error ? error.message : "Invalid selector",
        })
      }
    }

    if (
      host &&
      anchor &&
      nextAnchor === anchor &&
      isCorrectlyPlaced(host, anchor, surface.placement.position)
    ) {
      return
    }

    host?.remove()
    host = null
    anchor = null
    if (!nextAnchor) return

    const nextHost = doc.createElement(HOST_TAG)
    nextHost.dataset.monocleSurface = `${surface.ownerId ?? ""}:${surface.id}`
    renderHost(nextHost, surface, options.onAction)
    insertHost(nextHost, nextAnchor, surface.placement.position)
    host = nextHost
    anchor = nextAnchor
  }

  const schedule = (): void => {
    if (frame === null && !disposed) frame = requestFrame(reconcile)
  }
  const observer = createObserver(schedule)
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  schedule()

  return () => {
    disposed = true
    if (frame !== null) cancelFrame(frame)
    observer.disconnect()
    host?.remove()
  }
}
