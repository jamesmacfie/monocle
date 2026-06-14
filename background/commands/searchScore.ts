// Pure scoring for background-owned palette search. No cmdk, no browser APIs.
//
// Name tiers: exact 1.0 -> prefix 0.9 -> word-boundary 0.75 -> substring 0.6
// -> fuzzy subsequence 0.4 * density.
// Rest fields (breadcrumb + keywords + description + keybinding) score the
// best of: prefix 0.4 / word-boundary 0.3 / substring 0.2 / subsequence 0.1.
// textual = min(1, name * 0.8 + rest * 0.2 + (namePrefix ? 0.1 : 0)) so name
// matches dominate, preserving the previous cmdk weighting.
// final = textual * sourceWeight * usageBoost. Usage is a tie-breaker, not a
// dominator: usageBoost = 1 + 0.15 * (1 - rank / rankedCount).

export type ScorableEntry = {
  id: string
  nameLower: string
  breadcrumbLower: string[]
  keywordsLower: string[]
  descriptionLower: string
  keybindingLower: string
  sourceWeight: number
  isFavorite: boolean
  // Optional build-time precomputation (production fast path). When present,
  // the scorer skips the per-keystroke regex split and field-array allocation.
  // `nameWords`/`restWords` hold word-start tokens; `restFields` is the
  // pre-combined list of non-empty rest field texts, aligned with `restWords`.
  // Entries created directly (e.g. tests) omit these and fall back to deriving
  // them on the fly. Build them with computeScorableTokens().
  nameWords?: string[]
  restFields?: string[]
  restWords?: string[][]
}

export type ScoredEntry<T extends ScorableEntry> = {
  entry: T
  score: number
  usageRank: number
}

// Returns the density (query length / matched span) of a greedy subsequence
// match, or null when the query is not a subsequence of the text. Density
// rewards tightly-clustered matches over ones scattered across the string, so
// the fuzzy tier ("gh" in "GitHub") doesn't outrank near-contiguous matches.
const subsequenceDensity = (text: string, query: string): number | null => {
  if (query.length === 0 || query.length > text.length) {
    return null
  }

  let first = -1
  let last = -1
  let searchFrom = 0

  for (const char of query) {
    const index = text.indexOf(char, searchFrom)
    if (index === -1) {
      return null
    }
    if (first === -1) {
      first = index
    }
    last = index
    searchFrom = index + 1
  }

  return query.length / (last - first + 1)
}

const WORD_SPLIT = /[^a-z0-9]+/

const splitWords = (text: string): string[] => text.split(WORD_SPLIT)

const hasWordBoundaryMatch = (words: string[], query: string): boolean => {
  for (const word of words) {
    if (word.length > 0 && word.startsWith(query)) {
      return true
    }
  }
  return false
}

// Precompute the token shapes the scorer needs so the per-keystroke path never
// allocates a combined field array or re-runs the word-split regex. Returns the
// fields ScorableEntry overlays; the index build spreads these onto each entry.
export type ScorableTokens = {
  nameWords: string[]
  restFields: string[]
  restWords: string[][]
}

export const computeScorableTokens = (
  fields: Pick<
    ScorableEntry,
    | "nameLower"
    | "breadcrumbLower"
    | "keywordsLower"
    | "descriptionLower"
    | "keybindingLower"
  >,
): ScorableTokens => {
  const restFields: string[] = []
  for (const text of [
    ...fields.breadcrumbLower,
    ...fields.keywordsLower,
    fields.descriptionLower,
    fields.keybindingLower,
  ]) {
    if (text.length > 0) {
      restFields.push(text)
    }
  }

  return {
    nameWords: splitWords(fields.nameLower),
    restFields,
    restWords: restFields.map(splitWords),
  }
}

type NameScore = {
  score: number
  isPrefix: boolean
}

const scoreName = (
  nameLower: string,
  nameWords: string[],
  queryLower: string,
): NameScore => {
  if (nameLower === queryLower) {
    return { score: 1, isPrefix: true }
  }

  if (nameLower.startsWith(queryLower)) {
    return { score: 0.9, isPrefix: true }
  }

  if (hasWordBoundaryMatch(nameWords, queryLower)) {
    return { score: 0.75, isPrefix: false }
  }

  if (nameLower.includes(queryLower)) {
    return { score: 0.6, isPrefix: false }
  }

  const density = subsequenceDensity(nameLower, queryLower)
  if (density !== null) {
    return { score: 0.4 * density, isPrefix: false }
  }

  return { score: 0, isPrefix: false }
}

