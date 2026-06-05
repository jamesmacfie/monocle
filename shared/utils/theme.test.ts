import { afterEach, describe, expect, it, vi } from "vitest"
import {
  applyThemeToDocument,
  applyThemeToHost,
  getEffectiveTheme,
  getThemeModeFromSettings,
} from "./theme"

class TestClassList {
  private classes: Set<string>

  constructor(initialClasses: string[] = []) {
    this.classes = new Set(initialClasses)
  }

  add(...tokens: string[]) {
    for (const token of tokens) {
      this.classes.add(token)
    }
  }

  remove(...tokens: string[]) {
    for (const token of tokens) {
      this.classes.delete(token)
    }
  }

  values() {
    return [...this.classes].sort()
  }
}

const createThemeTarget = (initialClasses: string[] = []) => ({
  classList: new TestClassList(initialClasses),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("theme utilities", () => {
  it("normalizes missing and invalid stored theme settings to system", () => {
    expect(getThemeModeFromSettings(undefined)).toBe("system")
    expect(getThemeModeFromSettings({ theme: {} })).toBe("system")
    expect(
      getThemeModeFromSettings({
        theme: { mode: "invalid" as "system" },
      }),
    ).toBe("system")
  })

  it("applies content storage changes to the closed-shadow host element", () => {
    const host = createThemeTarget(["existing", "dark"])
    const storageChange = {
      "monocle-settings": {
        newValue: {
          theme: {
            mode: "system" as const,
          },
        },
      },
    }

    applyThemeToHost(host, storageChange["monocle-settings"].newValue)

    expect(host.classList.values()).toEqual(["existing", "system"])
  })

  it("applies new-tab theme classes to documentElement", () => {
    const root = createThemeTarget(["light", "new-tab-root"])
    vi.stubGlobal("document", {
      documentElement: root,
    })

    applyThemeToDocument("dark")

    expect(root.classList.values()).toEqual(["dark", "new-tab-root"])
  })

  it("resolves effective system theme without assuming window exists", () => {
    expect(getEffectiveTheme("system")).toBe("light")
  })
})
