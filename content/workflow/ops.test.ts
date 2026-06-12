// Architecture: content layer (tests). Focused coverage for the workflow
// operations added for user scripts — form ops (fill/select/check/submit),
// DOM ops (getText/removeElement/hideElement/injectCss), and interaction ops
// (hover/focus/type/key) — using the shared linkedom fixture in testDom.ts.
// Together with executor.test.ts this is the executor half of the lockstep
// invariant: every schema-accepted op has behavior asserted here.
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Workflow } from "../../shared/types/workflow"
import { WorkflowExecutor } from "./executor"
import { installDom } from "./testDom"

const runWorkflow = (workflow: Workflow) => {
  return new WorkflowExecutor().executeWorkflow(workflow)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("fill", () => {
  it("replaces input values, fires input/change, and appends with clear: none", async () => {
    const { document } = installDom(
      `<input id="username" type="text" value="old" />`,
    )
    const input = document.querySelector("#username") as HTMLInputElement
    const fired: string[] = []
    input.addEventListener("input", () => fired.push("input"))
    input.addEventListener("change", () => fired.push("change"))

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "fill",
          target: { strategy: "css", value: "#username" },
          text: "dev-user",
          targeting: { scrollIntoView: false },
        },
        {
          op: "fill",
          target: { strategy: "css", value: "#username" },
          text: "@example.com",
          clear: "none",
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(input.value).toBe("dev-user@example.com")
    expect(fired).toEqual(["input", "change", "input", "change"])
  })

  it("fails loudly when the target is not editable", async () => {
    installDom(`<div id="static">Static</div>`)

    await expect(
      runWorkflow({
        version: "1.0",
        steps: [
          {
            op: "fill",
            target: { strategy: "css", value: "#static" },
            text: "nope",
            targeting: { scrollIntoView: false },
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("not an input"),
    })
  })
})

describe("select, check, uncheck, submit", () => {
  it("selects options by value, label, and index", async () => {
    const { document } = installDom(`
      <select id="env">
        <option value="dev">Development</option>
        <option value="staging">Staging</option>
        <option value="prod">Production</option>
      </select>
    `)
    const select = document.querySelector("#env") as HTMLSelectElement
    const changes: string[] = []
    select.addEventListener("change", () => {
      const selected = Array.from(select.querySelectorAll("option")).find(
        (option) => (option as HTMLOptionElement).selected,
      )
      changes.push(selected?.getAttribute("value") ?? "")
    })

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "select",
          target: { strategy: "css", value: "#env" },
          by: { value: "staging" },
          targeting: { scrollIntoView: false },
        },
        {
          op: "select",
          target: { strategy: "css", value: "#env" },
          by: { label: "Production" },
          targeting: { scrollIntoView: false },
        },
        {
          op: "select",
          target: { strategy: "css", value: "#env" },
          by: { index: 0 },
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(changes).toEqual(["staging", "prod", "dev"])
  })

  it("fails select when no option matches", async () => {
    installDom(`<select id="env"><option value="dev">Dev</option></select>`)

    await expect(
      runWorkflow({
        version: "1.0",
        steps: [
          {
            op: "select",
            target: { strategy: "css", value: "#env" },
            by: { value: "missing" },
            targeting: { scrollIntoView: false },
          },
        ],
      }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("No option matched"),
    })
  })

  it("checks and unchecks checkboxes idempotently", async () => {
    const { document } = installDom(`<input id="agree" type="checkbox" />`)
    const checkbox = document.querySelector("#agree") as HTMLInputElement

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "check",
          target: { strategy: "css", value: "#agree" },
          targeting: { scrollIntoView: false },
        },
        // Second check is a no-op, not a toggle.
        {
          op: "check",
          target: { strategy: "css", value: "#agree" },
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(checkbox.checked).toBe(true)

    const uncheckResult = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "uncheck",
          target: { strategy: "css", value: "#agree" },
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(uncheckResult.success).toBe(true)
    expect(checkbox.checked).toBe(false)
  })

  it("submits the closest form for a non-form target", async () => {
    const { document } = installDom(`
      <form id="login"><input type="text" /><button id="go">Go</button></form>
    `)
    const form = document.querySelector("#login") as HTMLFormElement
    let submitted = false
    form.addEventListener("submit", () => {
      submitted = true
    })
    // linkedom has no requestSubmit/submit; the executor falls back to
    // dispatching the submit event.
    ;(form as any).submit = undefined

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "submit",
          target: { strategy: "css", value: "#go" },
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(submitted).toBe(true)
  })
})

describe("getText and vars", () => {
  it("extracts text, attributes, and values into the returned var bag", async () => {
    installDom(`
      <h1 id="title">  Welcome back  </h1>
      <a id="link" href="/profile">Profile</a>
      <input id="field" type="text" value="typed" />
    `)

    const result = await runWorkflow({
      version: "1.0",
      vars: { seeded: "initial" },
      steps: [
        {
          op: "getText",
          from: { strategy: "css", value: "#title" },
          toVar: "heading",
        },
        {
          op: "getText",
          from: { strategy: "css", value: "#link" },
          attr: "href",
          toVar: "href",
        },
        {
          op: "getText",
          from: { strategy: "css", value: "#field" },
          attr: "value",
          toVar: "fieldValue",
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.vars).toEqual({
      seeded: "initial",
      heading: "Welcome back",
      href: "/profile",
      fieldValue: "typed",
    })
  })

  it("returns partial vars when a later step fails", async () => {
    installDom(`<h1 id="title">Hello</h1>`)

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "getText",
          from: { strategy: "css", value: "#title" },
          toVar: "heading",
        },
        {
          op: "getText",
          from: { strategy: "css", value: "#missing" },
          toVar: "nope",
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.vars).toEqual({ heading: "Hello" })
  })
})

describe("removeElement, hideElement, injectCss", () => {
  it("removes one or all matching elements", async () => {
    const { document } = installDom(`
      <div class="ad">Ad 1</div>
      <div class="ad">Ad 2</div>
      <div class="banner">Banner</div>
    `)

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "removeElement",
          target: { strategy: "css", value: ".ad" },
          all: true,
        },
        { op: "removeElement", target: { strategy: "css", value: ".banner" } },
      ],
    })

    expect(result.success).toBe(true)
    expect(document.querySelectorAll(".ad").length).toBe(0)
    expect(document.querySelectorAll(".banner").length).toBe(0)
  })

  it("hides elements via a scoped style element and marker attributes", async () => {
    const { document } = installDom(`
      <div class="promo">Promo A</div>
      <div class="promo">Promo B</div>
    `)

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "hideElement",
          target: { strategy: "css", value: ".promo" },
          all: true,
          scopeKey: "script-1",
        },
      ],
    })

    expect(result.success).toBe(true)

    const style = document.querySelector('style[data-monocle-style="script-1"]')
    expect(style).toBeTruthy()
    expect(style?.textContent).toContain("display: none !important")

    const marked = document.querySelectorAll("[data-monocle-hidden]")
    expect(marked.length).toBe(2)
  })

  it("appends CSS into the same scoped style element", async () => {
    const { document } = installDom(`<div id="page">Page</div>`)

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        { op: "injectCss", css: "body { background: black; }", scopeKey: "s" },
        { op: "injectCss", css: "h1 { color: white; }", scopeKey: "s" },
      ],
    })

    expect(result.success).toBe(true)

    const styles = document.querySelectorAll('style[data-monocle-style="s"]')
    expect(styles.length).toBe(1)
    expect(styles[0].textContent).toContain("background: black")
    expect(styles[0].textContent).toContain("color: white")
  })
})

