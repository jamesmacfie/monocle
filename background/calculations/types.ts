import type { Browser, CommandIcon, ContentBlock } from "../../shared/types"

// The result a provider returns when it can parse a query. `content` is what
// the user sees (structured, rendered in the row); `copyValue` is the plain
// text Enter puts on the clipboard. They are deliberately separate so a rich
// display never dictates a messy clipboard string.
export type CalculationResult = {
  content: ContentBlock[]
  copyValue: string
  icon?: CommandIcon
  title?: string
}

// A calculation provider is data plus one pure function. `parse` is
// synchronous, local, and side-effect-free: no network, no permissions, no
// await. It returns null when it cannot parse the query (the common case) and
// a result when it can. Higher `priority` wins ordering when several providers
// match. See docs/v_next/11-calculations.md.
export type CalculationProvider = {
  id: string
  name: string
  priority: number
  parse: (query: string, context: Browser.Context) => CalculationResult | null
}
