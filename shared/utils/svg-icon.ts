// Validation and encoding for `{ type: "svg" }` command icons.
//
// SECURITY MODEL: svg icons are rendered exclusively through
// `<img src="data:image/svg+xml,...">`, which the browser treats as a secure
// static image — scripts, event handlers, external fetches, foreignObject,
// and interactivity are all disabled by the browser itself. That <img>
// boundary is the primary security control. The validation below is
// defense-in-depth only; it is NOT a sanitizer and does NOT make untrusted
// SVG safe to inject inline into the DOM. Never "upgrade" svg icon rendering
// to dangerouslySetInnerHTML/innerHTML on the strength of these checks.
//
// Checks are intentionally string-based: validation runs in the isolated
// content bridge and in the MV3 background service worker, which has no
// DOMParser.

export const SVG_ICON_MAX_LENGTH = 10_000

const FORBIDDEN_ELEMENTS = [
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
]

// Inline event handlers such as onload= / onclick= (with optional whitespace
// before the equals sign).
const EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=/i

// href / xlink:href attribute values; only same-document fragment references
// ("#id") are allowed so <use>, <image>, and <a> cannot point at external
// resources.
const HREF_PATTERN = /(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

export function validateSvgIconMarkup(svg: string): true | string {
  const trimmed = svg.trim()

  if (!trimmed) {
    return "SVG icon cannot be empty"
  }

  if (trimmed.length > SVG_ICON_MAX_LENGTH) {
    return `SVG icon markup must be at most ${SVG_ICON_MAX_LENGTH} characters`
  }

  // Require a single <svg>...</svg> root with no surrounding content. Exactly
  // one <svg> opening tag is allowed — this also rejects sibling roots and
  // (exotic for an icon) nested <svg> elements.
  if (
    !/^<svg[\s>]/i.test(trimmed) ||
    !/<\/svg>$/i.test(trimmed) ||
    (trimmed.match(/<svg[\s/>]/gi) ?? []).length !== 1
  ) {
    return "SVG icon must be a single <svg> root element"
  }

  const lower = trimmed.toLowerCase()
  for (const element of FORBIDDEN_ELEMENTS) {
    if (lower.includes(`<${element}`)) {
      return `SVG icon cannot contain <${element}> elements`
    }
  }

  if (EVENT_HANDLER_PATTERN.test(trimmed)) {
    return "SVG icon cannot contain inline event handlers"
  }

  if (lower.includes("javascript:")) {
    return "SVG icon cannot contain javascript: URLs"
  }

  for (const match of trimmed.matchAll(HREF_PATTERN)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim()
    if (!value.startsWith("#")) {
      return "SVG icon href attributes may only reference fragments (#id)"
    }
  }

  return true
}

export function svgIconToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`
}