// Max achievable rest-field score (prefix tier); lets scoreRest stop early.
const MAX_REST_SCORE = 0.4

const scoreRestField = (
  text: string,
  words: string[],
  queryLower: string,
): number => {
  if (text.length === 0) {
    return 0
  }

  if (text.startsWith(queryLower)) {
    return 0.4
  }

  if (hasWordBoundaryMatch(words, queryLower)) {
    return 0.3
  }

  if (text.includes(queryLower)) {
    return 0.2
  }

  if (subsequenceDensity(text, queryLower) !== null) {
    return 0.1
  }

  return 0
}

const scoreRest = (entry: ScorableEntry, queryLower: string): number => {
  // Fast path: precomputed fields/tokens. Fallback derives them inline for
  // entries constructed without computeScorableTokens (e.g. unit tests).
  const texts =
    entry.restFields ??
    [
      ...entry.breadcrumbLower,
      ...entry.keywordsLower,
      entry.descriptionLower,
      entry.keybindingLower,
    ].filter((text) => text.length > 0)
  const words = entry.restWords

  let best = 0
  for (let i = 0; i < texts.length; i++) {
    const score = scoreRestField(
      texts[i],
      words ? words[i] : splitWords(texts[i]),
      queryLower,
    )
    if (score > best) {
      best = score
      if (best === MAX_REST_SCORE) {
        break
      }
    }
  }

  return best
}

// Final score for one entry: a textual component (name dominant at 0.8, rest
// fields at 0.2, plus a small name-prefix bonus, capped at 1) multiplied by the
// entry's sourceWeight and a gentle usage boost (at most +15%, so frequently
// used commands edge ahead on ties without overriding a better text match).
// Returns 0 when nothing matches; callers should drop zero-score entries. The
// scorer is never called with an empty query. See docs/search-and-ranking.md.
export const scoreEntry = (
  entry: ScorableEntry,
  queryLower: string,
  usageRank: Map<string, number>,
): number => {
  const name = scoreName(
    entry.nameLower,
    entry.nameWords ?? splitWords(entry.nameLower),
    queryLower,
  )
  const rest = scoreRest(entry, queryLower)

  if (name.score === 0 && rest === 0) {
    return 0
  }

  const textual = Math.min(
    1,
    name.score * 0.8 + rest * 0.2 + (name.isPrefix ? 0.1 : 0),
  )

  const rank = usageRank.get(entry.id)
  const usageBoost =
    rank === undefined || usageRank.size === 0
      ? 1
      : 1 + 0.15 * (1 - rank / usageRank.size)

  return textual * entry.sourceWeight * usageBoost
}

// Score and sort entries with a deterministic tie-breaker chain so equal-score
// results have a stable order: score desc, then favorites first, then lower
// usage rank, then shorter name (more specific), then id (final stable key).
// Entries that don't match are dropped. See docs/search-and-ranking.md.
export const rankEntries = <T extends ScorableEntry>(
  entries: T[],
  queryLower: string,
  usageRank: Map<string, number>,
): Array<ScoredEntry<T>> => {
  const scored: Array<ScoredEntry<T>> = []

  for (const entry of entries) {
    const score = scoreEntry(entry, queryLower, usageRank)
    if (score > 0) {
      scored.push({
        entry,
        score,
        usageRank: usageRank.get(entry.id) ?? Number.MAX_SAFE_INTEGER,
      })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score
    }

    if (a.entry.isFavorite !== b.entry.isFavorite) {
      return a.entry.isFavorite ? -1 : 1
    }

    if (a.usageRank !== b.usageRank) {
      return a.usageRank - b.usageRank
    }

    if (a.entry.nameLower.length !== b.entry.nameLower.length) {
      return a.entry.nameLower.length - b.entry.nameLower.length
    }

    return a.entry.id.localeCompare(b.entry.id)
  })

  return scored
}
