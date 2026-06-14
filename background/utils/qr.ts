// Architecture: background utility. Synchronous QR-code generation for the
// "Website URL as QR code" command. The MV3 service worker has no DOM/canvas,
// so we generate an **SVG string** (pure, synchronous) and encode it as a
// `data:image/svg+xml` URL — the same boundary the svg command-icon path uses
// (shared/utils/svg-icon.ts): the data URL is rendered only inside a static
// <img>, so no script/interactivity can run from it.
//
// `qrcode-generator` is a zero-dependency synchronous library; it is imported
// only here (background bundle), never by content/UI code.
import qrcode from "qrcode-generator"

// Cell size and quiet-zone margin (in SVG user units). The output SVG carries
// explicit width/height + viewBox so it renders predictably inside an <img>.
const CELL_SIZE = 6
const MARGIN = CELL_SIZE * 4

/**
 * Encodes `data` as a QR code and returns a `data:image/svg+xml` URL suitable
 * for an `image` ContentBlock. Type number 0 = auto-size to the data; error
 * correction "M" balances density against scan resilience.
 */
export const qrCodeSvgDataUrl = (data: string): string => {
  const qr = qrcode(0, "M")
  qr.addData(data)
  qr.make()
  const svg = qr.createSvgTag(CELL_SIZE, MARGIN)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`
}
