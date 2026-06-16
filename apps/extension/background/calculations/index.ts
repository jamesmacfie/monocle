import type { Browser, CalculationSuggestion } from "../../shared/types"
import { validateContentBlocks } from "../../shared/types"
import { mathProvider } from "./providers/math"
import { timeProvider } from "./providers/time"
import { unitsProvider } from "./providers/units"
import type { CalculationProvider } from "./types"

// The registered calculation providers. A sibling to background/features —
// each provider is data plus one pure parse function. New providers are added
// here. See docs/calculations.md.
const providers: CalculationProvider[] = [
  mathProvider,
  unitsProvider,
  timeProvider,
]

export const getCalculationProviders = (): CalculationProvider[] => providers

// Runs every provider against the raw query, collects the non-null results
// (ordered by descending priority), validates each result's content blocks,
// and maps them to ephemeral `calculation` suggestions ready to be prepended
// to root search results. Fail-quiet: a query no provider parses yields [].
export const runCalculationProviders = (
  query: string,
  context: Browser.Context,
): CalculationSuggestion[] => {
  if (!query.trim()) {
    return []
  }

  return providers
    .map((provider) => ({
      provider,
      result: safeParse(provider, query, context),
    }))
    .filter((entry) => entry.result !== null)
    .sort((a, b) => b.provider.priority - a.provider.priority)
    .flatMap(({ provider, result }) => {
      const content = validateContentBlocks(result!.content)
      if (!content) {
        return []
      }
      const suggestion: CalculationSuggestion = {
        type: "calculation",
        id: `calc:${provider.id}`,
        name: result!.title ?? provider.name,
        content,
        copyValue: result!.copyValue,
        icon: result!.icon,
        providerId: provider.id,
      }
      return [suggestion]
    })
}

// A provider's parse must never throw across the boundary; treat a throw as
// "did not parse".
const safeParse = (
  provider: CalculationProvider,
  query: string,
  context: Browser.Context,
) => {
  try {
    return provider.parse(query, context)
  } catch {
    return null
  }
}
