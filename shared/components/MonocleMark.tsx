import type { CSSProperties } from "react"

// Parametric Monocle mark — the single source of truth for the brand logo in
// the UI. Ported from the design system's `monocle-mark.jsx` so the on-screen
// icon and the generated extension PNGs share one geometry.
//
// The viewBox is 64×64 (64 = 4×16, so the px sizes 16/32/48/128 map onto clean
// pixel grids). Two variants:
//   - "full":  the hero mark (lens + chevron command-prompt + draped chain).
//   - "glyph": the simplified small-size mark (thicker lens + abbreviated chain
//              stub, no interior glyph) used at toolbar sizes.

const VB = 64

// Monocle Mint — the anchored brand color.
export const MONOCLE_MINT = "#12e0a0"

const r2 = (n: number) => Math.round(n * 100) / 100

type ChainKeys = {
  c1: [number, number]
  c2: [number, number]
  e: [number, number]
}

// The chain drapes from the lower-right edge of the lens, down then hooking
// back up. Glyph and full variants use different control points so the stub
// reads correctly when thickened for small sizes.
function chainPath(start: [number, number], len: number, glyph: boolean) {
  const [sx, sy] = start
  const k: ChainKeys = glyph
    ? { c1: [7, 11], c2: [14, 10], e: [11, 1] }
    : { c1: [9, 15], c2: [20, 14], e: [16, 1] }
  const c1 = [sx + k.c1[0] * len, sy + k.c1[1] * len]
  const c2 = [sx + k.c2[0] * len, sy + k.c2[1] * len]
  const e = [sx + k.e[0] * len, sy + k.e[1] * len]
  return `M ${r2(sx)} ${r2(sy)} C ${r2(c1[0])} ${r2(c1[1])}, ${r2(c2[0])} ${r2(c2[1])}, ${r2(e[0])} ${r2(e[1])}`
}

// A ">" command-prompt glyph opening to the right, centred on the lens.
function chevronPath(cx: number, cy: number, s: number) {
  return `M ${cx - s} ${cy - s * 1.45} L ${cx + s} ${cy} L ${cx - s} ${cy + s * 1.45}`
}

function geom(glyph: boolean) {
  const ang = (47 * Math.PI) / 180
  if (glyph) {
    const cx = 29
    const cy = 28
    const r = 19
    return {
      cx,
      cy,
      r,
      start: [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as [
        number,
        number,
      ],
    }
  }
  const cx = 27
  const cy = 27
  const r = 18
  return {
    cx,
    cy,
    r,
    start: [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as [number, number],
  }
}

export interface MonocleMarkProps {
  /** Rendered pixel size (width === height). */
  size?: number
  /** "full" hero mark or "glyph" simplified small-size mark. */
  variant?: "full" | "glyph"
  /** Stroke / fill color (default Monocle Mint). */
  color?: string
  /** Base ring stroke in viewBox units (default 6). Glyph adds +2. */
  stroke?: number
  /** Chain length multiplier (default 1). */
  chain?: number
  /** Show the chevron command-prompt inside the lens (full variant only). */
  chevron?: boolean
  /** Accessible label. */
  title?: string
  className?: string
  style?: CSSProperties
}

export function MonocleMark({
  size = 96,
  variant = "full",
  color = MONOCLE_MINT,
  stroke = 6,
  chain = 1,
  chevron,
  title = "Monocle",
  className,
  style,
}: MonocleMarkProps) {
  const glyph = variant === "glyph"
  const g = geom(glyph)
  const sw = glyph ? stroke + 2 : stroke

  const showChevron = (chevron === undefined ? true : chevron) && !glyph
  const cp = chainPath(g.start, glyph ? chain * 0.9 : chain, glyph)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VB} ${VB}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      style={style}
      shapeRendering="geometricPrecision"
    >
      <title>{title}</title>
      {/* lens */}
      <circle
        cx={g.cx}
        cy={g.cy}
        r={g.r}
        stroke={color}
        strokeWidth={sw}
        fill="none"
      />
      {/* chevron command-prompt (full variant) */}
      {showChevron && (
        <path
          d={chevronPath(g.cx, g.cy, 4.4)}
          stroke={color}
          strokeWidth={sw * 0.82}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {/* chain */}
      <path
        d={cp}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
