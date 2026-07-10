// Architecture: shared content/new-tab component. The ONE generic renderer for
// the Surfaces primitive. It queries get-surfaces with the current URL (on
// mount, on SPA navigation, and on every monocle-surfaces-changed broadcast),
// then renders the surfaces of the kinds it owns: `overlay` (full-viewport,
// optionally blocking), `badge` (corner chip), `modal` (dismissible card), and
// `picker` (interactive element pick-mode — content-only). Surfaces are
// declarative data — this component is the only code that turns them into DOM,
// so there is no arbitrary HTML/JS. The `picker` kind is the one interactive
// case: PickerSurface attaches page-level listeners and reports the clicked
// element back via `surface-action`; it still never mutates the page. Mounted
// in the content shadow root and on the new tab, like ToastContainer. See
// docs/surfaces.md.
import { useCallback, useEffect, useState } from "react"
import { PickerSurface } from "../../content/picker/PickerSurface"
import { InlineSurface } from "../../content/surfaces/InlineSurface"
import { trackSpaNavigation } from "../../content/utils/spaNavigation"
import type {
  GetSurfacesResponse,
  PickedElement,
  Surface,
  SurfaceKind,
} from "../types"
import { getBrowserAPI, sendRuntimeMessageSafe } from "../utils/extension-api"
import { ContentBlocks } from "./ContentBlocks"
import { getIconComponent } from "./iconRegistry"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

// Report a surface interaction back to the background (the host captures the
// gesture; the background decides what it means). v1 only uses "dismiss".
const sendSurfaceAction = (
  surface: Surface,
  actionId: string,
  selection?: PickedElement,
): void => {
  if (!surface.ownerId) {
    return
  }
  void sendRuntimeMessageSafe({
    type: "monocle-surface-action",
    ownerId: surface.ownerId,
    surfaceId: surface.id,
    actionId,
    ...(selection ? { selection } : {}),
  })
}

const formatCountdown = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

const SurfaceIcon = ({ name, size }: { name?: string; size: number }) => {
  if (!name) {
    return null
  }
  const Component = getIconComponent(name)
  return Component ? <Component size={size} /> : null
}

// Live mm:ss until `to` (epoch ms). Returns null when there's no countdown.
const Countdown = ({
  to,
  style,
}: {
  to?: number
  style: React.CSSProperties
}) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (to === undefined) {
      return
    }
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [to])
  if (to === undefined) {
    return null
  }
  return <div style={style}>{formatCountdown(to - now)}</div>
}

