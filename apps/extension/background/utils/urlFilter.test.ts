import { describe, expect, it } from "vitest"
import type { CommandNode, CommandSettings } from "../../shared/types"
import {
  createUrlPatternForDomain,
  extractDomain,
  filterCommandsByUrl,
  matchesUrlPattern,
  validateUrlPattern,
  validateUrlRulesValue,
} from "./urlFilter"

const createTestCommand = (
  id: string,
  urlRules?: CommandNode["urlRules"],
): CommandNode => ({
  type: "action",
  id,
  name: id,
  actionLabel: "Run",
  urlRules,
  execute: () => undefined,
})

describe("URL domain extraction and generated patterns", () => {
  it("extracts domains from standard, localhost, and IP URLs", () => {
    expect(extractDomain("https://github.com/user/repo")).toBe("github.com")
    expect(extractDomain("https://app.example.com/page")).toBe(
      "app.example.com",
    )
    expect(extractDomain("http://localhost:3000/path")).toBe("localhost:3000")
    expect(extractDomain("http://127.0.0.1:5173/path")).toBe("127.0.0.1:5173")
    expect(extractDomain("http://[::1]:3000/path")).toBe("[::1]:3000")
  })

  it("creates wildcard subdomain patterns only for regular domains", () => {
    expect(createUrlPatternForDomain("github.com")).toBe("*://*.github.com/*")
    expect(createUrlPatternForDomain("example.com")).toBe("*://*.example.com/*")
    expect(createUrlPatternForDomain("docs.example.com")).toBe(
      "*://*.docs.example.com/*",
    )
    expect(createUrlPatternForDomain("localhost:3000")).toBe(
      "*://localhost:3000/*",
    )
    expect(createUrlPatternForDomain("127.0.0.1:5173")).toBe(
      "*://127.0.0.1:5173/*",
    )
    expect(createUrlPatternForDomain("[::1]:3000")).toBe("*://[::1]:3000/*")
  })
})

describe("URL pattern validation and matching", () => {
  it("matches exact domains, wildcard subdomains, localhost, and IP patterns", () => {
    expect(
      matchesUrlPattern("https://github.com/acme/widgets", [
        "*://*.github.com/*",
      ]),
    ).toBe(true)
    expect(
      matchesUrlPattern("https://api.github.com/repos/acme/widgets", [
        "*://*.github.com/*",
      ]),
    ).toBe(true)
    expect(
      matchesUrlPattern("https://notgithub.com/acme/widgets", [
        "*://*.github.com/*",
      ]),
    ).toBe(false)
    expect(
      matchesUrlPattern("http://localhost:3000/settings", [
        "*://localhost:3000/*",
      ]),
    ).toBe(true)
    expect(
      matchesUrlPattern("http://localhost:3001/settings", [
        "*://localhost:3000/*",
      ]),
    ).toBe(false)
    expect(
      matchesUrlPattern("http://127.0.0.1:5173/settings", [
        "*://127.0.0.1:5173/*",
      ]),
    ).toBe(true)
  })

  it("validates supported patterns and rejects malformed patterns", () => {
    expect(validateUrlPattern("*://*.github.com/*")).toBe(true)
    expect(validateUrlPattern("github.com")).toBe(true)
    expect(validateUrlPattern("*.github.com/*")).toBe(true)
    expect(validateUrlPattern("http://localhost:3000/*")).toBe(true)
    expect(validateUrlPattern("*://[::1]:3000/*")).toBe(true)

    expect(validateUrlPattern("")).toBe("Pattern cannot be empty")
    expect(validateUrlPattern("https://")).toBe("Pattern host cannot be empty")
    expect(validateUrlPattern("ftp://example.com/*")).toBe(
      "Pattern protocol must be http, https, or *",
    )
    expect(validateUrlPattern("https://exa mple.com/*")).toBe(
      "Pattern cannot contain whitespace",
    )
    expect(validateUrlPattern("://example.com")).toBe(
      "Pattern protocol is invalid",
    )
  })

  it("validates complete URL-rule values with field-specific errors", () => {
    expect(
      validateUrlRulesValue({
        allowUrls: ["*://*.example.com/*"],
        denyUrls: ["*://blocked.example.com/*"],
      }),
    ).toEqual({ valid: true })
    expect(
      validateUrlRulesValue({ allowUrls: ["ftp://example.com/*"] }),
    ).toEqual({
      valid: false,
      error:
        'Invalid allowUrls pattern "ftp://example.com/*": Pattern protocol must be http, https, or *',
    })
  })
})

