import { describe, expect, it } from "vitest"
import { isUrlBlocked } from "./block"
import { focusFeature } from "./index"
import { isSessionActive, remainingMs } from "./session"
import { projectFocusSurfaces } from "./surfaces"
import type { FocusConfig, FocusSession } from "./types"

const config = (patterns: string[]): FocusConfig => ({
  blockedUrlPatterns: patterns,
  defaultDurationMinutes: 25,
})

describe("isUrlBlocked", () => {
  it("matches wildcard subdomain patterns", () => {
    expect(
      isUrlBlocked(
        "https://www.youtube.com/watch",
        config(["*://*.youtube.com/*"]),
      ),
    ).toBe(true)
  })

  it("matches bare-domain patterns", () => {
    expect(isUrlBlocked("https://reddit.com/", config(["reddit.com"]))).toBe(
      true,
    )
  })

  it("does not block non-matching URLs", () => {
    expect(
      isUrlBlocked("https://example.com", config(["*://*.youtube.com/*"])),
    ).toBe(false)
  })

  it("never blocks with an empty blocklist", () => {
    expect(isUrlBlocked("https://youtube.com", config([]))).toBe(false)
  })
})

describe("session timing (pure)", () => {
  const now = 1_000_000

  it("treats an indefinite session as always active", () => {
    const session: FocusSession = { startedAt: now, mode: "indefinite" }
    expect(isSessionActive(session, now + 10_000_000)).toBe(true)
    expect(remainingMs(session, now)).toBeNull()
  })

  it("treats a timed session as active until endsAt", () => {
    const session: FocusSession = {
      startedAt: now,
      endsAt: now + 60_000,
      mode: "timed",
    }
    expect(isSessionActive(session, now + 30_000)).toBe(true)
    expect(remainingMs(session, now + 30_000)).toBe(30_000)
    expect(isSessionActive(session, now + 60_001)).toBe(false)
    expect(remainingMs(session, now + 120_000)).toBe(0)
  })

  it("treats no session as inactive", () => {
    expect(isSessionActive(null, now)).toBe(false)
    expect(remainingMs(null, now)).toBeNull()
  })
})

describe("focus config schema", () => {
  const schema = focusFeature.settings?.configSchema

  it("accepts a valid config", () => {
    expect(
      schema?.safeParse({
        blockedUrlPatterns: ["*://*.youtube.com/*", "reddit.com"],
        defaultDurationMinutes: 25,
      }).success,
    ).toBe(true)
  })

  it("rejects an invalid URL pattern", () => {
    expect(
      schema?.safeParse({
        blockedUrlPatterns: ["not a url with spaces"],
        defaultDurationMinutes: 25,
      }).success,
    ).toBe(false)
  })

  it("rejects an out-of-range duration", () => {
    expect(
      schema?.safeParse({
        blockedUrlPatterns: [],
        defaultDurationMinutes: 0,
      }).success,
    ).toBe(false)
  })
})

describe("projectFocusSurfaces", () => {
  const session: FocusSession = {
    startedAt: 1000,
    endsAt: 61000,
    mode: "timed",
  }

  it("projects a blocking overlay scoped to the blocklist plus a badge", () => {
    const surfaces = projectFocusSurfaces(session, config(["reddit.com"]))
    const overlay = surfaces.find((s) => s.kind === "overlay")
    const badge = surfaces.find((s) => s.kind === "badge")

    expect(overlay?.blocking).toBe(true)
    expect(overlay?.urlMatch?.allowUrls).toEqual(["reddit.com"])
    expect(overlay?.content.countdownTo).toBe(61000)
    expect(badge?.content.countdownTo).toBe(61000)
  })

  it("emits only a badge when the blocklist is empty", () => {
    const surfaces = projectFocusSurfaces(session, config([]))
    expect(surfaces.map((s) => s.kind)).toEqual(["badge"])
  })
})