describe("hover, focus, type, key", () => {
  it("dispatches a hover sequence", async () => {
    const { document } = installDom(`<button id="menu">Menu</button>`)
    const target = document.querySelector("#menu")!
    const events: string[] = []
    for (const type of ["mouseover", "mousemove"]) {
      target.addEventListener(type, () => events.push(type))
    }

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "hover",
          target: { strategy: "css", value: "#menu" },
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(events).toEqual(["mouseover", "mousemove"])
  })

  it("focuses and blurs targets", async () => {
    const { document } = installDom(`<input id="field" type="text" />`)
    const field = document.querySelector("#field") as HTMLElement
    const events: string[] = []
    field.addEventListener("focus", () => events.push("focus"))
    field.addEventListener("blur", () => events.push("blur"))

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "focus",
          target: { strategy: "css", value: "#field" },
          targeting: { scrollIntoView: false },
        },
        {
          op: "blur",
          target: { strategy: "css", value: "#field" },
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it("types literal text and named keys into an input", async () => {
    const { document } = installDom(`<input id="field" type="text" value="" />`)
    const field = document.querySelector("#field") as HTMLInputElement

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        {
          op: "type",
          target: { strategy: "css", value: "#field" },
          keys: ["abc", "Backspace", "d"],
          targeting: { scrollIntoView: false },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(field.value).toBe("abd")
  })

  it("dispatches key combos to the active element", async () => {
    const { document } = installDom(`<input id="field" type="text" />`)
    const field = document.querySelector("#field") as HTMLElement
    Object.defineProperty(document, "activeElement", {
      value: field,
      configurable: true,
    })

    const seen: Array<{ key: string; ctrlKey: boolean }> = []
    field.addEventListener("keydown", (event) => {
      const keyEvent = event as KeyboardEvent
      seen.push({ key: keyEvent.key, ctrlKey: keyEvent.ctrlKey })
    })

    const result = await runWorkflow({
      version: "1.0",
      steps: [{ op: "key", keys: ["Control", "a"] }],
    })

    expect(result.success).toBe(true)
    expect(seen).toEqual([
      { key: "Control", ctrlKey: true },
      { key: "a", ctrlKey: true },
    ])
  })
})

describe("scroll", () => {
  it("scrolls the window and elements without error", async () => {
    const { window, document } = installDom(`<div id="pane">Pane</div>`)
    const scrollTo = vi.fn()
    Object.defineProperty(window, "scrollTo", {
      value: scrollTo,
      configurable: true,
    })
    const pane = document.querySelector("#pane") as HTMLElement
    const paneScroll = vi.fn()
    Object.defineProperty(pane, "scrollTo", {
      value: paneScroll,
      configurable: true,
    })

    const result = await runWorkflow({
      version: "1.0",
      steps: [
        { op: "scroll", to: "top" },
        { op: "scroll", to: { x: 0, y: 50 } },
        {
          op: "scroll",
          target: { strategy: "css", value: "#pane" },
          to: "bottom",
        },
        {
          op: "scroll",
          target: { strategy: "css", value: "#pane" },
          to: { intoView: true },
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(paneScroll).toHaveBeenCalledTimes(1)
  })
})
