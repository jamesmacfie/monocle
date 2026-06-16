import type { Unit } from "mathjs"
import { evaluate, formatUnit, typeOf } from "../mathInstance"
import type { CalculationProvider } from "../types"

// Light aliasing for common informal unit names mathjs doesn't accept (e.g.
// "1 mile in kms", "14 pounds in kg"). Applied as whole-word replacements only
// inside a conversion query, so they never touch ordinary text. Kept
// deliberately small. ("ounces", "grams", "feet", "foot", "inch[es]" already
// resolve natively.)
const UNIT_ALIASES: Record<string, string> = {
  kms: "km",
  kgs: "kg",
  lbs: "lb",
  hrs: "hr",
  secs: "s",
  pounds: "lb",
  pound: "lb",
  st: "stone",
  stones: "stone",
}

const applyAliases = (query: string): string =>
  query.replace(/[a-z]+/gi, (word) => UNIT_ALIASES[word.toLowerCase()] ?? word)

// Normalize the source side of a conversion into a mathjs-evaluable expression,
// so the natural human notations for height and body weight work:
//   - foot/inch symbols: 5'10"  -> 5 ft 10 in   (straight and smart quotes)
//   - multi-unit phrases: 5 ft 10 in / 6 stone 4 lb -> sum with "+", which mathjs
//     requires (adjacent value-unit groups otherwise multiply and error).
const normalizeSource = (source: string): string => {
  const withFeetInches = source
    .replace(/([\d.]+)\s*[′']/g, "$1 ft ")
    .replace(/([\d.]+)\s*[″"]/g, "$1 in ")
  const withCompound = applyAliases(withFeetInches).replace(
    /([a-z])\s+([\d.])/gi,
    "$1 + $2",
  )
  return withCompound.trim()
}

export const unitsProvider: CalculationProvider = {
  id: "units",
  name: "Units",
  priority: 90,
  parse(query) {
    const trimmed = query.trim()
    // Only attempt conversions of the shape "<expr> in|to <unit>". Split on the
    // LAST keyword (greedy ".*"), so a trailing inch "in" on the source side is
    // never mistaken for the conversion keyword; we always re-join with "to".
    const match = trimmed.match(/^(.*)\s(?:in|to)\s(.+)$/i)
    if (!match) {
      return null
    }

    const [, sourcePart, targetPart] = match
    let result: unknown
    try {
      result = evaluate(
        `${normalizeSource(sourcePart)} to ${applyAliases(targetPart).trim()}`,
      )
    } catch {
      return null
    }

    if (!result || typeOf(result) !== "Unit") {
      return null
    }

    const value = formatUnit(result as Unit)
    // Show the source side as the user typed it ("5'10\"") mapped to the result.
    return {
      content: [
        { type: "keyValue", rows: [{ label: sourcePart.trim(), value }] },
      ],
      copyValue: value,
      icon: { type: "lucide", name: "ArrowRight" },
    }
  },
}
