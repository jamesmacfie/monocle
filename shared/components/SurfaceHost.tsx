// Architecture: shared content/new-tab component. The ONE generic renderer for
// the Surfaces primitive. It queries get-surfaces with the current URL (on
// mount, on SPA navigation, and on every monocle-surfaces-changed broadcast),
// then renders the surfaces of the kinds it owns: `overlay` (full-viewport,
// optionally blocking) and `badge` (corner chip). Surfaces are declarative
// data — this component is the only code that turns them into DOM, so there is
// no arbitrary HTML/JS. Mounted in the content shadow root and on the new tab,
// like ToastContainer. See docs/surfaces.md.
import { useCallback, useEffect, useState } from "react"
import { trackSpaNavigation } from "../../content/utils/spaNavigation"
import type { GetSurfacesResponse, Surface, SurfaceKind } from "../types"
import { getBrowserAPI } from "../utils/extension-api"
import { getIconComponent } from "./iconRegistry"

const sendMessage = (message: unknown): Promise<unknown> =>
  new Promise((resolve) => {
    try {
      getBrowserAPI().runtime.sendMessage(message, (response: unknown) => {
        void getBrowserAPI().runtime.lastError
        resolve(response)
      })
    } catch {
      resolve(undefined)
    }
  })

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
    <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
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

export function SurfaceHost({ kinds }: { kinds: SurfaceKind[] }) {
  const [surfaces, setSurfaces] = useState<Surface[]>([])

  const refresh = useCallback(async () => {
    const response = (await sendMessage({
      type: "get-surfaces",
      url: window.location.href,
    })) as GetSurfacesResponse | { error?: string } | undefined

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
      {visible.map((surface) =>
        surface.kind === "overlay" ? (
          <OverlaySurface key={surface.id} surface={surface} />
        ) : (
          <BadgeSurface key={surface.id} surface={surface} />
        ),
      )}
    </>
  )
}
