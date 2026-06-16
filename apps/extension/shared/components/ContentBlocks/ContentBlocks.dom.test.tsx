// @vitest-environment jsdom
//
// ContentBlocks must render identically in normal DOM (new-tab/options) and in
// the closed content shadow root, since it is mounted in both. It uses no Radix
// portals, so this is a smoke test that the rendered text appears in each mount.
import { render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { ContentBlock } from "../../types"
import { ContentBlocks } from "./ContentBlocks"

const blocks: ContentBlock[] = [
  { type: "keyValue", rows: [{ label: "1 + 89", value: "90" }] },
  { type: "code", text: "const x = 1" },
  { type: "markdown", text: "plain *text*" },
]

afterEach(() => {
  document.body.replaceChildren()
})

describe("ContentBlocks", () => {
  it("renders every block's text in normal DOM", () => {
    const { container } = render(<ContentBlocks blocks={blocks} />)
    expect(container.textContent).toContain("1 + 89")
    expect(container.textContent).toContain("90")
    expect(container.textContent).toContain("const x = 1")
    // Markdown is rendered as escaped plain text in v1 (asterisks preserved).
    expect(container.textContent).toContain("plain *text*")
  })

  it("renders nothing for an empty block list", () => {
    const { container } = render(<ContentBlocks blocks={[]} />)
    expect(container.textContent).toBe("")
  })

  it("renders the same content inside a shadow root", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    const mount = document.createElement("div")
    shadow.appendChild(mount)

    render(<ContentBlocks blocks={blocks} />, { container: mount })
    expect(shadow.textContent).toContain("90")
    expect(shadow.textContent).toContain("const x = 1")
  })
})