describe("URL rule precedence", () => {
  it("allows commands with no current URL so new-tab contexts stay visible", async () => {
    const command = createTestCommand("only-github", {
      allowUrls: ["*://*.github.com/*"],
    })

    await expect(filterCommandsByUrl([command], "", {})).resolves.toEqual([
      command,
    ])
  })

  it("hides commands globally even when there is no current URL", async () => {
    const command = createTestCommand("globally-hidden")

    await expect(
      filterCommandsByUrl([command], "", {
        [command.id]: {
          hidden: true,
        },
      }),
    ).resolves.toEqual([])
  })

  it("applies command allow and deny rules, with command deny winning inside command rules", async () => {
    const command = createTestCommand("command-filtered", {
      allowUrls: ["*://*.example.com/*"],
      denyUrls: ["*://blocked.example.com/*"],
    })

    await expect(
      filterCommandsByUrl([command], "https://app.example.com/page", {}),
    ).resolves.toEqual([command])
    await expect(
      filterCommandsByUrl([command], "https://other.test/page", {}),
    ).resolves.toEqual([])
    await expect(
      filterCommandsByUrl([command], "https://blocked.example.com/page", {}),
    ).resolves.toEqual([])
  })

  it("lets user allow rules override command deny rules", async () => {
    const command = createTestCommand("user-allowed", {
      allowUrls: ["*://*.example.com/*"],
      denyUrls: ["*://blocked.example.com/*"],
    })
    const settings: Record<string, CommandSettings> = {
      [command.id]: {
        urlRules: {
          allowUrls: ["*://blocked.example.com/*"],
        },
      },
    }

    await expect(
      filterCommandsByUrl(
        [command],
        "https://blocked.example.com/page",
        settings,
      ),
    ).resolves.toEqual([command])
  })

  it("keeps user deny rules as the highest-precedence rule source", async () => {
    const command = createTestCommand("user-denied", {
      allowUrls: ["*://*.example.com/*"],
    })
    const settings: Record<string, CommandSettings> = {
      [command.id]: {
        urlRules: {
          allowUrls: ["*://app.example.com/*"],
          denyUrls: ["*://app.example.com/*"],
        },
      },
    }

    await expect(
      filterCommandsByUrl([command], "https://app.example.com/page", settings),
    ).resolves.toEqual([])
  })
})

describe("pattern regex caching", () => {
  it("returns consistent results for repeated matches of the same pattern", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(
        matchesUrlPattern("https://github.com/owner/repo", ["*.github.com/*"]),
      ).toBe(true)
      expect(
        matchesUrlPattern("https://example.com/", ["*.github.com/*"]),
      ).toBe(false)
    }
  })

  it("keeps matching correctly past the cache size cap", () => {
    // 600 distinct patterns exceed the 500-entry cap and exercise the flush
    // path; matching behavior must be unaffected.
    for (let i = 0; i < 600; i += 1) {
      expect(
        matchesUrlPattern(`https://site-${i}.com/`, [`site-${i}.com`]),
      ).toBe(true)
    }
    expect(
      matchesUrlPattern("https://github.com/owner", ["*.github.com/*"]),
    ).toBe(true)
  })

  it("does not let an empty pattern poison subsequent valid patterns", () => {
    expect(matchesUrlPattern("https://github.com/x", [""])).toBe(false)
    expect(matchesUrlPattern("https://github.com/x", ["github.com"])).toBe(true)
  })
})
