import { describe, expect, it } from "vitest"
import { validateContentBlocks } from "../../shared/types"
import { qrCodeSvgDataUrl } from "./qr"

describe("qrCodeSvgDataUrl", () => {
  it("encodes a URL as an svg+xml data URL", () => {
    const dataUrl = qrCodeSvgDataUrl("https://example.com")
    expect(dataUrl.startsWith("data:image/svg+xml;utf8,")).toBe(true)
    // The decoded payload is a single <svg> root (synchronous, no canvas).
    const svg = decodeURIComponent(
      dataUrl.replace("data:image/svg+xml;utf8,", ""),
    )
    expect(svg).toMatch(/^<svg/)
    expect(svg).toMatch(/<\/svg>$/)
  })

  it("produces a valid image ContentBlock", () => {
    const blocks = validateContentBlocks([
      { type: "image", dataUrl: qrCodeSvgDataUrl("https://example.com/page") },
    ])
    expect(blocks).not.toBeNull()
    expect(blocks?.[0]).toMatchObject({ type: "image" })
  })

  it("scales the QR module count with the data length", () => {
    const short = qrCodeSvgDataUrl("https://x.io")
    const long = qrCodeSvgDataUrl(`https://x.io/${"a".repeat(200)}`)
    expect(long.length).toBeGreaterThan(short.length)
  })
})
