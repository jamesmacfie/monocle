import { describe, expect, it } from "vitest"
import { rankEntries, type ScorableEntry, scoreEntry } from "./searchScore"

const makeEntry = (overrides: Partial<ScorableEntry> = {}): ScorableEntry => ({
  id: "test-command",
  nameLower: "test command",
  breadcrumbLower: [],
  keywordsLower: [],
  descriptionLower: "",
  keybindingLower: "",
  sourceWeight: 1,
  isFavorite: false,
  ...overrides,
})

const noUsage = new Map<string, number>()

describe("name tier ordering", () => {
  it("scores exact > prefix > word-boundary > substring > subsequence", () => {
    const exact = scoreEntry(makeEntry({ nameLower: "tabs" }), "tabs", noUsage)
    const prefix = scoreEntry(
      makeEntry({ nameLower: "tabs everywhere" }),
      "tabs",
      noUsage,
    )
    const wordBoundary = scoreEntry(
      makeEntry({ nameLower: "open tabs" }),
      "tabs",
      noUsage,
    )
    const substring = scoreEntry(
      makeEntry({ nameLower: "retabset" }),
      "tabs",
      noUsage,
    )
    const subsequence = scoreEntry(
      makeEntry({ nameLower: "toggle all bookmarks system" }),
      "tabs",
      noUsage,
    )

    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(wordBoundary)
    expect(wordBoundary).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(subsequence)
    expect(subsequence).toBeGreaterThan(0)
  })

  it("returns 0 when nothing matches", () => {
    expect(scoreEntry(makeEntry({ nameLower: "zzz" }), "tabs", noUsage)).toBe(0)
  })
})

describe("field weighting", () => {
  it("ranks name matches above keyword and description matches", () => {
    const nameMatch = scoreEntry(
      makeEntry({ nameLower: "open tabs" }),
      "tabs",
      noUsage,
    )
    const keywordMatch = scoreEntry(
      makeEntry({ nameLower: "window switcher", keywordsLower: ["tabs"] }),
      "tabs",
      noUsage,
    )
    const descriptionMatch = scoreEntry(
      makeEntry({
        nameLower: "window switcher",
        descriptionLower: "manage tabs across windows",
      }),
      "tabs",
      noUsage,
    )

    expect(nameMatch).toBeGreaterThan(keywordMatch)
    expect(nameMatch).toBeGreaterThan(descriptionMatch)
    expect(keywordMatch).toBeGreaterThan(0)
    expect(descriptionMatch).toBeGreaterThan(0)
  })

  it("matches breadcrumb and keybinding fields", () => {
    const breadcrumbMatch = scoreEntry(
      makeEntry({ nameLower: "pull requests", breadcrumbLower: ["github"] }),
      "github",
      noUsage,
    )
    const keybindingMatch = scoreEntry(
      makeEntry({ nameLower: "new tab", keybindingLower: "<cmd-t>" }),
      "cmd-t",
      noUsage,
    )

    expect(breadcrumbMatch).toBeGreaterThan(0)
    expect(keybindingMatch).toBeGreaterThan(0)
  })
})

describe("source weight", () => {
  it("demotes deep-search entries below equal root matches", () => {
    const root = makeEntry({ id: "root-item", nameLower: "example page" })
    const deepSearch = makeEntry({
      id: "history-item",
      nameLower: "example page",
      sourceWeight: 0.7,
    })

    const ranked = rankEntries([deepSearch, root], "example", noUsage)

    expect(ranked.map((scored) => scored.entry.id)).toEqual([
      "root-item",
      "history-item",
    ])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
})

describe("usage boost and tie-breaks", () => {
  it("boosts ranked commands without letting usage dominate name tiers", () => {
    const usageRank = new Map([["substring-match", 0]])

    const prefixUnused = scoreEntry(
      makeEntry({ id: "prefix-match", nameLower: "tabs everywhere" }),
      "tabs",
      usageRank,
    )
    const substringUsed = scoreEntry(
      makeEntry({ id: "substring-match", nameLower: "retabset" }),
      "tabs",
      usageRank,
    )

    expect(prefixUnused).toBeGreaterThan(substringUsed)
  })

  it("breaks score ties by favorite, then name length, then id", () => {
    const favorite = makeEntry({
      id: "favorite-command",
      nameLower: "same name",
      isFavorite: true,
    })
    const longer = makeEntry({ id: "a-longer", nameLower: "same names" })
    const alphaFirst = makeEntry({ id: "a-command", nameLower: "same name" })
    const alphaSecond = makeEntry({ id: "b-command", nameLower: "same name" })

    // All are prefix matches with identical textual scores except for the
    // tie-break dimensions under test
    const ranked = rankEntries(
      [alphaSecond, longer, alphaFirst, favorite],
      "same",
      noUsage,
    )

    expect(ranked.map((scored) => scored.entry.id)).toEqual([
      "favorite-command",
      "a-command",
      "b-command",
      "a-longer",
    ])
  })
})
