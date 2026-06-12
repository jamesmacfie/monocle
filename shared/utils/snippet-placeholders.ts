// Snippet body placeholder interpolation. Runs background-side at insert
// time so the inserted text, the cmd-copy path, and the clipboard fallback
// all carry the same resolved result.
//
// Grammar: `{name}` or `{date:FORMAT}` where FORMAT is any date-fns format
// string (https://date-fns.org/docs/format). Unknown tokens and invalid date
// formats pass through untouched, so literal braces in a body are safe.
import { format } from "date-fns"

export type SnippetPlaceholderContext = {
  url?: string
  title?: string
  // The value substituted for {i}. The caller owns persistence — every {i}
  // occurrence in one insertion renders the same value.
  counter?: number
  // Injectable for tests.
  now?: Date
  uuid?: () => string
}

export type SnippetInterpolationResult = {
  text: string
  // True when the body referenced {i}; the caller bumps the stored counter
  // only for insertions that actually use it.
  usedCounter: boolean
}

const PLACEHOLDER_PATTERN = /\{([a-zA-Z]+)(?::([^}]+))?\}/g

const safeUrlPart = (
  url: string | undefined,
  part: (parsed: URL) => string,
): string => {
  if (!url) return ""
  try {
    return part(new URL(url))
  } catch {
    return ""
  }
}

const safeDateFormat = (now: Date, formatString: string): string | null => {
  try {
    return format(now, formatString)
  } catch {
    // Invalid date-fns format: leave the token as-is.
    return null
  }
}

// True when the body references the {i} counter placeholder.
export function snippetBodyUsesCounter(body: string): boolean {
  return /\{i\}/.test(body)
}

export function interpolateSnippetBody(
  body: string,
  context: SnippetPlaceholderContext = {},
): SnippetInterpolationResult {
  const now = context.now ?? new Date()
  const uuid = context.uuid ?? (() => crypto.randomUUID())
  let usedCounter = false

  const text = body.replace(
    PLACEHOLDER_PATTERN,
    (token, name: string, argument: string | undefined) => {
      switch (name) {
        case "date":
          return safeDateFormat(now, argument ?? "PP") ?? token
        case "time":
          return safeDateFormat(now, argument ?? "p") ?? token
        case "datetime":
          return safeDateFormat(now, argument ?? "PPp") ?? token
        case "timestamp":
          return String(now.getTime())
        case "url":
          return context.url ?? ""
        case "title":
          return context.title ?? ""
        case "domain":
          return safeUrlPart(context.url, (parsed) => parsed.hostname)
        case "path":
          return safeUrlPart(context.url, (parsed) => parsed.pathname)
        case "uuid":
          return uuid()
        case "i":
          usedCounter = true
          return String(context.counter ?? 1)
        default:
          // Unknown token: pass through untouched.
          return token
      }
    },
  )

  return { text, usedCounter }
}

// One-line summary for UI helper text near snippet body editors.
export const SNIPPET_PLACEHOLDERS_HINT =
  "Placeholders: {date:yyyy-MM-dd} (any date-fns format), {date}, {time}, {datetime}, {timestamp}, {url}, {title}, {domain}, {path}, {uuid}, {i} (incrementing counter)"
