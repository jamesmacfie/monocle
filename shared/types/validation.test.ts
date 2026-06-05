import { describe, expect, it } from "vitest"
import { validateBrowserContext, validateMessage } from "./validation"

describe("browser context validation", () => {
  it("allows untitled browser pages while still requiring a URL", () => {
    expect(
      validateBrowserContext({
        url: "https://example.com/untitled",
        title: "",
        modifierKey: null,
      }).success,
    ).toBe(true)
    expect(
      validateBrowserContext({
        url: "",
        title: "",
        modifierKey: null,
      }).success,
    ).toBe(false)
  })

  it("accepts new-tab contexts with empty titles", () => {
    expect(
      validateMessage({
        type: "get-commands",
        context: {
          url: "chrome-extension://monocle-test/newtab.html",
          title: "",
          modifierKey: null,
          isNewTab: true,
        },
      }).success,
    ).toBe(true)
  })
})
