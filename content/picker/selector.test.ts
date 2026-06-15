// Architecture: content layer (tests). Coverage for the element-picker selector
// generator — the core invariant is that a generated selector re-selects the
// exact element it was built from, plus the id-preference and the describe
// payload shape. Uses the shared linkedom fixture.
import { afterEach, describe, expect, it, vi } from "vitest"
import { installDom } from "../workflow/testDom"
import { buildStableSelector, describeElement } from "./selector"

afterEach(() => {
  vi.unstubAllGlobals()
})

const roundTrips = (document: Document, element: Element): boolean => {
  const selector = buildStableSelector(element)
  return (
    document.querySelectorAll(selector).length === 1 &&
    document.querySelector(selector) === element
  )
}

describe("buildStableSelector", () => {
  it("prefers a unique id", () => {
    const { document } = installDom(`<div id="main"><span>hi</span></div>`)
    const el = document.querySelector("#main") as Element
    expect(buildStableSelector(el)).toBe("#main")
  })

  it("re-selects a class-anchored element uniquely", () => {
    const { document } = installDom(
      `<main><p class="lead">one</p><p>two</p></main>`,
    )
    const el = document.querySelector("p.lead") as Element
    expect(roundTrips(document, el)).toBe(true)
  })

  it("re-selects a nested element with no id uniquely", () => {
    const { document } = installDom(
      `<section><article><h2>Title</h2></article></section>`,
    )
    const el = document.querySelector("h2") as Element
    expect(roundTrips(document, el)).toBe(true)
  })

  it("re-selects one of several same-type siblings uniquely", () => {
    const { document } = installDom(
      `<div id="sidebar"><ul><li>a</li><li>b</li></ul></div>`,
    )
    const el = document.querySelectorAll("li")[1] as Element
    expect(roundTrips(document, el)).toBe(true)
  })
})

describe("describeElement", () => {
  it("captures tag, text, classes, and href", () => {
    const { document } = installDom(
      `<a id="link" class="btn primary" href="/go" role="button">  Go now  </a>`,
    )
    const el = document.querySelector("#link") as Element
    const described = describeElement(el)
    expect(described.selector).toBe("#link")
    expect(described.tagName).toBe("A")
    expect(described.id).toBe("link")
    expect(described.classes).toEqual(["btn", "primary"])
    expect(described.innerText).toBe("Go now")
    expect(described.href).toBe("/go")
    expect(described.role).toBe("button")
  })
})