const OverlaySurface = ({ surface }: { surface: Surface }) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 2147483647,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(15, 16, 22, 0.92)",
      backdropFilter: "blur(6px)",
      color: "#f5f5f7",
      pointerEvents: surface.blocking ? "auto" : "none",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    }}
  >
    <div
      style={{
        maxWidth: 420,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#8b5cf6" }}>
        <SurfaceIcon name={surface.content.icon} size={48} />
      </div>
      {surface.content.title ? (
        <div style={{ marginTop: 16, fontSize: 24, fontWeight: 600 }}>
          {surface.content.title}
        </div>
      ) : null}
      {surface.content.text ? (
        <div style={{ marginTop: 8, fontSize: 15, opacity: 0.8 }}>
          {surface.content.text}
        </div>
      ) : null}
      <Countdown
        to={surface.content.countdownTo}
        style={{
          marginTop: 20,
          fontSize: 40,
          fontWeight: 300,
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  </div>
)

const BadgeSurface = ({ surface }: { surface: Surface }) => (
  <div
    style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 2147483647,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 9999,
      background: "rgba(0, 0, 0, 0.45)",
      color: "#fff",
      boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      backdropFilter: "blur(4px)",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 14,
    }}
  >
    <span style={{ color: "#a78bfa", display: "inline-flex" }}>
      <SurfaceIcon name={surface.content.icon} size={16} />
    </span>
    {surface.content.title ? (
      <span style={{ fontWeight: 500 }}>{surface.content.title}</span>
    ) : null}
    <Countdown
      to={surface.content.countdownTo}
      style={{ fontVariantNumeric: "tabular-nums", opacity: 0.9 }}
    />
  </div>
)

// A centered, dismissible card (the shared shadcn Dialog) the first kind that
// renders structured `blocks` and the first surface triggered by a command
// (e.g. the QR modal). Radix handles dismissal — ✕ button, backdrop click, and
// Escape all fire onOpenChange(false), which reports `dismiss` to the owner.
//
// The Dialog is portaled into `container` (a div in this component's subtree)
// rather than document.body, so in the closed content shadow root it stays
// inside the shadow root — themed by the :host `--color-*` tokens and isolated.
const ModalSurface = ({ surface }: { surface: Surface }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const { title, text, blocks } = surface.content

  return (
    <div ref={setContainer}>
      {container ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              sendSurfaceAction(surface, "dismiss")
            }
          }}
        >
          <DialogContent
            container={container}
            onCloseAutoFocus={(event) => {
              // On dismiss (Escape, backdrop, or ✕) return focus to the palette
              // search input instead of letting Radix restore focus to its own
              // target. Resolve the input from this dialog's root node — the
              // closed content shadow root or the new-tab document — since
              // `document.querySelector` cannot pierce the shadow root (mirrors
              // useInlineInputKeys). Only take over when the palette is actually
              // mounted; otherwise fall through to Radix's default restoration.
              const root = container?.getRootNode() as
                | Document
                | ShadowRoot
                | undefined
              const searchInput = root?.querySelector(
                "input[cmdk-input]",
              ) as HTMLInputElement | null
              if (searchInput) {
                event.preventDefault()
                searchInput.focus()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{title ?? "Monocle"}</DialogTitle>
              {text ? (
                <DialogDescription className="break-all">
                  {text}
                </DialogDescription>
              ) : null}
            </DialogHeader>
            {blocks ? <ContentBlocks blocks={blocks} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

export function SurfaceHost({ kinds }: { kinds: SurfaceKind[] }) {
  const [surfaces, setSurfaces] = useState<Surface[]>([])

  const refresh = useCallback(async () => {
    const response = await sendRuntimeMessageSafe<
      GetSurfacesResponse | { error?: string }
    >({
      type: "monocle-surfaces-get",
      url: window.location.href,
    })

    if (!response || "error" in response) {
      setSurfaces([])
      return
    }
    setSurfaces((response as GetSurfacesResponse).surfaces)
  }, [])

  useEffect(() => {
    void refresh()

    const runtime = getBrowserAPI().runtime
    const onMessage = (message: { type?: string }) => {
      if (message?.type === "monocle-surfaces-changed") {
        void refresh()
      }
    }
    runtime.onMessage.addListener(onMessage)
    const stopNav = trackSpaNavigation(() => void refresh())

    return () => {
      runtime.onMessage.removeListener(onMessage)
      stopNav()
    }
  }, [refresh])

  const visible = surfaces.filter((surface) => kinds.includes(surface.kind))
  if (visible.length === 0) {
    return null
  }

  return (
    <>
      {visible.map((surface) => {
        // Key by owner + id: ids are only unique within an owner.
        const key = `${surface.ownerId ?? ""}:${surface.id}`
        if (surface.kind === "modal") {
          return <ModalSurface key={key} surface={surface} />
        }
        if (surface.kind === "inline") {
          return <InlineSurface key={key} surface={surface} />
        }
        if (surface.kind === "overlay") {
          return <OverlaySurface key={key} surface={surface} />
        }
        if (surface.kind === "picker") {
          return (
            <PickerSurface
              key={key}
              surface={surface}
              onPick={(target, selection) =>
                sendSurfaceAction(target, "element-picked", selection)
              }
              onCancel={(target) => sendSurfaceAction(target, "dismiss")}
            />
          )
        }
        return <BadgeSurface key={key} surface={surface} />
      })}
    </>
  )
}
