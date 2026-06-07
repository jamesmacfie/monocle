import { describe, expect, it } from "vitest"
import {
  SVG_ICON_MAX_LENGTH,
  svgIconToDataUri,
  validateSvgIconMarkup,
} from "./svg-icon"

const minimalSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="tomato"/></svg>'

describe("validateSvgIconMarkup", () => {
  it("accepts minimal valid SVG markup", () => {
    expect(validateSvgIconMarkup(minimalSvg)).toBe(true)
    expect(validateSvgIconMarkup(`  ${minimalSvg}\n`)).toBe(true)
    expect(validateSvgIconMarkup("<svg></svg>")).toBe(true)
  })

  it("accepts same-document fragment href references", () => {
    expect(
      validateSvgIconMarkup(
        '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" href="#g"/><use xlink:href="#g"/></svg>',
      ),
    ).toBe(true)
  })

  it("rejects empty and oversize markup", () => {
    expect(validateSvgIconMarkup("")).not.toBe(true)
    expect(validateSvgIconMarkup("   ")).not.toBe(true)

    const padding = "<!-- x -->".repeat(
      Math.ceil(SVG_ICON_MAX_LENGTH / "<!-- x -->".length),
    )
    expect(validateSvgIconMarkup(`<svg>${padding}</svg>`)).not.toBe(true)
  })

  it("rejects markup that is not a single <svg> root", () => {
    expect(validateSvgIconMarkup("<div>not svg</div>")).not.toBe(true)
    expect(validateSvgIconMarkup(`${minimalSvg}<svg></svg>`)).not.toBe(true)
    expect(validateSvgIconMarkup(`text before ${minimalSvg}`)).not.toBe(true)
    expect(validateSvgIconMarkup(`${minimalSvg} text after`)).not.toBe(true)
    expect(validateSvgIconMarkup("<svgfoo></svgfoo>")).not.toBe(true)
  })

  it("rejects forbidden elements", () => {
    expect(
      validateSvgIconMarkup("<svg><script>alert(1)</script></svg>"),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup(
        "<svg><foreignObject><body/></foreignObject></svg>",
      ),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup('<svg><iframe src="https://x.test"/></svg>'),
    ).not.toBe(true)
    expect(validateSvgIconMarkup("<svg><embed/></svg>")).not.toBe(true)
    expect(validateSvgIconMarkup("<svg><object/></svg>")).not.toBe(true)
  })

  it("rejects inline event handlers and javascript: URLs", () => {
    expect(
      validateSvgIconMarkup('<svg onload="alert(1)"><rect/></svg>'),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup('<svg><rect onclick = "alert(1)"/></svg>'),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup('<svg><a href="javascript:alert(1)"/></svg>'),
    ).not.toBe(true)
  })

  it("rejects external href references", () => {
    expect(
      validateSvgIconMarkup(
        '<svg><use href="https://evil.test/sprite.svg#icon"/></svg>',
      ),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup(
        "<svg><image xlink:href='https://evil.test/x.png'/></svg>",
      ),
    ).not.toBe(true)
    expect(
      validateSvgIconMarkup("<svg><use href=//evil.test/sprite.svg /></svg>"),
    ).not.toBe(true)
  })
})

describe("svgIconToDataUri", () => {
  it("encodes markup so fragments and quotes survive in a data URI", () => {
    const svg = "<svg><use href=\"#id\"/><rect fill='red'/></svg>"
    const uri = svgIconToDataUri(svg)

    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true)
    expect(uri).not.toContain("#")
    expect(uri).not.toContain('"')
    expect(
      decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length)),
    ).toBe(svg)
  })

  it("trims surrounding whitespace before encoding", () => {
    expect(svgIconToDataUri(`  ${minimalSvg}\n`)).toBe(
      svgIconToDataUri(minimalSvg),
    )
  })
})
